/**
 * Deciding what ffmpeg should do — and saying so in words.
 *
 * Pure: no filesystem, no ffmpeg, no Electron. The whole decision matrix is
 * therefore testable on its own, which matters because getting it wrong is
 * either silent (the user gets the wrong audio language) or expensive (a
 * twenty-minute transcode that a three-second copy would have covered).
 *
 * `buildPlan` produces the human-facing account of the conversion; `buildArgs`
 * produces the argv. They share one set of decisions so the trace the UI draws
 * can never disagree with what actually runs.
 */

import type {
  Capabilities, ConversionPlan, JobOptions, MediaInfo, PlanLeg, StreamAction, SubtitleStream
} from './types'

/**
 * Video codecs an MP4 can hold that players will actually open.
 *
 * This list is the whole point of the app: when the source video is already one
 * of these, MKV → MP4 is a container swap that takes seconds and loses nothing.
 * VP9 and MPEG-2 are legal in an MP4 and are deliberately absent — QuickTime
 * won't play them, which defeats the reason for converting at all.
 */
export const COPYABLE_VIDEO_CODECS = ['h264', 'hevc', 'mpeg4', 'av1']

/** Audio codecs an MP4 container can hold as-is. */
export const COPYABLE_AUDIO_CODECS = ['aac', 'mp3', 'alac']

/**
 * Subtitle codecs that are *text*, and so can become MP4's mov_text.
 * Anything else (PGS, VobSub) is a bitmap and can only be burned in.
 */
export const TEXT_SUBTITLE_CODECS = ['subrip', 'srt', 'ass', 'ssa', 'text', 'mov_text', 'webvtt']

/** What a re-encode falls back to when the source audio can't be copied. */
export const AAC_BITRATE_KBPS = 192

export function isTextSubtitle(codec: string): boolean {
  return TEXT_SUBTITLE_CODECS.includes(codec)
}

const NONE: PlanLeg = { action: 'drop', from: '—', to: '—' }

function leg(action: StreamAction, from: string, to: string): PlanLeg {
  return { action, from, to }
}

function subtitleAt(info: MediaInfo, typeIndex: number): SubtitleStream | undefined {
  return info.subtitles.find((s) => s.typeIndex === typeIndex)
}

/**
 * Quote a path for use as a filter option value, e.g. `subtitles=filename=…`.
 *
 * A filtergraph is unescaped *twice*, and each pass has its own rules, which is
 * why this looks worse than it should:
 *
 *  1. The filter reads its own option value with backslash escapes, so `\`,
 *     `:` and `'` are escaped for that pass first. (`:` separates options, and
 *     a Windows drive letter is the usual casualty when it is skipped.)
 *  2. The graph itself is then split on `,` and `:` before that, and a
 *     single-quoted run protects those — but inside single quotes a backslash
 *     is *not* an escape, so a literal quote can only be produced by closing
 *     the run, emitting `\'`, and reopening it.
 *
 * Verified against ffmpeg with paths containing colons, apostrophes, commas,
 * brackets and backslashes; every simpler form of this fails on at least one
 * of them.
 */
export function quoteFilterPath(path: string): string {
  const forFilter = path.replace(/\\/g, '\\\\').replace(/:/g, '\\:').replace(/'/g, "\\'")
  return `'${forFilter.replace(/'/g, "'\\''")}'`
}

/** Human label for a codec, so the trace reads like English rather than ffprobe. */
export function codecLabel(codec: string): string {
  const names: Record<string, string> = {
    h264: 'H.264',
    hevc: 'HEVC',
    av1: 'AV1',
    vp9: 'VP9',
    vp8: 'VP8',
    mpeg4: 'MPEG-4',
    mpeg2video: 'MPEG-2',
    aac: 'AAC',
    ac3: 'AC-3',
    eac3: 'E-AC-3',
    dts: 'DTS',
    truehd: 'TrueHD',
    flac: 'FLAC',
    opus: 'Opus',
    vorbis: 'Vorbis',
    mp3: 'MP3',
    alac: 'ALAC',
    pcm_s16le: 'PCM',
    subrip: 'SubRip',
    ass: 'ASS',
    ssa: 'SSA',
    mov_text: 'mov_text',
    hdmv_pgs_subtitle: 'PGS',
    dvd_subtitle: 'VobSub'
  }
  return names[codec] ?? (codec ? codec.toUpperCase() : '—')
}

/** Assume a full-featured ffmpeg until something has actually asked it. */
export const FULL_CAPABILITIES: Capabilities = { burnText: true }

export function buildPlan(
  info: MediaInfo,
  options: JobOptions,
  capabilities: Capabilities = FULL_CAPABILITIES
): ConversionPlan {
  const reasons: string[] = []
  const problems: string[] = []

  const audio = info.audio.find((a) => a.typeIndex === options.audioIndex) ?? null
  if (options.audioIndex >= 0 && !audio) {
    problems.push(`This file has no audio track ${options.audioIndex + 1}.`)
  }

  // --- MP3: always an encode, and video never comes along. -----------------
  if (options.format === 'mp3') {
    if (!audio) problems.push('An MP3 needs an audio track, and none is selected.')
    return {
      mode: 'encode',
      video: NONE,
      audio: audio
        ? leg('encode', codecLabel(audio.codec), `MP3 ${options.mp3Bitrate}k`)
        : NONE,
      subtitles: NONE,
      reasons: ['MP3 is an audio format, so the video and subtitles are left behind.'],
      problems
    }
  }

  // --- MP4 -----------------------------------------------------------------
  const sub = options.subtitleMode === 'drop' ? undefined : subtitleAt(info, options.subtitleIndex)
  if (options.subtitleMode !== 'drop' && !sub) {
    problems.push('No subtitle track is selected.')
  }
  if (options.subtitleMode === 'burn' && sub && sub.text && !capabilities.burnText) {
    problems.push(
      "This ffmpeg was built without libass, so it can't draw text subtitles onto " +
        'the picture. Include them as a selectable track instead, or install an ' +
        'ffmpeg built with libass.'
    )
  }
  if (options.subtitleMode === 'soft' && sub && !sub.text) {
    problems.push(
      `${codecLabel(sub.codec)} subtitles are images, not text, so they can't be ` +
        'carried into an MP4. Burn them into the picture or drop them.'
    )
  }

  const burning = options.subtitleMode === 'burn' && Boolean(sub)

  let video: PlanLeg
  if (!info.video) {
    video = NONE
  } else {
    const copyable = COPYABLE_VIDEO_CODECS.includes(info.video.codec)
    if (burning) {
      reasons.push('Burning subtitles in paints them onto every frame, which means re-encoding.')
      video = leg('encode', codecLabel(info.video.codec), 'H.264')
    } else if (options.forceEncode) {
      reasons.push('You asked for a re-encode, so the video is being rebuilt rather than copied.')
      video = leg('encode', codecLabel(info.video.codec), 'H.264')
    } else if (!copyable) {
      reasons.push(
        `${codecLabel(info.video.codec)} can't sit in an MP4 that most players will open, ` +
          'so the video has to be re-encoded.'
      )
      video = leg('encode', codecLabel(info.video.codec), 'H.264')
    } else {
      video = leg('copy', codecLabel(info.video.codec), codecLabel(info.video.codec))
    }
  }

  let audioLeg: PlanLeg = NONE
  if (audio) {
    if (COPYABLE_AUDIO_CODECS.includes(audio.codec)) {
      audioLeg = leg('copy', codecLabel(audio.codec), codecLabel(audio.codec))
    } else {
      reasons.push(
        `${codecLabel(audio.codec)} audio isn't something an MP4 can hold, so it becomes AAC.`
      )
      audioLeg = leg('encode', codecLabel(audio.codec), `AAC ${AAC_BITRATE_KBPS}k`)
    }
  }

  let subLeg: PlanLeg = NONE
  // A leg is only drawn for something that will actually happen: when the
  // chosen handling is impossible the card is already showing why, and a trace
  // claiming the subtitles come across would contradict it.
  if (sub && problems.length === 0 && options.subtitleMode === 'soft') {
    subLeg = leg('copy', codecLabel(sub.codec), 'mov_text')
  } else if (sub && problems.length === 0 && options.subtitleMode === 'burn') {
    subLeg = leg('encode', codecLabel(sub.codec), 'burned in')
  }

  // Only a whole-file copy counts as a remux: if either the video or the audio
  // is being rebuilt, this job costs real time and should not claim otherwise.
  const encoding = video.action === 'encode' || audioLeg.action === 'encode'

  return {
    mode: encoding ? 'encode' : 'remux',
    video,
    audio: audioLeg,
    subtitles: subLeg,
    reasons,
    problems
  }
}

/**
 * The exact argv, input and output included.
 *
 * Streams are mapped explicitly rather than left to ffmpeg's defaults. That is
 * what makes the audio-track picker work at all, and it also drops MKV's
 * attachment streams (embedded fonts) which an MP4 has nowhere to put.
 */
export function buildArgs(
  info: MediaInfo,
  options: JobOptions,
  input: string,
  output: string,
  capabilities: Capabilities = FULL_CAPABILITIES
): string[] {
  const plan = buildPlan(info, options, capabilities)
  const audio = info.audio.find((a) => a.typeIndex === options.audioIndex) ?? null
  const args = ['-y', '-loglevel', 'error', '-i', input]

  if (options.format === 'mp3') {
    args.push('-vn')
    if (audio) args.push('-map', `0:a:${audio.typeIndex}`)
    args.push('-c:a', 'libmp3lame', '-b:a', `${options.mp3Bitrate}k`)
    // Some players (and Windows Explorer) only read v2.3 tags.
    args.push('-id3v2_version', '3')
    // Named explicitly because the file is written to a `.part` sidecar first,
    // and ffmpeg would otherwise have no extension to infer the muxer from.
    args.push('-f', 'mp3', output)
    return args
  }

  const sub = options.subtitleMode === 'drop' ? undefined : subtitleAt(info, options.subtitleIndex)
  const burning = options.subtitleMode === 'burn' && Boolean(sub) && Boolean(info.video)

  // Bitmap subtitles are pictures, so they are composited with `overlay`.
  // Text subtitles are rendered by libass through the `subtitles` filter, which
  // reads them back out of the source file by index.
  const burnByOverlay = burning && sub !== undefined && !sub.text

  if (info.video) {
    if (burnByOverlay && sub) {
      args.push('-filter_complex', `[0:v:0][0:s:${sub.typeIndex}]overlay[vout]`, '-map', '[vout]')
    } else {
      args.push('-map', '0:v:0')
    }
  }
  if (audio) args.push('-map', `0:a:${audio.typeIndex}`)
  if (sub && options.subtitleMode === 'soft') args.push('-map', `0:s:${sub.typeIndex}`)

  if (info.video) {
    if (plan.video.action === 'copy') {
      args.push('-c:v', 'copy')
      // A copied HEVC stream carries the 'hev1' tag by default, which QuickTime
      // and iOS refuse to play. 'hvc1' is the same bitstream, labelled the way
      // Apple's decoders insist on.
      if (info.video.codec === 'hevc') args.push('-tag:v', 'hvc1')
    } else {
      if (burning && sub?.text) {
        args.push(
          '-vf',
          `subtitles=filename=${quoteFilterPath(input)}:si=${sub.typeIndex}`
        )
      }
      args.push(
        '-c:v', 'libx264',
        '-preset', options.videoPreset,
        '-crf', String(options.crf),
        // Anything else (yuv444p, 10-bit) plays in ffmpeg and nowhere else.
        '-pix_fmt', 'yuv420p'
      )
    }
  }

  if (audio) {
    args.push('-c:a', plan.audio.action === 'copy' ? 'copy' : 'aac')
    if (plan.audio.action === 'encode') args.push('-b:a', `${AAC_BITRATE_KBPS}k`)
  }

  if (sub && options.subtitleMode === 'soft') args.push('-c:s', 'mov_text')

  // Puts the moov atom at the front, so the file starts playing before it has
  // finished downloading — the difference between a shareable MP4 and one that
  // has to be fetched whole first.
  args.push('-movflags', '+faststart')
  // Named explicitly because the file is written to a `.part` sidecar first,
  // and ffmpeg would otherwise have no extension to infer the muxer from.
  args.push('-f', 'mp4', output)
  return args
}
