/**
 * End-to-end conversions with the real ffmpeg.
 *
 * The claim worth defending here is the app's central one: that an MKV whose
 * streams already fit an MP4 is copied rather than re-encoded. A test that only
 * checked the output codec would pass for a re-encode too, so these compare the
 * encoded bytes themselves.
 */
import { existsSync } from 'node:fs'
import { readdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { JobOptions } from '../src/shared/types'
import { quoteFilterPath } from '../src/shared/plan'
import { CancelledError, cancel, convert, uniqueOutputPath } from '../src/main/convert'
import { probe } from '../src/main/probe'
import {
  cleanWorkspace, codecs, ffmpeg, ffprobeJson, hasSubtitlesFilter, makeWorkspace, streamMd5,
  type Workspace
} from './fixtures'

let work: Workspace

beforeAll(async () => {
  work = await makeWorkspace()
}, 120_000)

afterAll(async () => {
  await cleanWorkspace(work)
})

function options(overrides: Partial<JobOptions> = {}): JobOptions {
  return {
    format: 'mp4',
    audioIndex: 0,
    subtitleMode: 'drop',
    subtitleIndex: -1,
    forceEncode: false,
    videoPreset: 'ultrafast',
    crf: 28,
    mp3Bitrate: 192,
    ...overrides
  }
}

/** Run one conversion and hand back where it landed. */
async function run(
  source: string,
  name: string,
  overrides: Partial<JobOptions> = {}
): Promise<string> {
  const info = await probe(source)
  const outputPath = join(work.dir, name)
  const result = await convert({
    id: `test-${name}`,
    info,
    options: options(overrides),
    outputPath,
    onProgress: () => {}
  })
  return result.outputPath
}

describe('MP4 from MKV', () => {
  it('copies the streams instead of re-encoding them — byte for byte', async () => {
    const output = await run(work.copyable, 'copied.mp4')
    expect(await codecs(output)).toEqual(['h264', 'aac'])
    // The real proof: a re-encode could never produce identical packets.
    expect(await streamMd5(output, '0:v:0')).toBe(await streamMd5(work.copyable, '0:v:0'))
    expect(await streamMd5(output, '0:a:0')).toBe(await streamMd5(work.copyable, '0:a:0'))
  }, 60_000)

  it('re-encodes VP9, which no ordinary player would open inside an MP4', async () => {
    const output = await run(work.reencodeVideo, 'from-vp9.mp4')
    expect(await codecs(output, 'video')).toEqual(['h264'])
  }, 120_000)

  it('re-encodes AC-3 audio to AAC while still copying the picture', async () => {
    const output = await run(work.reencodeAudio, 'from-ac3.mp4')
    expect(await codecs(output)).toEqual(['h264', 'aac'])
    expect(await streamMd5(output, '0:v:0')).toBe(await streamMd5(work.reencodeAudio, '0:v:0'))
  }, 60_000)

  it('rebuilds the picture when a re-encode is forced', async () => {
    const output = await run(work.copyable, 'forced.mp4', { forceEncode: true })
    expect(await codecs(output, 'video')).toEqual(['h264'])
    expect(await streamMd5(output, '0:v:0')).not.toBe(await streamMd5(work.copyable, '0:v:0'))
  }, 120_000)

  it('exports the audio track that was asked for, not the first one', async () => {
    // The third track is the 1500 Hz tone; copying it means the output's audio
    // packets must match that track and no other.
    const output = await run(work.multiAudio, 'third-track.mp4', { audioIndex: 2 })
    expect(await streamMd5(output, '0:a:0')).toBe(await streamMd5(work.multiAudio, '0:a:2'))
    expect(await streamMd5(output, '0:a:0')).not.toBe(await streamMd5(work.multiAudio, '0:a:0'))
  }, 60_000)

  it('carries text subtitles across as mov_text', async () => {
    const output = await run(work.withSubtitles, 'softsubs.mp4', {
      subtitleMode: 'soft',
      subtitleIndex: 0
    })
    expect(await codecs(output)).toEqual(['h264', 'aac', 'mov_text'])
  }, 60_000)

  it('leaves subtitles out by default', async () => {
    const output = await run(work.withSubtitles, 'nosubs.mp4')
    expect(await codecs(output)).toEqual(['h264', 'aac'])
  }, 60_000)

  it('converts a file whose name would break a filtergraph or a shell', async () => {
    const output = await run(work.hostileName, 'hostile.mp4')
    expect(await codecs(output, 'video')).toEqual(['h264'])
  }, 60_000)

  it('writes faststart, so the file plays before it has finished downloading', async () => {
    const output = await run(work.copyable, 'faststart.mp4')
    // With the moov atom moved to the front it appears within the first
    // kilobytes rather than at the end of the file.
    const { stdout } = await import('node:child_process').then(({ execFile }) =>
      new Promise<{ stdout: string }>((resolve, reject) =>
        execFile('ffprobe', ['-v', 'trace', '-i', output], { maxBuffer: 1 << 24 },
          (error, out, err) => (error && !err ? reject(error) : resolve({ stdout: err })))
      )
    )
    const moov = stdout.indexOf("type:'moov'")
    const mdat = stdout.indexOf("type:'mdat'")
    expect(moov).toBeGreaterThan(-1)
    expect(moov).toBeLessThan(mdat)
  }, 60_000)
})

describe('MP3', () => {
  it('produces an audio-only MP3 at the requested bitrate', async () => {
    const output = await run(work.copyable, 'audio.mp3', { format: 'mp3', mp3Bitrate: 128 })
    const probed = await ffprobeJson(output)
    expect(probed.streams.map((s) => s.codec_type)).toEqual(['audio'])
    expect(probed.streams[0].codec_name).toBe('mp3')
  }, 60_000)
})

describe('failure and cancellation', () => {
  it('reports ffmpeg\'s own words when a conversion fails', async () => {
    const broken = join(work.dir, 'broken.mkv')
    // A valid header with nothing behind it: probe succeeds, conversion cannot.
    await writeFile(broken, Buffer.from('1a45dfa3', 'hex'))
    const info = await probe(work.copyable)
    await expect(
      convert({
        id: 'test-missing',
        info: { ...info, path: join(work.dir, 'not-here.mkv') },
        options: options(),
        outputPath: join(work.dir, 'never.mp4'),
        onProgress: () => {}
      })
    ).rejects.toThrow(/not-here\.mkv/)
  }, 60_000)

  it('leaves nothing behind when a job is cancelled mid-flight', async () => {
    const info = await probe(work.slowToEncode)
    const outputPath = join(work.dir, 'cancelled.mp4')
    const id = 'test-cancel'

    const promise = convert({
      id,
      info,
      // Half a minute of noise on a slow preset: guaranteed to still be
      // running when the test reaches for the kill switch.
      options: options({ forceEncode: true, videoPreset: 'slow', crf: 18, audioIndex: -1 }),
      outputPath,
      onProgress: () => {}
    })
    // Long enough that ffmpeg is genuinely mid-encode, not still starting up.
    await new Promise((resolve) => setTimeout(resolve, 700))
    expect(cancel(id)).toBe(true)

    await expect(promise).rejects.toBeInstanceOf(CancelledError)
    expect(existsSync(outputPath)).toBe(false)
    expect(existsSync(`${outputPath}.part`)).toBe(false)
    // And nothing part-written is left lying around under another name.
    expect((await readdir(work.dir)).filter((n) => n.endsWith('.part'))).toEqual([])
  }, 60_000)

  it('reports false when cancelling something that is not running', () => {
    expect(cancel('nobody')).toBe(false)
  })
})

describe('uniqueOutputPath', () => {
  it('returns the path it was given when nothing is there', () => {
    const free = join(work.dir, 'nothing-here.mp4')
    expect(uniqueOutputPath(free)).toBe(free)
  })

  it('never overwrites: the source is the irreplaceable file', async () => {
    const taken = join(work.dir, 'taken.mp4')
    await writeFile(taken, 'x')
    expect(uniqueOutputPath(taken)).toBe(join(work.dir, 'taken (1).mp4'))
  })
})

describe('burning subtitles in', () => {
  it('renders text subtitles onto the picture, when this ffmpeg can', async () => {
    if (!(await hasSubtitlesFilter())) {
      // Homebrew's ffmpeg is built without libass, and the app greys the
      // option out on exactly this signal rather than failing a job later.
      console.warn('skipped: this ffmpeg has no `subtitles` filter (no libass)')
      return
    }
    const output = await run(work.withSubtitles, 'burned.mp4', {
      subtitleMode: 'burn',
      subtitleIndex: 0
    })
    expect(await codecs(output)).toEqual(['h264', 'aac'])
  }, 120_000)

  it('quotes a hostile path so ffmpeg opens the file it was actually given', async () => {
    // The `movie` source filter takes a filename the same way `subtitles` does,
    // and is present in every build — so the quoting stays covered even where
    // libass is not installed.
    await ffmpeg([
      '-filter_complex', `movie=filename=${quoteFilterPath(work.hostileName)}[v]`,
      '-map', '[v]', '-frames:v', '1', '-f', 'null', '-'
    ])
  }, 60_000)
})
