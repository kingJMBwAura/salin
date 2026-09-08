/** Reading real files with real ffprobe — the input every other decision rests on. */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { parseProbe, probe } from '../src/main/probe'
import { cleanWorkspace, makeWorkspace, type Workspace } from './fixtures'

let work: Workspace

beforeAll(async () => {
  work = await makeWorkspace()
}, 120_000)

afterAll(async () => {
  await cleanWorkspace(work)
})

describe('probe', () => {
  it('reads container, duration and streams from a Matroska file', async () => {
    const info = await probe(work.copyable)
    expect(info.container).toMatch(/matroska/)
    expect(info.durationSec).toBeCloseTo(2, 0)
    expect(info.sizeBytes).toBeGreaterThan(0)
    expect(info.video?.codec).toBe('h264')
    expect(info.video?.width).toBe(192)
    expect(info.video?.height).toBe(108)
    expect(info.audio).toHaveLength(1)
    expect(info.audio[0].codec).toBe('aac')
  })

  it('numbers audio tracks within their own type, and keeps their languages', async () => {
    const info = await probe(work.multiAudio)
    expect(info.audio.map((track) => track.typeIndex)).toEqual([0, 1, 2])
    expect(info.audio.map((track) => track.language)).toEqual(['eng', 'jpn', 'fra'])
    // ffprobe's absolute indices start after the video stream, which is exactly
    // the off-by-one that would export the wrong language.
    expect(info.audio.map((track) => track.index)).toEqual([1, 2, 3])
  })

  it('reports which track the file marks as default', async () => {
    const info = await probe(work.multiAudio)
    expect(info.audio.filter((track) => track.isDefault).map((t) => t.language)).toEqual(['jpn'])
  })

  it('recognises SubRip as text, so it can be carried into an MP4', async () => {
    const info = await probe(work.withSubtitles)
    expect(info.subtitles).toHaveLength(1)
    expect(info.subtitles[0].codec).toBe('subrip')
    expect(info.subtitles[0].text).toBe(true)
    expect(info.subtitles[0].language).toBe('eng')
  })

  it('reads a file whose name would break a shell', async () => {
    const info = await probe(work.hostileName)
    expect(info.video?.codec).toBe('h264')
    expect(info.filename).toBe("tricky: it's, a [test].mkv")
  })

  it('refuses a file that is not media, by name, with ffprobe\'s own words', async () => {
    await expect(probe(work.junk)).rejects.toThrow(/junk\.mkv/)
  })
})

describe('parseProbe', () => {
  it('treats an explicit "und" language tag as no language at all', () => {
    const info = parseProbe(
      {
        format: { format_name: 'matroska', duration: '1', size: '10' },
        streams: [
          { index: 0, codec_type: 'audio', codec_name: 'aac', tags: { language: 'und' } },
          { index: 1, codec_type: 'audio', codec_name: 'aac', tags: { LANGUAGE: 'eng' } }
        ]
      },
      '/x/y.mkv'
    )
    expect(info.audio[0].language).toBe('')
    // MP4 sometimes writes the tag in capitals; the lookup is case-insensitive.
    expect(info.audio[1].language).toBe('eng')
  })

  it('ignores cover art, which is a video stream that is not a video', () => {
    const info = parseProbe(
      {
        format: { format_name: 'mp3', duration: '1', size: '10' },
        streams: [
          { index: 0, codec_type: 'audio', codec_name: 'mp3' },
          {
            index: 1,
            codec_type: 'video',
            codec_name: 'mjpeg',
            disposition: { attached_pic: 1 }
          }
        ]
      },
      '/x/song.mp3'
    )
    expect(info.video).toBeNull()
  })

  it('keeps only the first real video stream', () => {
    const info = parseProbe(
      {
        format: { format_name: 'matroska', duration: '1', size: '10' },
        streams: [
          { index: 0, codec_type: 'video', codec_name: 'h264', width: 1920, height: 1080 },
          { index: 1, codec_type: 'video', codec_name: 'h264', width: 320, height: 240 }
        ]
      },
      '/x/y.mkv'
    )
    expect(info.video?.width).toBe(1920)
  })
})
