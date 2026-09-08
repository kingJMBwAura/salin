import { useCallback, useState } from 'react'
import { api } from '../lib/api'
import { Icon } from './icons'

/**
 * Where files come in.
 *
 * A dropped `File` no longer carries a `path` in Electron's renderer, so the
 * real filesystem path has to come back through the preload bridge — that is
 * what `api.files.pathFor` is for, and why drag and drop needs main-process
 * help at all.
 */
export default function DropZone({
  extensions,
  busy,
  onFiles
}: {
  extensions: string[]
  busy: boolean
  onFiles: (paths: string[]) => void
}): JSX.Element {
  const [over, setOver] = useState(false)

  const choose = useCallback(async () => {
    const paths = await api.files.pick()
    if (paths.length) onFiles(paths)
  }, [onFiles])

  return (
    <div
      onDragOver={(event) => {
        event.preventDefault()
        setOver(true)
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(event) => {
        event.preventDefault()
        setOver(false)
        const paths = Array.from(event.dataTransfer.files)
          .map((file) => api.files.pathFor(file))
          .filter(Boolean)
        if (paths.length) onFiles(paths)
      }}
      className={`card flex flex-col items-center px-6 py-12 text-center transition-colors ${
        over ? 'border-neon/60 bg-neon/[0.04]' : 'border-dashed'
      }`}
    >
      <span
        className={`mb-4 rounded-lg border p-3 transition-colors ${
          over ? 'border-neon/40 bg-neon/10 text-neon' : 'border-line bg-raised text-faint'
        }`}
      >
        <Icon.Film width={22} height={22} />
      </span>
      <h2 className="title text-base">Drop video files here</h2>
      <p className="mt-2 max-w-sm text-sm leading-relaxed text-muted">
        Salin reads their streams straight away, so you can see whether the
        conversion is a quick copy or a real re-encode before starting it.
      </p>
      <button type="button" onClick={choose} disabled={busy} className="btn-ghost mt-5">
        <Icon.Plus width={16} height={16} />
        {busy ? 'Reading…' : 'Choose files'}
      </button>
      <p className="mt-4 font-mono text-[10.5px] uppercase tracking-[0.12em] text-faint">
        {extensions.join(' · ')}
      </p>
    </div>
  )
}
