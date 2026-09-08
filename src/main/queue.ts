/**
 * The conversion queue, one job at a time.
 *
 * Serialised on purpose: ffmpeg already saturates every core on a single
 * encode, so running two would finish both later while making the progress
 * bars lie. Queueing here means nothing else in the app has to think about it.
 */

import { rm } from 'node:fs/promises'
import type { JobProgress } from '../shared/types'
import { CancelledError, cancel as cancelConversion, convert } from './convert'
import { getSettings } from './settings'
import * as store from './store'

type Emit = (progress: JobProgress) => void

const queue: string[] = []
let draining = false
let emit: Emit = () => {}

export function setEmitter(fn: Emit): void {
  emit = fn
}

async function runJob(id: string): Promise<void> {
  const job = await store.get(id)
  // Cancelled while it sat in the queue.
  if (!job || job.status !== 'queued') return

  await store.update(id, { status: 'running', progress: 0, error: '' })
  emit({ id, status: 'running', progress: 0, speed: 0, etaSec: 0 })

  try {
    let lastPublished = -1
    const result = await convert({
      id,
      info: job.info,
      options: job.options,
      outputPath: job.outputPath,
      onProgress: ({ percent, speed, etaSec }) => {
        // ffmpeg ticks several times a second; writing the JSON record that
        // often would be pure churn, so only the number in flight is sent and
        // only when the rounded percentage actually moves.
        const rounded = Math.round(percent)
        if (rounded === lastPublished) return
        lastPublished = rounded
        emit({ id, status: 'running', progress: rounded, speed, etaSec })
      }
    })

    if (getSettings().deleteSourceOnSuccess) {
      // Deliberately after the output exists and has been renamed into place:
      // the source is the irreplaceable file.
      await rm(job.info.path, { force: true })
    }

    await store.update(id, {
      status: 'done',
      progress: 100,
      outputBytes: result.outputBytes,
      elapsedSec: result.elapsedSec,
      error: ''
    })
    emit({
      id,
      status: 'done',
      progress: 100,
      speed: 0,
      etaSec: 0,
      outputPath: result.outputPath,
      outputBytes: result.outputBytes,
      elapsedSec: result.elapsedSec
    })
  } catch (error) {
    const cancelled = error instanceof CancelledError
    const message = cancelled ? '' : error instanceof Error ? error.message : String(error)
    await store.update(id, {
      status: cancelled ? 'cancelled' : 'error',
      progress: 0,
      error: message
    })
    emit({
      id,
      status: cancelled ? 'cancelled' : 'error',
      progress: 0,
      speed: 0,
      etaSec: 0,
      error: message
    })
  }
}

async function drain(): Promise<void> {
  if (draining) return
  draining = true
  try {
    while (queue.length) {
      await runJob(queue.shift() as string)
    }
  } finally {
    draining = false
  }
}

export function enqueue(id: string): void {
  queue.push(id)
  emit({ id, status: 'queued', progress: 0, speed: 0, etaSec: 0 })
  void drain()
}

/**
 * Stop a job, whether it is running or still waiting.
 *
 * A queued job never reaches ffmpeg, so it is marked here; a running one is
 * killed and reports its own cancellation from `runJob`.
 */
export async function cancel(id: string): Promise<boolean> {
  if (cancelConversion(id)) return true

  const waiting = queue.indexOf(id)
  if (waiting === -1) return false
  queue.splice(waiting, 1)
  await store.update(id, { status: 'cancelled', progress: 0, error: '' })
  emit({ id, status: 'cancelled', progress: 0, speed: 0, etaSec: 0 })
  return true
}
