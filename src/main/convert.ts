/**
 * Running ffmpeg: progress, cancellation, and never leaving a broken file behind.
 *
 * `spawn` rather than `execFile` because a conversion runs for minutes and has
 * to be both watchable and stoppable. ffmpeg's `-progress` stream is the
 * machine-readable one — the usual stderr status line is designed for a
 * terminal and changes shape between builds.
 */

import { spawn } from 'node:child_process'
import { existsSync, statSync } from 'node:fs'
import { rename, rm } from 'node:fs/promises'
import { basename, dirname, extname, join } from 'node:path'
import type { JobOptions, MediaInfo } from '../shared/types'
import { probeCapabilities, requireBinary, spawnEnv } from './deps'
import { buildArgs } from '../shared/plan'

export interface ConvertProgress {
  /** 0–100. */
  percent: number
  /** Multiple of real time, as ffmpeg reports it. 0 until the first tick. */
  speed: number
  /** Seconds remaining, or 0 when there isn't enough information yet. */
  etaSec: number
}

export interface ConvertResult {
  outputPath: string
  outputBytes: number
  elapsedSec: number
}

export class CancelledError extends Error {
  constructor() {
    super('Cancelled.')
    this.name = 'CancelledError'
  }
}

interface Running {
  kill: () => void
  cancelled: boolean
}

const running = new Map<string, Running>()

/**
 * A free path next to the one asked for.
 *
 * Overwriting silently is the one thing a converter must never do: the source
 * and the output can be the same name in the same folder, and the source is
 * the irreplaceable one.
 */
export function uniqueOutputPath(path: string): string {
  if (!existsSync(path)) return path
  const dir = dirname(path)
  const ext = extname(path)
  const stem = basename(path, ext)
  for (let n = 1; n < 1000; n += 1) {
    const candidate = join(dir, `${stem} (${n})${ext}`)
    if (!existsSync(candidate)) return candidate
  }
  return join(dir, `${stem} (${Date.now()})${ext}`)
}

/**
 * Parse one `key=value` line of ffmpeg's `-progress` output.
 *
 * `out_time_us` is microseconds. `out_time_ms` claims milliseconds in the
 * option name and has always been microseconds in practice, so it is only read
 * as a fallback and treated the same way.
 */
function parseProgressLine(line: string, into: Record<string, string>): void {
  const eq = line.indexOf('=')
  if (eq <= 0) return
  into[line.slice(0, eq).trim()] = line.slice(eq + 1).trim()
}

/** Run one conversion to completion. Rejects with CancelledError when stopped. */
export async function convert(args: {
  id: string
  info: MediaInfo
  options: JobOptions
  outputPath: string
  onProgress: (progress: ConvertProgress) => void
}): Promise<ConvertResult> {
  const ffmpeg = await requireBinary('ffmpeg')
  const { id, info, options, outputPath, onProgress } = args

  // Written to a sidecar and renamed on success, so a crash, a cancel or a
  // pulled power cable can't leave something that looks like a finished file.
  const partPath = `${outputPath}.part`
  await rm(partPath, { force: true })

  const argv = buildArgs(info, options, info.path, partPath, await probeCapabilities())
  // Global options, so they can go anywhere before the output.
  argv.splice(1, 0, '-nostdin', '-progress', 'pipe:1', '-nostats')

  const startedAt = Date.now()

  return new Promise<ConvertResult>((resolve, reject) => {
    const child = spawn(ffmpeg, argv, { env: spawnEnv(), stdio: ['ignore', 'pipe', 'pipe'] })

    let killTimer: NodeJS.Timeout | null = null
    const entry: Running = {
      cancelled: false,
      kill: () => {
        entry.cancelled = true
        child.kill('SIGTERM')
        // ffmpeg normally exits promptly on SIGTERM; if it is wedged in a
        // filter or a slow read, stop waiting for it to be polite.
        killTimer = setTimeout(() => child.kill('SIGKILL'), 3000)
      }
    }
    running.set(id, entry)

    const fields: Record<string, string> = {}
    let stdoutBuffer = ''
    child.stdout.setEncoding('utf8')
    child.stdout.on('data', (chunk: string) => {
      stdoutBuffer += chunk
      const lines = stdoutBuffer.split('\n')
      stdoutBuffer = lines.pop() ?? ''
      for (const line of lines) parseProgressLine(line, fields)
      if (!('progress' in fields)) return

      const micros = Number(fields.out_time_us ?? fields.out_time_ms ?? 0)
      const seconds = Number.isFinite(micros) ? micros / 1_000_000 : 0
      const speed = Number.parseFloat(fields.speed ?? '') || 0
      const percent = info.durationSec
        ? Math.min(99.5, Math.max(0, (seconds / info.durationSec) * 100))
        : 0
      const remaining = Math.max(0, info.durationSec - seconds)
      onProgress({
        percent,
        speed,
        etaSec: speed > 0 && info.durationSec ? Math.round(remaining / speed) : 0
      })
    })

    // Kept so a failure can quote ffmpeg's own words; its diagnosis of a bad
    // file is always better than "conversion failed".
    const errorLines: string[] = []
    child.stderr.setEncoding('utf8')
    child.stderr.on('data', (chunk: string) => {
      for (const line of chunk.split('\n')) {
        const trimmed = line.trim()
        if (!trimmed) continue
        errorLines.push(trimmed)
        if (errorLines.length > 20) errorLines.shift()
      }
    })

    const finish = (): void => {
      if (killTimer) clearTimeout(killTimer)
      running.delete(id)
    }

    /**
     * Reject only once the half-written file is actually gone.
     *
     * Awaited rather than fired and forgotten: a cancelled job that resolves
     * before the unlink lands can leave a `.part` sidecar sitting next to the
     * user's video, and the next run would have to guess whether it mattered.
     */
    const failWith = (error: Error): void => {
      void rm(partPath, { force: true }).finally(() => reject(error))
    }

    child.on('error', (error) => {
      finish()
      failWith(new Error(`ffmpeg could not start: ${error.message}`))
    })

    child.on('close', (code) => {
      const wasCancelled = entry.cancelled
      finish()

      if (wasCancelled) {
        failWith(new CancelledError())
        return
      }
      if (code !== 0) {
        const tail = errorLines.slice(-6).join('\n')
        failWith(
          new Error(
            `ffmpeg could not convert ${basename(info.path)}${tail ? `:\n${tail}` : ` (exit ${code}).`}`
          )
        )
        return
      }

      rename(partPath, outputPath)
        .then(() => {
          resolve({
            outputPath,
            outputBytes: statSync(outputPath).size,
            elapsedSec: Math.round((Date.now() - startedAt) / 1000)
          })
        })
        .catch((error: Error) => failWith(new Error(`Could not save the output: ${error.message}`)))
    })
  })
}

/** Stop a running conversion. Returns false when that job isn't running. */
export function cancel(id: string): boolean {
  const entry = running.get(id)
  if (!entry) return false
  entry.kill()
  return true
}

export function isRunning(id: string): boolean {
  return running.has(id)
}
