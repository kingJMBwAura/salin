/** Types shared across the main process, the preload bridge, and the renderer. */

export type OutputFormat = 'mp4' | 'mp3'

/** What to do with the source's embedded subtitles. MP4 only. */
export type SubtitleMode = 'drop' | 'soft' | 'burn'

export type VideoPreset = 'ultrafast' | 'veryfast' | 'fast' | 'medium' | 'slow'

export type JobStatus = 'queued' | 'running' | 'done' | 'error' | 'cancelled'

/** What happens to one stream on the way through. */
export type StreamAction = 'copy' | 'encode' | 'drop'

/**
 * A stream's position *within its own type*.
 *
 * ffprobe reports an absolute `index` across all streams, but ffmpeg's `-map
 * 0:a:1` counts audio streams only. Mixing the two silently exports the wrong
 * language, so both numbers are carried explicitly.
 */
interface StreamBase {
  /** Absolute ffprobe stream index. */
  index: number
  /** Index among streams of the same type — the one `-map 0:a:N` wants. */
  typeIndex: number
  codec: string
  /** ISO 639-2 tag, or '' when the file doesn't say. */
  language: string
  title: string
  isDefault: boolean
}

export interface VideoStream extends StreamBase {
  width: number
  height: number
  fps: number
  pixelFormat: string
}

export interface AudioStream extends StreamBase {
  channels: number
  channelLayout: string
  sampleRate: number
  bitrateKbps: number
}

export interface SubtitleStream extends StreamBase {
  /**
   * Text subtitles (subrip, ass, …) can be soft-muxed into MP4 as mov_text.
   * Bitmap ones (PGS, VobSub) are pictures and cannot — they must be burned
   * into the video or dropped.
   */
  text: boolean
}

export interface MediaInfo {
  path: string
  filename: string
  /** ffprobe's short format name, e.g. 'matroska,webm'. */
  container: string
  durationSec: number
  sizeBytes: number
  video: VideoStream | null
  audio: AudioStream[]
  subtitles: SubtitleStream[]
}

export interface JobOptions {
  format: OutputFormat
  /** typeIndex of the audio stream to keep, or -1 for none. */
  audioIndex: number
  subtitleMode: SubtitleMode
  /** typeIndex of the subtitle stream to use, or -1 for none. */
  subtitleIndex: number
  /** Re-encode video even when the stream could have been copied. */
  forceEncode: boolean
  videoPreset: VideoPreset
  crf: number
  mp3Bitrate: number
}

/** One leg of the pipeline trace: what came in, what goes out, and how. */
export interface PlanLeg {
  action: StreamAction
  from: string
  to: string
}

export interface ConversionPlan {
  /** 'remux' means no stream is re-encoded — a container swap, seconds long. */
  mode: 'remux' | 'encode'
  video: PlanLeg
  audio: PlanLeg
  subtitles: PlanLeg
  /** Why an encode is unavoidable. Empty when remuxing. */
  reasons: string[]
  /** Blocking problems: the job cannot run as configured. */
  problems: string[]
}

export interface Job {
  id: string
  status: JobStatus
  /** 0–100. Indeterminate jobs report 0 until ffmpeg emits its first tick. */
  progress: number
  error: string
  createdAt: string
  updatedAt: string
  /**
   * The probe taken when the file was added.
   *
   * Kept on the record rather than re-probed at run time so a queued job is
   * self-contained: Retry works months later, and the queue never has to touch
   * the source file just to describe it.
   */
  info: MediaInfo
  options: JobOptions
  plan: ConversionPlan
  outputPath: string
  outputBytes: number
  /** Wall-clock seconds the conversion took, once finished. */
  elapsedSec: number
}

export interface JobProgress {
  id: string
  status: JobStatus
  progress: number
  /** Multiple of real time, as reported by ffmpeg. 0 when unknown. */
  speed: number
  /** Seconds remaining, or 0 when it cannot be estimated yet. */
  etaSec: number
  error?: string
  outputPath?: string
  outputBytes?: number
  elapsedSec?: number
}

export type OutputMode = 'source' | 'folder' | 'ask'

export interface Settings {
  defaultFormat: OutputFormat
  /** Where finished files land: next to the source, a fixed folder, or ask. */
  outputMode: OutputMode
  outputFolder: string
  videoPreset: VideoPreset
  crf: number
  mp3Bitrate: number
  forceEncode: boolean
  subtitleMode: SubtitleMode
  /** Off by default — it destroys the user's original file. */
  deleteSourceOnSuccess: boolean
}

/**
 * What the ffmpeg on this machine can actually do.
 *
 * Not every build carries every library, and the gap that matters here is
 * libass: without it there is no `subtitles` filter, and text subtitles cannot
 * be rendered onto the picture. Homebrew's current ffmpeg is such a build, so
 * this is the common case rather than an edge one.
 */
export interface Capabilities {
  /** ffmpeg has the `subtitles` filter, so text subtitles can be burned in. */
  burnText: boolean
}

/** One entry of a video-quality ladder, as offered in the UI. */
export interface PresetSpec {
  key: VideoPreset
  label: string
  note: string
}

/** One file's probe result: it worked, or it didn't — never both, never neither. */
export interface ProbeResult {
  path: string
  info: MediaInfo | null
  error: string
}

export interface DepStatus {
  name: string
  found: boolean
  path: string
  version: string
  fix: string
}
