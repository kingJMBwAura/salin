/**
 * Job persistence: one JSON file per job.
 *
 * Files rather than a database on purpose. Jobs are small, single-user and read
 * a handful at a time, so a folder scan is fast — and it keeps the build free
 * of a native module that would need rebuilding against Electron's ABI.
 */

import { randomUUID } from 'node:crypto'
import { existsSync } from 'node:fs'
import { mkdir, readdir, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { ConversionPlan, Job, JobOptions, MediaInfo } from '../shared/types'
import { jobsDir } from './paths'

function nowIso(): string {
  return new Date().toISOString()
}

export function newId(): string {
  return randomUUID().replace(/-/g, '')
}

function fileFor(id: string): string {
  return join(jobsDir(), `${id}.json`)
}

/**
 * Write to a temp file and rename.
 *
 * rename is atomic within a filesystem, so a crash mid-write can never leave a
 * half-written record that fails to parse on next launch.
 */
async function writeAtomic(path: string, data: string): Promise<void> {
  const temp = `${path}.tmp`
  await writeFile(temp, data, 'utf8')
  await rename(temp, path)
}

export async function save(job: Job): Promise<Job> {
  await mkdir(jobsDir(), { recursive: true })
  const next = { ...job, updatedAt: nowIso() }
  await writeAtomic(fileFor(job.id), JSON.stringify(next, null, 2))
  return next
}

/**
 * Fill in fields added after a record was written.
 *
 * A file written by an older build genuinely lacks keys that code downstream
 * reads unconditionally; normalising here means every consumer sees one shape.
 */
function normalise(raw: Partial<Job> & { id: string }): Job {
  return {
    progress: 0,
    error: '',
    outputPath: '',
    outputBytes: 0,
    elapsedSec: 0,
    ...raw,
    info: {
      audio: [],
      subtitles: [],
      video: null,
      ...(raw.info ?? {})
    }
  } as Job
}

export async function get(id: string): Promise<Job | null> {
  try {
    const raw = JSON.parse(await readFile(fileFor(id), 'utf8')) as Partial<Job> & { id: string }
    return normalise(raw)
  } catch {
    return null
  }
}

export async function create(args: {
  info: MediaInfo
  options: JobOptions
  plan: ConversionPlan
  outputPath: string
}): Promise<Job> {
  const timestamp = nowIso()
  return save({
    id: newId(),
    status: 'queued',
    progress: 0,
    error: '',
    createdAt: timestamp,
    updatedAt: timestamp,
    info: args.info,
    options: args.options,
    plan: args.plan,
    outputPath: args.outputPath,
    outputBytes: 0,
    elapsedSec: 0
  })
}

export async function update(id: string, patch: Partial<Job>): Promise<Job | null> {
  const current = await get(id)
  if (!current) return null
  return save({ ...current, ...patch, id: current.id })
}

async function readAll(): Promise<Job[]> {
  let names: string[]
  try {
    names = await readdir(jobsDir())
  } catch {
    return []
  }
  const records = await Promise.all(
    names.filter((n) => n.endsWith('.json')).map((n) => get(n.replace(/\.json$/, '')))
  )
  return records.filter((r): r is Job => r !== null)
}

/** Newest first. */
export async function list(): Promise<Job[]> {
  return (await readAll()).sort((a, b) => b.createdAt.localeCompare(a.createdAt))
}

export async function remove(id: string): Promise<boolean> {
  if (!existsSync(fileFor(id))) return false
  // Only the record goes; the converted file is the user's and lives wherever
  // they asked for it.
  await rm(fileFor(id), { force: true })
  return true
}

/** Forget every finished job. Nothing on disk outside the app is touched. */
export async function clearFinished(): Promise<number> {
  const finished = (await readAll()).filter(
    (job) => job.status === 'done' || job.status === 'error' || job.status === 'cancelled'
  )
  for (const job of finished) await remove(job.id)
  return finished.length
}

/**
 * Mark jobs left mid-flight by a quit or crash as failed.
 *
 * Without this a killed process leaves a job stuck on 'running', showing a
 * progress bar that will never move again.
 */
export async function failInterrupted(): Promise<number> {
  const stale = (await readAll()).filter(
    (job) => job.status === 'queued' || job.status === 'running'
  )
  for (const job of stale) {
    await save({
      ...job,
      status: 'error',
      progress: 0,
      error: 'Interrupted — Salin was closed while this conversion was running.'
    })
  }
  return stale.length
}
