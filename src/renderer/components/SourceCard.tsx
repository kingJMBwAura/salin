import { useState } from 'react'
import type { ConversionPlan, JobOptions, MediaInfo, SubtitleMode } from '@shared/types'
import { codecLabel } from '@shared/plan'
import type { Meta } from '../../preload'
import { bytes, duration, languageName, resolution } from '../lib/format'
import { Icon } from './icons'
import PipelineTrace, { VerdictBadge } from './PipelineTrace'

/** 'English · AC-3 · 5.1' — everything you need to pick the right track. */
function audioLabel(track: MediaInfo['audio'][number]): string {
  const parts = [
    languageName(track.language),
    codecLabel(track.codec),
    track.channelLayout || (track.channels ? `${track.channels}ch` : '')
  ].filter(Boolean)
  if (track.title) parts.push(track.title)
  return parts.join(' · ')
}

export default function SourceCard({
  info,
  options,
  plan,
  meta,
  onChange,
  onRemove
}: {
  info: MediaInfo
  options: JobOptions
  plan: ConversionPlan
  meta: Meta
  onChange: (patch: Partial<JobOptions>) => void
  onRemove: () => void
}): JSX.Element {
  const [advanced, setAdvanced] = useState(false)
  const isMp4 = options.format === 'mp4'
  const encodingVideo = isMp4 && plan.video.action === 'encode'
  // Bitmap subtitles are composited with `overlay`, which every build has;
  // text ones are rendered by libass, which many builds — Homebrew's included —
  // leave out.
  const selectedSub = info.subtitles.find((track) => track.typeIndex === options.subtitleIndex)
  const canBurn = meta.capabilities.burnText || (selectedSub ? !selectedSub.text : false)

  return (
    <div className="card p-5">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="truncate text-[15px] text-text" title={info.path}>
            {info.filename}
          </div>
          <div className="mt-1.5 font-mono text-[11px] text-faint">
            {[
              duration(info.durationSec),
              bytes(info.sizeBytes),
              info.video ? resolution(info.video.width, info.video.height) : 'audio only',
              `${info.audio.length} audio`,
              info.subtitles.length ? `${info.subtitles.length} subs` : ''
            ]
              .filter(Boolean)
              .join('  ·  ')}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <VerdictBadge plan={plan} />
          <button type="button" onClick={onRemove} className="btn-quiet p-1.5" aria-label="Remove">
            <Icon.Close width={16} height={16} />
          </button>
        </div>
      </div>

      <div className="mt-5 border-t border-line pt-4">
        <PipelineTrace plan={plan} />
      </div>

      {plan.problems.length > 0 && (
        <div className="mt-4 flex items-start gap-2 rounded-md border border-flare/30 bg-flare/10 px-3 py-2.5 text-sm text-flare">
          <Icon.Alert width={15} height={15} className="mt-0.5 shrink-0" />
          <div>
            {plan.problems.map((problem) => (
              <p key={problem}>{problem}</p>
            ))}
          </div>
        </div>
      )}

      {plan.problems.length === 0 && plan.reasons.length > 0 && (
        <ul className="mt-4 space-y-1">
          {plan.reasons.map((reason) => (
            <li key={reason} className="text-[13px] leading-relaxed text-muted">
              {reason}
            </li>
          ))}
        </ul>
      )}

      {/* --- track selection ------------------------------------------- */}
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <label className="block">
          <span className="eyebrow">Audio track</span>
          <select
            className="field mt-1.5"
            value={options.audioIndex}
            onChange={(event) => onChange({ audioIndex: Number(event.target.value) })}
          >
            {info.audio.map((track) => (
              <option key={track.typeIndex} value={track.typeIndex}>
                {track.typeIndex + 1}. {audioLabel(track)}
              </option>
            ))}
            {isMp4 && <option value={-1}>No audio</option>}
          </select>
        </label>

        {isMp4 && (
          <label className="block">
            <span className="eyebrow">Subtitles</span>
            <select
              className="field mt-1.5"
              value={options.subtitleMode}
              onChange={(event) => {
                const mode = event.target.value as SubtitleMode
                onChange({
                  subtitleMode: mode,
                  // Land on a usable track rather than -1 the moment subtitles
                  // are switched on.
                  subtitleIndex:
                    mode !== 'drop' && options.subtitleIndex < 0
                      ? (info.subtitles[0]?.typeIndex ?? -1)
                      : options.subtitleIndex
                })
              }}
              disabled={info.subtitles.length === 0}
            >
              <option value="drop">
                {info.subtitles.length === 0 ? 'None in this file' : 'Leave them out'}
              </option>
              <option value="soft">Include as a selectable track</option>
              <option value="burn" disabled={!canBurn}>
                Burn into the picture
                {canBurn ? '' : ' — needs an ffmpeg built with libass'}
              </option>
            </select>
          </label>
        )}

        {isMp4 && options.subtitleMode !== 'drop' && info.subtitles.length > 0 && (
          <label className="block sm:col-span-2">
            <span className="eyebrow">Subtitle track</span>
            <select
              className="field mt-1.5"
              value={options.subtitleIndex}
              onChange={(event) => onChange({ subtitleIndex: Number(event.target.value) })}
            >
              {info.subtitles.map((track) => (
                <option key={track.typeIndex} value={track.typeIndex}>
                  {track.typeIndex + 1}. {languageName(track.language)} · {codecLabel(track.codec)}
                  {track.title ? ` · ${track.title}` : ''}
                  {track.text ? '' : ' (image-based)'}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>

      {/* --- advanced ---------------------------------------------------- */}
      <button
        type="button"
        onClick={() => setAdvanced((current) => !current)}
        className="btn-quiet mt-4 -ml-2 px-2 text-[13px]"
        aria-expanded={advanced}
      >
        <Icon.Chevron
          width={15}
          height={15}
          className={`transition-transform ${advanced ? 'rotate-180' : ''}`}
        />
        Quality and encoding
      </button>

      {advanced && (
        <div className="mt-3 grid gap-4 rounded-md border border-line bg-raised/60 p-4 sm:grid-cols-2">
          {isMp4 && (
            <label className="flex items-start gap-2.5 sm:col-span-2">
              <input
                type="checkbox"
                className="mt-0.5 accent-neon"
                checked={options.forceEncode}
                onChange={(event) => onChange({ forceEncode: event.target.checked })}
              />
              <span>
                <span className="text-sm text-text">Re-encode the video</span>
                <span className="mt-0.5 block text-[12.5px] leading-relaxed text-muted">
                  Rebuilds the picture instead of copying it. Slower and slightly
                  lossy, but it is the only way to make the file meaningfully
                  smaller.
                </span>
              </span>
            </label>
          )}

          {isMp4 && encodingVideo && (
            <>
              <label className="block">
                <span className="eyebrow">Speed</span>
                <select
                  className="field mt-1.5"
                  value={options.videoPreset}
                  onChange={(event) =>
                    onChange({ videoPreset: event.target.value as JobOptions['videoPreset'] })
                  }
                >
                  {meta.presets.map((preset) => (
                    <option key={preset.key} value={preset.key}>
                      {preset.label} — {preset.note}
                    </option>
                  ))}
                </select>
              </label>

              <label className="block">
                <span className="eyebrow">
                  Quality · CRF {options.crf}
                  {options.crf <= 19 ? ' (near-lossless)' : options.crf >= 26 ? ' (rough)' : ''}
                </span>
                <input
                  type="range"
                  className="mt-3 w-full accent-neon"
                  min={meta.crfMin}
                  max={meta.crfMax}
                  value={options.crf}
                  onChange={(event) => onChange({ crf: Number(event.target.value) })}
                />
                <span className="mt-1 block text-[12px] text-faint">
                  Lower is better and bigger. 21 is a good default.
                </span>
              </label>
            </>
          )}

          {!isMp4 && (
            <label className="block">
              <span className="eyebrow">MP3 bitrate</span>
              <select
                className="field mt-1.5"
                value={options.mp3Bitrate}
                onChange={(event) => onChange({ mp3Bitrate: Number(event.target.value) })}
              >
                {meta.mp3Bitrates.map((rate) => (
                  <option key={rate} value={rate}>
                    {rate} kbps{rate === 320 ? ' — the most MP3 can carry' : ''}
                  </option>
                ))}
              </select>
            </label>
          )}
        </div>
      )}
    </div>
  )
}
