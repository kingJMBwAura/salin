/** What Salin accepts, what it can produce, and what it does by default. */

import type { PresetSpec, Settings } from '../shared/types'

export const APP_NAME = 'Salin'

/**
 * Containers ffmpeg reads happily and that people actually have lying around.
 * MKV is the reason the app exists; the rest cost nothing to support because
 * the pipeline never cares what the input container was.
 */
export const INPUT_EXTENSIONS = [
  'mkv', 'avi', 'mov', 'webm', 'wmv', 'flv', 'ts', 'm2ts', 'm4v', 'mpg', 'mpeg', '3gp', 'ogv', 'mp4'
]

/**
 * A deliberately short slice of x264's preset ladder. The extremes either side
 * (placebo, ultrafast's neighbours) trade far more than they buy.
 */
export const VIDEO_PRESETS: PresetSpec[] = [
  { key: 'ultrafast', label: 'Ultrafast', note: 'Fastest, largest files.' },
  { key: 'veryfast', label: 'Very fast', note: 'Good when you just need it done.' },
  { key: 'fast', label: 'Fast', note: 'Sensible default when re-encoding.' },
  { key: 'medium', label: 'Medium', note: "x264's own default. Slower, a little smaller." },
  { key: 'slow', label: 'Slow', note: 'Smallest files. Expect a long wait.' }
]

export const PRESET_KEYS = VIDEO_PRESETS.map((p) => p.key)

/** Lower is better quality and bigger. 18 is visually lossless, 28 is rough. */
export const CRF_MIN = 16
export const CRF_MAX = 30

export const MP3_BITRATES = [128, 192, 256, 320]

export const DEFAULT_SETTINGS: Settings = {
  defaultFormat: 'mp4',
  outputMode: 'source',
  outputFolder: '',
  videoPreset: 'fast',
  crf: 21,
  mp3Bitrate: 192,
  forceEncode: false,
  subtitleMode: 'drop',
  deleteSourceOnSuccess: false
}
