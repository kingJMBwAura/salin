export function duration(seconds: number | undefined): string {
  if (!seconds) return '—'
  const total = Math.round(seconds)
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  if (h) return `${h}h ${m}m`
  if (m) return `${m}m ${s}s`
  return `${s}s`
}

/** Short form for a countdown, where "2m 5s" reads worse than "2:05". */
export function countdown(seconds: number | undefined): string {
  if (!seconds || seconds < 0) return '—'
  const total = Math.round(seconds)
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  const pad = (n: number): string => String(n).padStart(2, '0')
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`
}

export function bytes(n: number | undefined): string {
  if (!n) return '0 MB'
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  let value = n
  let i = 0
  while (value >= 1024 && i < units.length - 1) {
    value /= 1024
    i += 1
  }
  return `${value.toFixed(value < 10 && i > 1 ? 1 : 0)} ${units[i]}`
}

/** '+18%' or '−64%' against the source size, or '' when there's nothing to compare. */
export function sizeDelta(from: number, to: number): string {
  if (!from || !to) return ''
  const change = Math.round(((to - from) / from) * 100)
  if (change === 0) return 'same size'
  return change > 0 ? `+${change}% larger` : `${Math.abs(change)}% smaller`
}

export function relativeDate(iso: string | undefined): string {
  if (!iso) return '—'
  const then = new Date(iso)
  if (Number.isNaN(then.getTime())) return '—'
  const diff = (Date.now() - then.getTime()) / 1000
  if (diff < 60) return 'just now'
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`
  if (diff < 604800) return `${Math.floor(diff / 86400)}d ago`
  return then.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })
}

export function folderOf(path: string): string {
  const parts = path.split(/[\\/]/)
  parts.pop()
  return parts.join('/') || '/'
}

/** '1920×1080' — the × is the real one, not a lowercase x. */
export function resolution(width: number, height: number): string {
  return width && height ? `${width}×${height}` : '—'
}

/** 'English · AAC · 5.1' for an audio track picker. */
const LANGUAGE_NAMES = new Intl.DisplayNames(undefined, { type: 'language' })

export function languageName(tag: string): string {
  if (!tag) return 'Undetermined'
  try {
    return LANGUAGE_NAMES.of(tag) ?? tag
  } catch {
    return tag
  }
}

export const STATUS_LABELS: Record<string, string> = {
  queued: 'Waiting',
  running: 'Converting',
  done: 'Done',
  error: 'Failed',
  cancelled: 'Stopped'
}
