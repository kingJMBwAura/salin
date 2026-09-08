/**
 * The decision matrix, with no ffmpeg involved.
 *
 * Getting these wrong is either silent — the user gets the wrong language, or
 * an MP4 that Apple's decoders refuse — or expensive: a twenty-minute transcode
 * where a three-second copy would have done. Both are worth pinning down.
 */
import { describe, expect, it } from 'vitest'
import type { AudioStream, JobOptions, MediaInfo, SubtitleStream, VideoStream } from '../src/shared/types'
import { buildArgs, buildPlan, quoteFilterPath } from '../src/shared/plan'

function video(codec: string): VideoStream {
  return {
    index: 0, typeIndex: 0, codec, language: '', title: '', isDefault: true,
    width: 1920, height: 1080, fps: 24, pixelFormat: 'yuv420p'
  }
}

function audio(codec: string, typeIndex = 0, language = 'eng'): AudioStream {
  return {
    index: typeIndex + 1, typeIndex, codec, language, title: '', isDefault: typeIndex === 0,
    channels: 2, channelLayout: 'stereo', sampleRate: 48000, bitrateKbps: 192
  }
}

function subtitle(codec: string, text: boolean, typeIndex = 0): SubtitleStream {
  return { index: 9 + typeIndex, typeIndex, codec, language: 'eng', title: '', isDefault: false, text }
}

function media(overrides: Partial<MediaInfo> = {}): MediaInfo {
  return {
    path: '/films/example.mkv',
    filename: 'example.mkv',
    container: 'matroska,webm',
    durationSec: 120,
    sizeBytes: 1024,
    video: video('h264'),
    audio: [audio('aac')],
    subtitles: [],
    ...overrides
  }
}

function options(overrides: Partial<JobOptions> = {}): JobOptions {
  return {
    format: 'mp4',
    audioIndex: 0,
    subtitleMode: 'drop',
    subtitleIndex: -1,
    forceEncode: false,
    videoPreset: 'fast',
    crf: 21,
    mp3Bitrate: 192,
    ...overrides
  }
}

const argsFor = (info: MediaInfo, opts: JobOptions): string[] =>
  buildArgs(info, opts, info.path, '/out/example.mp4')

/** Value that follows a flag, e.g. flagValue(args, '-c:v') === 'copy'. */
function flagValue(args: string[], flag: string): string | undefined {
  const at = args.indexOf(flag)
  return at === -1 ? undefined : args[at + 1]
}

describe('MP4: what gets copied', () => {
  it('copies h264 video and aac audio, and calls it a remux', () => {
    const plan = buildPlan(media(), options())
    expect(plan.mode).toBe('remux')
    expect(plan.video.action).toBe('copy')
    expect(plan.audio.action).toBe('copy')
    expect(plan.reasons).toEqual([])

    const args = argsFor(media(), options())
    expect(flagValue(args, '-c:v')).toBe('copy')
    expect(flagValue(args, '-c:a')).toBe('copy')
    expect(flagValue(args, '-movflags')).toBe('+faststart')
    // The muxer is named rather than inferred, because convert.ts writes to a
    // `.part` sidecar that has no meaningful extension.
    expect(flagValue(args, '-f')).toBe('mp4')
    expect(args[args.length - 1]).toBe('/out/example.mp4')
  })

  it('tags copied HEVC as hvc1, without which QuickTime refuses to play it', () => {
    const info = media({ video: video('hevc') })
    expect(buildPlan(info, options()).video.action).toBe('copy')
    const args = argsFor(info, options())
    expect(flagValue(args, '-c:v')).toBe('copy')
    expect(flagValue(args, '-tag:v')).toBe('hvc1')
  })

  it('leaves h264 untagged — hvc1 is an HEVC-only fix', () => {
    expect(argsFor(media(), options())).not.toContain('-tag:v')
  })

  it('re-encodes VP9, which an MP4 may legally hold but players will not open', () => {
    const info = media({ video: video('vp9') })
    const plan = buildPlan(info, options())
    expect(plan.mode).toBe('encode')
    expect(plan.video.action).toBe('encode')
    expect(plan.reasons.join(' ')).toMatch(/VP9/)
    expect(flagValue(argsFor(info, options()), '-c:v')).toBe('libx264')
  })

  it('turns AC-3 audio into AAC and says why', () => {
    const info = media({ audio: [audio('ac3')] })
    const plan = buildPlan(info, options())
    expect(plan.audio.action).toBe('encode')
    expect(plan.mode).toBe('encode')
    expect(plan.reasons.join(' ')).toMatch(/AC-3/)
    const args = argsFor(info, options())
    expect(flagValue(args, '-c:a')).toBe('aac')
    expect(flagValue(args, '-b:a')).toBe('192k')
  })

  it('honours a forced re-encode over a stream it could have copied', () => {
    const plan = buildPlan(media(), options({ forceEncode: true }))
    expect(plan.video.action).toBe('encode')
    expect(plan.mode).toBe('encode')
    const args = argsFor(media(), options({ forceEncode: true }))
    expect(flagValue(args, '-preset')).toBe('fast')
    expect(flagValue(args, '-crf')).toBe('21')
    expect(flagValue(args, '-pix_fmt')).toBe('yuv420p')
    // Audio was always copyable and the force only concerns the picture.
    expect(flagValue(args, '-c:a')).toBe('copy')
  })
})

describe('stream selection', () => {
  it('maps the chosen audio track by its per-type index, not its absolute one', () => {
    const info = media({
      audio: [audio('aac', 0, 'eng'), audio('aac', 1, 'jpn'), audio('aac', 2, 'fra')]
    })
    const args = argsFor(info, options({ audioIndex: 2 }))
    expect(args).toContain('0:a:2')
    expect(args).not.toContain('0:a:0')
  })

  it('drops audio entirely when asked', () => {
    const args = argsFor(media(), options({ audioIndex: -1 }))
    expect(args.filter((a) => a.startsWith('0:a'))).toEqual([])
    expect(args).not.toContain('-c:a')
  })

  it('refuses an audio track the file does not have', () => {
    expect(buildPlan(media(), options({ audioIndex: 3 })).problems).not.toEqual([])
  })
})

describe('subtitles', () => {
  const textSubs = media({ subtitles: [subtitle('subrip', true)] })
  const bitmapSubs = media({ subtitles: [subtitle('hdmv_pgs_subtitle', false)] })

  it('carries text subtitles into MP4 as mov_text', () => {
    const opts = options({ subtitleMode: 'soft', subtitleIndex: 0 })
    expect(buildPlan(textSubs, opts).problems).toEqual([])
    const args = argsFor(textSubs, opts)
    expect(args).toContain('0:s:0')
    expect(flagValue(args, '-c:s')).toBe('mov_text')
  })

  it('refuses to soft-mux bitmap subtitles, which are pictures', () => {
    const plan = buildPlan(bitmapSubs, options({ subtitleMode: 'soft', subtitleIndex: 0 }))
    expect(plan.problems.join(' ')).toMatch(/PGS/)
    expect(plan.problems.join(' ')).toMatch(/burn/i)
  })

  it('draws no subtitle leg when the chosen handling cannot run', () => {
    // The card already explains why; a trace still showing "PGS → mov_text ·
    // copy" next to that explanation would contradict it.
    const plan = buildPlan(bitmapSubs, options({ subtitleMode: 'soft', subtitleIndex: 0 }))
    expect(plan.subtitles.action).toBe('drop')
  })

  it('burning text subtitles forces a video re-encode', () => {
    const plan = buildPlan(textSubs, options({ subtitleMode: 'burn', subtitleIndex: 0 }))
    expect(plan.mode).toBe('encode')
    expect(plan.video.action).toBe('encode')
    expect(plan.reasons.join(' ')).toMatch(/every frame/)
  })

  it('renders burned-in text through the subtitles filter, reading the source by index', () => {
    const args = argsFor(textSubs, options({ subtitleMode: 'burn', subtitleIndex: 0 }))
    expect(flagValue(args, '-vf')).toBe(
      `subtitles=filename='/films/example.mkv':si=0`
    )
  })

  it('composites burned-in bitmaps with overlay, which needs no libass', () => {
    const args = argsFor(bitmapSubs, options({ subtitleMode: 'burn', subtitleIndex: 0 }))
    expect(flagValue(args, '-filter_complex')).toBe('[0:v:0][0:s:0]overlay[vout]')
    expect(args).toContain('[vout]')
    expect(args).not.toContain('-vf')
  })

  it('blocks burning text subtitles when this ffmpeg has no libass', () => {
    const plan = buildPlan(
      textSubs,
      options({ subtitleMode: 'burn', subtitleIndex: 0 }),
      { burnText: false }
    )
    expect(plan.problems.join(' ')).toMatch(/libass/)
  })

  it('still allows burning bitmap subtitles without libass', () => {
    const plan = buildPlan(
      bitmapSubs,
      options({ subtitleMode: 'burn', subtitleIndex: 0 }),
      { burnText: false }
    )
    expect(plan.problems).toEqual([])
  })
})

describe('MP3', () => {
  it('is always an encode, and leaves the picture behind', () => {
    const plan = buildPlan(media(), options({ format: 'mp3' }))
    expect(plan.mode).toBe('encode')
    expect(plan.video.action).toBe('drop')
    expect(plan.subtitles.action).toBe('drop')
    expect(plan.audio.action).toBe('encode')
  })

  it('encodes the selected track at the chosen bitrate with no video', () => {
    const info = media({ audio: [audio('aac', 0), audio('aac', 1, 'jpn')] })
    const args = buildArgs(info, options({ format: 'mp3', audioIndex: 1, mp3Bitrate: 320 }), info.path, '/out/x.mp3')
    expect(args).toContain('-vn')
    expect(args).toContain('0:a:1')
    expect(flagValue(args, '-c:a')).toBe('libmp3lame')
    expect(flagValue(args, '-b:a')).toBe('320k')
    expect(flagValue(args, '-f')).toBe('mp3')
    expect(args).not.toContain('-c:v')
  })

  it('will not produce an MP3 from a file with no audio', () => {
    const info = media({ audio: [] })
    expect(buildPlan(info, options({ format: 'mp3', audioIndex: -1 })).problems).not.toEqual([])
  })
})

describe('quoteFilterPath', () => {
  it('leaves an ordinary path alone but for the quotes', () => {
    expect(quoteFilterPath('/films/example.mkv')).toBe(`'/films/example.mkv'`)
  })

  it('escapes the colon that would otherwise end the option', () => {
    expect(quoteFilterPath('/films/a: b.mkv')).toBe(`'/films/a\\: b.mkv'`)
  })

  it('closes and reopens the quoted run around an apostrophe', () => {
    // A backslash is not an escape inside a quoted run, so the quote has to be
    // emitted outside it — and escaped again for the filter's own parser.
    expect(quoteFilterPath("/films/it's.mkv")).toBe(`'/films/it\\'\\''s.mkv'`)
  })

  it('doubles a backslash, for Windows paths', () => {
    expect(quoteFilterPath('C:\\films\\a.mkv')).toBe(`'C\\:\\\\films\\\\a.mkv'`)
  })
})
