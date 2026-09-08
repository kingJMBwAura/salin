/** Persisted app settings. */

import Store from 'electron-store'
import type { Settings } from '../shared/types'
import { CRF_MAX, CRF_MIN, DEFAULT_SETTINGS, MP3_BITRATES, PRESET_KEYS } from './config'

const store = new Store<{ settings: Settings }>({ defaults: { settings: DEFAULT_SETTINGS } })

export function getSettings(): Settings {
  // Merge over defaults so a file written by an older build still loads and
  // newly added keys appear with sensible values rather than undefined.
  const stored = store.get('settings') as Partial<Settings> | undefined
  return { ...DEFAULT_SETTINGS, ...(stored ?? {}) }
}

/** Validates before writing — the renderer is not the last line of defence. */
export function saveSettings(patch: Partial<Settings>): Settings {
  const next: Settings = { ...getSettings() }

  if (patch.defaultFormat === 'mp4' || patch.defaultFormat === 'mp3') {
    next.defaultFormat = patch.defaultFormat
  }
  if (patch.outputMode === 'source' || patch.outputMode === 'folder' || patch.outputMode === 'ask') {
    next.outputMode = patch.outputMode
  }
  if (typeof patch.outputFolder === 'string') {
    next.outputFolder = patch.outputFolder
  }
  if (patch.videoPreset && PRESET_KEYS.includes(patch.videoPreset)) {
    next.videoPreset = patch.videoPreset
  }
  if (typeof patch.crf === 'number' && Number.isFinite(patch.crf)) {
    next.crf = Math.min(CRF_MAX, Math.max(CRF_MIN, Math.round(patch.crf)))
  }
  if (typeof patch.mp3Bitrate === 'number' && MP3_BITRATES.includes(patch.mp3Bitrate)) {
    next.mp3Bitrate = patch.mp3Bitrate
  }
  if (typeof patch.forceEncode === 'boolean') {
    next.forceEncode = patch.forceEncode
  }
  if (patch.subtitleMode === 'drop' || patch.subtitleMode === 'soft' || patch.subtitleMode === 'burn') {
    next.subtitleMode = patch.subtitleMode
  }
  if (typeof patch.deleteSourceOnSuccess === 'boolean') {
    next.deleteSourceOnSuccess = patch.deleteSourceOnSuccess
  }

  // An output folder that has gone missing would fail every job with an
  // unhelpful ffmpeg error, so fall back to writing beside the source.
  if (next.outputMode === 'folder' && !next.outputFolder) next.outputMode = 'source'

  store.set('settings', next)
  return next
}
