import type { Job, JobProgress } from '@shared/types'
import { bytes, countdown, duration, folderOf, relativeDate, sizeDelta } from '../lib/format'
import { Icon } from './icons'
import PipelineTrace from './PipelineTrace'
import StatusPill from './StatusPill'

export default function JobRow({
  job,
  live,
  onCancel,
  onRetry,
  onReveal,
  onOpen,
  onRemove
}: {
  job: Job
  live: JobProgress | undefined
  onCancel: () => void
  onRetry: () => void
  onReveal: () => void
  onOpen: () => void
  onRemove: () => void
}): JSX.Element {
  // The live event is ahead of the record on disk, which is only written at
  // each stage change; prefer it whenever it exists.
  const status = live?.status ?? job.status
  const progress = live?.progress ?? job.progress
  const running = status === 'running'
  const done = status === 'done'
  const failed = status === 'error'
  // ffmpeg emits nothing until it has read enough to start; showing 0% for
  // those first seconds reads as stuck, so shimmer instead.
  const indeterminate = running && progress === 0
  const outputName = job.outputPath.split(/[\\/]/).pop() ?? ''

  return (
    <div className="card p-5">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="truncate text-[15px] text-text" title={job.info.path}>
            {job.info.filename}
          </div>
          <div className="mt-1.5 truncate font-mono text-[11px] text-faint" title={job.outputPath}>
            → {outputName}
          </div>
        </div>
        <div className="shrink-0">
          <StatusPill status={status} progress={progress} />
        </div>
      </div>

      {(running || done) && (
        <div className="relative mt-4 h-1 overflow-hidden rounded-full bg-raised">
          {indeterminate ? (
            <div className="shimmer absolute inset-0" />
          ) : (
            <div
              className="h-full rounded-full bg-neon transition-[width] duration-300 ease-out"
              style={{ width: `${done ? 100 : progress}%` }}
            />
          )}
        </div>
      )}

      <div className="mt-4">
        <PipelineTrace plan={job.plan} live={running} />
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-1.5 font-mono text-[11px] text-faint">
        <span>{duration(job.info.durationSec)}</span>
        <span>{bytes(job.info.sizeBytes)}</span>
        {running && live?.etaSec ? <span>{countdown(live.etaSec)} left</span> : null}
        {running && live?.speed ? <span>{live.speed.toFixed(1)}× real time</span> : null}
        {done && (
          <>
            <span className="text-mint">
              {bytes(job.outputBytes)}
              {sizeDelta(job.info.sizeBytes, job.outputBytes)
                ? ` · ${sizeDelta(job.info.sizeBytes, job.outputBytes)}`
                : ''}
            </span>
            <span>took {duration(job.elapsedSec) === '—' ? 'under a second' : duration(job.elapsedSec)}</span>
          </>
        )}
        {!running && <span title={job.outputPath}>{folderOf(job.outputPath)}</span>}
        <span>{relativeDate(job.createdAt)}</span>
      </div>

      {failed && job.error && (
        <div className="mt-4 flex items-start gap-2 rounded-md border border-flare/30 bg-flare/10 px-3 py-2.5 text-sm text-flare">
          <Icon.Alert width={15} height={15} className="mt-0.5 shrink-0" />
          <p className="whitespace-pre-wrap font-mono text-[12px] leading-relaxed">{job.error}</p>
        </div>
      )}

      <div className="mt-4 flex flex-wrap gap-2">
        {(running || status === 'queued') && (
          <button type="button" onClick={onCancel} className="btn-ghost">
            <Icon.Stop width={15} height={15} />
            Stop
          </button>
        )}
        {done && (
          <>
            <button type="button" onClick={onOpen} className="btn-primary">
              Open
            </button>
            <button type="button" onClick={onReveal} className="btn-ghost">
              <Icon.Reveal width={15} height={15} />
              Show in folder
            </button>
          </>
        )}
        {(failed || status === 'cancelled') && (
          <button type="button" onClick={onRetry} className="btn-ghost">
            <Icon.Rotate width={15} height={15} />
            Try again
          </button>
        )}
        {!running && status !== 'queued' && (
          <button
            type="button"
            onClick={onRemove}
            className="btn-quiet ml-auto"
            title="Removes this row. The converted file stays where it is."
          >
            Dismiss
          </button>
        )}
      </div>
    </div>
  )
}
