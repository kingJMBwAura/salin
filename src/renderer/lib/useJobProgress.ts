import { useEffect, useState } from 'react'
import type { JobProgress } from '@shared/types'
import { api } from './api'

/**
 * Live progress for every job, keyed by id.
 *
 * The main process broadcasts one channel for all jobs, so the map is built
 * here once and read by whichever rows care. Records on disk stay the source of
 * truth for everything except the number currently in flight.
 */
export function useJobProgress(
  onFinish?: (progress: JobProgress) => void
): Record<string, JobProgress> {
  const [progress, setProgress] = useState<Record<string, JobProgress>>({})

  useEffect(
    () =>
      api.jobs.onProgress((update) => {
        setProgress((current) => ({ ...current, [update.id]: update }))
        if (update.status !== 'queued' && update.status !== 'running') onFinish?.(update)
      }),
    [onFinish]
  )

  return progress
}
