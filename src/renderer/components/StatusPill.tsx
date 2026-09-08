import type { JobStatus } from '@shared/types'
import { STATUS_LABELS } from '../lib/format'

const TONE: Record<string, string> = {
  done: "text-mint border-mint/30 bg-mint/10",
  error: "text-flare border-flare/30 bg-flare/10",
  cancelled: "text-faint border-line2 bg-raised",
  queued: "text-muted border-line2 bg-raised",
};

export default function StatusPill({
  status,
  progress = 0
}: {
  status: JobStatus
  progress?: number
}): JSX.Element {
  const running = status === "running";
  const tone = TONE[status] ?? "text-neon border-neon/30 bg-neon/10";

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5
                  font-mono text-[10.5px] uppercase tracking-[0.1em] ${tone}`}
    >
      {running && (
        <span className="relative flex h-1.5 w-1.5">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-neon opacity-70" />
          <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-neon" />
        </span>
      )}
      {STATUS_LABELS[status] ?? status}
      {running && progress > 0 && ` ${Math.round(progress)}%`}
    </span>
  );
}
