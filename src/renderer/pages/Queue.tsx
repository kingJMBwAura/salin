import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import type { Job } from '@shared/types'
import { api } from '../lib/api'
import { useJobProgress } from '../lib/useJobProgress'
import EmptyState from '../components/EmptyState'
import JobRow from '../components/JobRow'
import PageHeader from '../components/PageHeader'
import { Icon } from '../components/icons'

export default function Queue(): JSX.Element {
  const navigate = useNavigate()
  const [jobs, setJobs] = useState<Job[]>([])
  const [loaded, setLoaded] = useState(false)
  const [error, setError] = useState('')

  const refresh = useCallback(async () => {
    setJobs(await api.jobs.list())
    setLoaded(true)
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  // Progress arrives on an event channel; the record on disk only catches up
  // when a job changes stage, so re-read it whenever one finishes.
  const live = useJobProgress(useCallback(() => void refresh(), [refresh]))

  const act = useCallback(
    async (run: () => Promise<unknown>) => {
      setError('')
      try {
        await run()
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : String(caught))
      }
      await refresh()
    },
    [refresh]
  )

  const active = jobs.filter((job) => job.status === 'running' || job.status === 'queued')
  const finished = jobs.filter((job) => job.status !== 'running' && job.status !== 'queued')

  if (!loaded) return <div className="text-sm text-muted">Loading…</div>

  return (
    <>
      <PageHeader
        eyebrow="Queue"
        title="What Salin is working on"
        description="One conversion at a time — ffmpeg already uses every core on a single job, so running two would only make both finish later."
        actions={
          finished.length > 0 ? (
            <button
              type="button"
              onClick={() => void act(() => api.jobs.clearFinished())}
              className="btn-quiet"
              title="Clears the list. Your converted files stay where they are."
            >
              <Icon.Trash width={15} height={15} />
              Clear finished
            </button>
          ) : undefined
        }
      />

      {error && (
        <div className="mb-5 flex items-start gap-2 rounded-md border border-flare/30 bg-flare/10 px-4 py-3 text-sm text-flare">
          <Icon.Alert width={16} height={16} className="mt-0.5 shrink-0" />
          <p>{error}</p>
        </div>
      )}

      {jobs.length === 0 ? (
        <EmptyState
          icon={Icon.Queue}
          title="Nothing in the queue"
          action={
            <button type="button" onClick={() => navigate('/')} className="btn-primary">
              Add files
            </button>
          }
        >
          Converted files land wherever you told Salin to put them, and finished
          jobs stay listed here so you can find them again.
        </EmptyState>
      ) : (
        <div className="space-y-6">
          {active.length > 0 && (
            <section className="space-y-4">
              <div className="eyebrow">In progress</div>
              {active.map((job) => (
                <JobRow
                  key={job.id}
                  job={job}
                  live={live[job.id]}
                  onCancel={() => void act(() => api.jobs.cancel(job.id))}
                  onRetry={() => void act(() => api.jobs.retry(job.id))}
                  onReveal={() => void api.jobs.reveal(job.id)}
                  onOpen={() => void api.jobs.open(job.id)}
                  onRemove={() => void act(() => api.jobs.remove(job.id))}
                />
              ))}
            </section>
          )}

          {finished.length > 0 && (
            <section className="space-y-4">
              <div className="eyebrow">Finished</div>
              {finished.map((job) => (
                <JobRow
                  key={job.id}
                  job={job}
                  live={live[job.id]}
                  onCancel={() => void act(() => api.jobs.cancel(job.id))}
                  onRetry={() => void act(() => api.jobs.retry(job.id))}
                  onReveal={() => void api.jobs.reveal(job.id)}
                  onOpen={() =>
                    void api.jobs.open(job.id).then((message) => {
                      if (message) setError(message)
                    })
                  }
                  onRemove={() => void act(() => api.jobs.remove(job.id))}
                />
              ))}
            </section>
          )}
        </div>
      )}
    </>
  )
}
