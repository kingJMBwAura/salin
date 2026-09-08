import { useCallback, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import type { Capabilities, JobOptions, MediaInfo, OutputFormat, Settings } from '@shared/types'
import { buildPlan } from '@shared/plan'
import type { Meta } from '../../preload'
import { api } from '../lib/api'
import DropZone from '../components/DropZone'
import PageHeader from '../components/PageHeader'
import SourceCard from '../components/SourceCard'
import { Icon } from '../components/icons'

interface Entry {
  info: MediaInfo
  options: JobOptions
}

interface Rejected {
  path: string
  error: string
}

/**
 * Sensible starting options for a newly added file.
 *
 * The default audio track is whichever the file marks as default — for a
 * dual-language MKV that is the one the release intended you to hear, and
 * falling back to "the first one" would often be wrong.
 */
function defaultOptions(
  info: MediaInfo,
  settings: Settings,
  format: OutputFormat,
  capabilities: Capabilities
): JobOptions {
  const preferred = info.audio.find((track) => track.isDefault) ?? info.audio[0]
  const hasSubtitles = info.subtitles.length > 0
  // Never start a file on a setting this ffmpeg can't honour; the user would
  // only have to clear the error before doing anything else.
  const burnable = capabilities.burnText || (info.subtitles[0] && !info.subtitles[0].text)
  const mode =
    settings.subtitleMode === 'burn' && !burnable ? 'soft' : settings.subtitleMode
  return {
    format,
    audioIndex: preferred?.typeIndex ?? -1,
    subtitleMode: hasSubtitles ? mode : 'drop',
    subtitleIndex: info.subtitles[0]?.typeIndex ?? -1,
    forceEncode: settings.forceEncode,
    videoPreset: settings.videoPreset,
    crf: settings.crf,
    mp3Bitrate: settings.mp3Bitrate
  }
}

function FormatToggle({
  format,
  onChange
}: {
  format: OutputFormat
  onChange: (format: OutputFormat) => void
}): JSX.Element {
  const options: { key: OutputFormat; label: string; note: string; icon: typeof Icon.Film }[] = [
    { key: 'mp4', label: 'MP4', note: 'Video — plays anywhere', icon: Icon.Film },
    { key: 'mp3', label: 'MP3', note: 'Audio only', icon: Icon.Music }
  ]
  return (
    <div className="inline-flex rounded-md border border-line bg-raised p-1">
      {options.map((option) => {
        const active = option.key === format
        return (
          <button
            key={option.key}
            type="button"
            onClick={() => onChange(option.key)}
            title={option.note}
            className={`inline-flex items-center gap-2 rounded px-3 py-1.5 text-sm transition-colors ${
              active ? 'bg-neon text-ink' : 'text-muted hover:text-text'
            }`}
          >
            <option.icon width={15} height={15} />
            {option.label}
          </button>
        )
      })}
    </div>
  )
}

export default function Convert({
  meta,
  settings
}: {
  meta: Meta
  settings: Settings
}): JSX.Element {
  const navigate = useNavigate()
  const [entries, setEntries] = useState<Entry[]>([])
  const [rejected, setRejected] = useState<Rejected[]>([])
  const [format, setFormat] = useState<OutputFormat>(settings.defaultFormat)
  const [reading, setReading] = useState(false)
  const [starting, setStarting] = useState(false)
  const [error, setError] = useState('')

  const addFiles = useCallback(
    async (paths: string[]) => {
      setReading(true)
      setError('')
      try {
        const results = await api.files.probe(paths)
        const added: Entry[] = []
        const failed: Rejected[] = []
        for (const result of results) {
          if (result.info) {
            added.push({
              info: result.info,
              options: defaultOptions(result.info, settings, format, meta.capabilities)
            })
          }
          else failed.push({ path: result.path, error: result.error })
        }
        // Adding the same file twice would queue two jobs writing to the same
        // folder, and the second would land as "name (1)" for no reason.
        setEntries((current) => {
          const seen = new Set(current.map((entry) => entry.info.path))
          return [...current, ...added.filter((entry) => !seen.has(entry.info.path))]
        })
        setRejected(failed)
      } finally {
        setReading(false)
      }
    },
    [format, meta.capabilities, settings]
  )

  const patch = useCallback((path: string, options: Partial<JobOptions>) => {
    setEntries((current) =>
      current.map((entry) =>
        entry.info.path === path ? { ...entry, options: { ...entry.options, ...options } } : entry
      )
    )
  }, [])

  const changeFormat = useCallback((next: OutputFormat) => {
    setFormat(next)
    setEntries((current) =>
      current.map((entry) => ({ ...entry, options: { ...entry.options, format: next } }))
    )
  }, [])

  const plans = useMemo(
    () => entries.map((entry) => buildPlan(entry.info, entry.options, meta.capabilities)),
    [entries, meta.capabilities]
  )
  const blocked = plans.some((plan) => plan.problems.length > 0)
  const remuxCount = plans.filter((plan) => plan.mode === 'remux').length

  const start = useCallback(async () => {
    setStarting(true)
    setError('')
    try {
      // "Ask me each time" is answered once for the whole batch, not per file.
      let folderOverride = ''
      if (settings.outputMode === 'ask') {
        folderOverride = await api.files.pickFolder()
        if (!folderOverride) return
      }
      await api.jobs.create(entries, folderOverride)
      setEntries([])
      setRejected([])
      navigate('/queue')
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught))
    } finally {
      setStarting(false)
    }
  }, [entries, navigate, settings.outputMode])

  return (
    <>
      <PageHeader
        eyebrow="Convert"
        title="Bring it into MP4 or MP3"
        description="Salin reads each file's streams first. When the picture and sound already fit an MP4, it copies them across untouched — seconds instead of minutes, with nothing lost."
        actions={<FormatToggle format={format} onChange={changeFormat} />}
      />

      <div className="space-y-4">
        {entries.length === 0 ? (
          <DropZone extensions={meta.inputExtensions} busy={reading} onFiles={addFiles} />
        ) : (
          <>
            {entries.map((entry, index) => (
              <SourceCard
                key={entry.info.path}
                info={entry.info}
                options={entry.options}
                plan={plans[index]}
                meta={meta}
                onChange={(options) => patch(entry.info.path, options)}
                onRemove={() =>
                  setEntries((current) => current.filter((e) => e.info.path !== entry.info.path))
                }
              />
            ))}

            <div className="flex flex-wrap items-center gap-3 pt-1">
              <button
                type="button"
                onClick={start}
                disabled={starting || blocked}
                className="btn-primary"
              >
                <Icon.Bolt width={16} height={16} />
                {starting
                  ? 'Starting…'
                  : `Convert ${entries.length} file${entries.length === 1 ? '' : 's'}`}
              </button>
              <button
                type="button"
                onClick={async () => {
                  const paths = await api.files.pick()
                  if (paths.length) void addFiles(paths)
                }}
                disabled={reading}
                className="btn-ghost"
              >
                <Icon.Plus width={16} height={16} />
                Add more
              </button>
              <button
                type="button"
                onClick={() => {
                  setEntries([])
                  setRejected([])
                }}
                className="btn-quiet"
              >
                Clear
              </button>
              {remuxCount > 0 && (
                <span className="text-[13px] text-muted">
                  {remuxCount === entries.length
                    ? entries.length === 1
                      ? 'This one is a straight copy.'
                      : 'All of these are straight copies.'
                    : `${remuxCount} of ${entries.length} are straight copies.`}
                </span>
              )}
            </div>
          </>
        )}

        {blocked && (
          <p className="text-[13px] text-flare">
            Fix the highlighted file{plans.filter((p) => p.problems.length).length === 1 ? '' : 's'} before starting.
          </p>
        )}

        {error && (
          <div className="flex items-start gap-2 rounded-md border border-flare/30 bg-flare/10 px-4 py-3 text-sm text-flare">
            <Icon.Alert width={16} height={16} className="mt-0.5 shrink-0" />
            <p>{error}</p>
          </div>
        )}

        {rejected.length > 0 && (
          <div className="card p-4">
            <div className="eyebrow mb-2">Skipped</div>
            <ul className="space-y-1.5">
              {rejected.map((item) => (
                <li key={item.path} className="text-[13px] leading-relaxed text-muted">
                  <span className="font-mono text-[12px] text-faint">
                    {item.path.split(/[\\/]/).pop()}
                  </span>{' '}
                  — {item.error}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </>
  )
}
