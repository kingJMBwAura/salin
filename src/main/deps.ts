/**
 * External dependency probing.
 *
 * An app launched from Finder or Explorer does not inherit a login shell's
 * PATH, so `ffmpeg` is invisible unless the directories it actually lives in
 * are added explicitly. Every spawn in this app uses `spawnEnv()`.
 *
 * This is the difference between an app that works under `npm run dev` and one
 * that works when you double-click it.
 */

import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { existsSync } from 'node:fs'
import { delimiter, join } from 'node:path'
import { homedir } from 'node:os'
import type { Capabilities, DepStatus } from '../shared/types'

const run = promisify(execFile)

const IS_WINDOWS = process.platform === 'win32'

/** Where ffmpeg actually gets installed, per platform. */
const EXTRA_PATHS = IS_WINDOWS
  ? [
      join(homedir(), 'AppData', 'Local', 'Microsoft', 'WindowsApps'),
      join(homedir(), 'scoop', 'shims'),
      'C:\\ProgramData\\chocolatey\\bin',
      'C:\\Program Files\\ffmpeg\\bin',
      'C:\\Windows\\System32'
    ]
  : [
      '/opt/homebrew/bin',
      '/opt/homebrew/sbin',
      '/usr/local/bin',
      '/usr/bin',
      '/bin',
      join(homedir(), '.local', 'bin')
    ]

export function spawnEnv(): NodeJS.ProcessEnv {
  const current = (process.env.PATH ?? '').split(delimiter).filter(Boolean)
  const merged = [...new Set([...current, ...EXTRA_PATHS])]
  return { ...process.env, PATH: merged.join(delimiter) }
}

/** Absolute path of a binary, or empty string when it isn't installed. */
export async function which(binary: string): Promise<string> {
  try {
    // Windows has no `which`; `where` is the equivalent and prints one path
    // per line. It is a shell builtin lookup, hence shell: true.
    const [cmd, args] = IS_WINDOWS ? ['where', [binary]] : ['/usr/bin/which', [binary]]
    const { stdout } = await run(cmd, args, { env: spawnEnv(), shell: IS_WINDOWS })
    return stdout.trim().split('\n')[0].trim()
  } catch {
    // `which` doesn't see everything; check the usual spots directly too.
    for (const dir of EXTRA_PATHS) {
      for (const name of IS_WINDOWS ? [`${binary}.exe`, `${binary}.cmd`, binary] : [binary]) {
        const candidate = join(dir, name)
        if (existsSync(candidate)) return candidate
      }
    }
    return ''
  }
}

/** How to install ffmpeg, in the words of the platform's own package manager. */
export const FFMPEG_FIX = IS_WINDOWS ? 'winget install Gyan.FFmpeg' : 'brew install ffmpeg'

/**
 * Resolve a required binary or explain how to install it.
 *
 * The install command goes in the error itself so the failure a user sees on
 * the job is actionable rather than "spawn ffmpeg ENOENT".
 */
export async function requireBinary(binary: string): Promise<string> {
  const path = await which(binary)
  if (!path) throw new Error(`${binary} is not installed. Run: ${FFMPEG_FIX}`)
  return path
}

async function version(binary: string, args: string[]): Promise<string> {
  try {
    const { stdout, stderr } = await run(binary, args, { env: spawnEnv(), timeout: 8000 })
    return (stdout || stderr).split('\n')[0].trim()
  } catch {
    return ''
  }
}

async function probe(binary: string): Promise<DepStatus> {
  const path = await which(binary)
  return {
    name: binary,
    found: path !== '',
    path,
    version: path ? await version(path, ['-version']) : '',
    fix: FFMPEG_FIX
  }
}

/**
 * What this particular ffmpeg build can do.
 *
 * ffmpeg is not one program but a hundred build configurations, and the one
 * that bites here is libass: without it there is no `subtitles` filter and text
 * subtitles cannot be drawn onto the picture. Homebrew's current ffmpeg is
 * built that way, so this is the ordinary case, not an exotic one — better to
 * grey the option out with a reason than to fail a job ten minutes in.
 */
export async function probeCapabilities(): Promise<Capabilities> {
  try {
    const ffmpeg = await requireBinary('ffmpeg')
    const { stdout } = await run(ffmpeg, ['-hide_banner', '-filters'], {
      env: spawnEnv(),
      timeout: 8000,
      maxBuffer: 1 << 22
    })
    // Lines look like " T.C subtitles  S->V  Render text subtitles onto input."
    return { burnText: /^\s*\S+\s+subtitles\s/m.test(stdout) }
  } catch {
    return { burnText: false }
  }
}

/** ffmpeg and ffprobe ship together, but check both — a partial install happens. */
export async function probeDependencies(): Promise<DepStatus[]> {
  return Promise.all([probe('ffmpeg'), probe('ffprobe')])
}
