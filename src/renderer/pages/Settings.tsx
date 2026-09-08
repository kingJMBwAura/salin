import { useEffect, useState } from 'react'
import type { DepStatus, OutputFormat, OutputMode, Settings, SubtitleMode } from '@shared/types'
import type { Meta } from '../../preload'
import { api } from '../lib/api'
import PageHeader from '../components/PageHeader'
import { Icon } from '../components/icons'

function Row({
  label,
  hint,
  children
}: {
  label: string
  hint?: string
  children: React.ReactNode
}): JSX.Element {
  return (
    <div className="grid gap-2 border-b border-line py-5 last:border-0 sm:grid-cols-[1fr_320px] sm:items-start sm:gap-6">
      <div>
        <div className="text-sm text-text">{label}</div>
        {hint && <p className="mt-1 max-w-measure text-[13px] leading-relaxed text-muted">{hint}</p>}
      </div>
      <div>{children}</div>
    </div>
  )
}

export default function SettingsPage({
  meta,
  settings,
  onSettingsChange
}: {
  meta: Meta
  settings: Settings
  onSettingsChange: (settings: Settings) => void
}): JSX.Element {
  const [deps, setDeps] = useState<DepStatus[]>([])

  useEffect(() => {
    void api.probeDeps().then(setDeps)
  }, [])

  const patch = async (change: Partial<Settings>): Promise<void> => {
    onSettingsChange(await api.settings.save(change))
  }

  return (
    <>
      <PageHeader
        eyebrow="Settings"
        title="Defaults"
        description="These are the starting values for every file you add. Anything here can still be changed per file before you convert it."
      />

      <div className="card px-5 py-1">
        <Row label="Convert to" hint="Which format is selected when Salin opens.">
          <select
            className="field"
            value={settings.defaultFormat}
            onChange={(event) => void patch({ defaultFormat: event.target.value as OutputFormat })}
          >
            <option value="mp4">MP4 — video</option>
            <option value="mp3">MP3 — audio only</option>
          </select>
        </Row>

        <Row
          label="Where converted files go"
          hint="Next to the original is the safe default: Salin never overwrites, so a file that would collide gets a number after its name."
        >
          <select
            className="field"
            value={settings.outputMode}
            onChange={(event) => void patch({ outputMode: event.target.value as OutputMode })}
          >
            <option value="source">Next to the original</option>
            <option value="folder">One folder, always</option>
            <option value="ask">Ask me each time</option>
          </select>

          {settings.outputMode === 'folder' && (
            <div className="mt-2 flex items-center gap-2">
              <span
                className="min-w-0 flex-1 truncate font-mono text-[11.5px] text-faint"
                title={settings.outputFolder}
              >
                {settings.outputFolder || 'No folder chosen yet'}
              </span>
              <button
                type="button"
                className="btn-ghost shrink-0 px-2.5 py-1.5"
                onClick={async () => {
                  const folder = await api.files.pickFolder()
                  if (folder) void patch({ outputFolder: folder })
                }}
              >
                <Icon.Folder width={15} height={15} />
                Choose
              </button>
            </div>
          )}
        </Row>

        <Row
          label="Subtitles"
          hint={
            'Only applies to files that actually carry subtitles. Burning them in ' +
            'paints them onto every frame, which always means re-encoding the video.' +
            (meta.capabilities.burnText
              ? ''
              : ' This ffmpeg was built without libass, so only image-based ' +
                'subtitles can be burned in — text ones fall back to a selectable track.')
          }
        >
          <select
            className="field"
            value={settings.subtitleMode}
            onChange={(event) => void patch({ subtitleMode: event.target.value as SubtitleMode })}
          >
            <option value="drop">Leave them out</option>
            <option value="soft">Include as a selectable track</option>
            <option value="burn">Burn into the picture</option>
          </select>
        </Row>

        <Row
          label="Re-encode video by default"
          hint="Off means Salin copies the picture across whenever an MP4 can hold it — the fast, lossless path. Turn this on only if you routinely need smaller files."
        >
          <label className="inline-flex items-center gap-2.5">
            <input
              type="checkbox"
              className="accent-neon"
              checked={settings.forceEncode}
              onChange={(event) => void patch({ forceEncode: event.target.checked })}
            />
            <span className="text-sm text-muted">Always re-encode</span>
          </label>
        </Row>

        <Row label="Encoding speed" hint="Used whenever a re-encode is unavoidable.">
          <select
            className="field"
            value={settings.videoPreset}
            onChange={(event) =>
              void patch({ videoPreset: event.target.value as Settings['videoPreset'] })
            }
          >
            {meta.presets.map((preset) => (
              <option key={preset.key} value={preset.key}>
                {preset.label} — {preset.note}
              </option>
            ))}
          </select>
        </Row>

        <Row
          label={`Quality · CRF ${settings.crf}`}
          hint="Lower means better quality and a bigger file. 21 keeps a re-encode close to the original without doubling its size."
        >
          <input
            type="range"
            className="w-full accent-neon"
            min={meta.crfMin}
            max={meta.crfMax}
            value={settings.crf}
            onChange={(event) => void patch({ crf: Number(event.target.value) })}
          />
          <div className="mt-1 flex justify-between font-mono text-[11px] text-faint">
            <span>{meta.crfMin} · near-lossless</span>
            <span>rough · {meta.crfMax}</span>
          </div>
        </Row>

        <Row label="MP3 bitrate" hint="What an MP3 conversion aims for.">
          <select
            className="field"
            value={settings.mp3Bitrate}
            onChange={(event) => void patch({ mp3Bitrate: Number(event.target.value) })}
          >
            {meta.mp3Bitrates.map((rate) => (
              <option key={rate} value={rate}>
                {rate} kbps
              </option>
            ))}
          </select>
        </Row>

        <Row
          label="Delete the original afterwards"
          hint="Only after the converted file has been written successfully. The original is removed for good — it does not go to the Trash."
        >
          <label className="inline-flex items-center gap-2.5">
            <input
              type="checkbox"
              className="accent-flare"
              checked={settings.deleteSourceOnSuccess}
              onChange={async (event) => {
                // Turning this on destroys the user's own files, so it is the
                // one setting that asks first — and asks natively, where the
                // question can't be styled into something easy to skim past.
                if (!event.target.checked) {
                  void patch({ deleteSourceOnSuccess: false })
                  return
                }
                if (await api.settings.confirmDeleteSource()) {
                  void patch({ deleteSourceOnSuccess: true })
                }
              }}
            />
            <span className="text-sm text-muted">
              {settings.deleteSourceOnSuccess ? 'Originals are deleted' : 'Keep originals'}
            </span>
          </label>
        </Row>
      </div>

      <section className="mt-8">
        <div className="eyebrow mb-3">ffmpeg</div>
        <div className="card divide-y divide-line">
          {deps.map((dep) => (
            <div key={dep.name} className="flex items-start gap-3 px-5 py-4">
              {dep.found ? (
                <Icon.Check width={16} height={16} className="mt-0.5 shrink-0 text-mint" />
              ) : (
                <Icon.Alert width={16} height={16} className="mt-0.5 shrink-0 text-flare" />
              )}
              <div className="min-w-0">
                <div className="font-mono text-[13px] text-text">{dep.name}</div>
                <div className="mt-0.5 truncate font-mono text-[11.5px] text-faint" title={dep.path}>
                  {dep.found ? `${dep.version} — ${dep.path}` : `Not installed. Run: ${dep.fix}`}
                </div>
              </div>
            </div>
          ))}
        </div>
        <p className="mt-3 max-w-measure text-[13px] leading-relaxed text-muted">
          Salin does not bundle ffmpeg — it uses the one on your system, so it
          stays a small download and picks up whatever codecs your install has.
        </p>
      </section>
    </>
  )
}
