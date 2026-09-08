/**
 * Test media, built by ffmpeg itself.
 *
 * Nothing here is checked in: every fixture is generated from lavfi sources at
 * the start of a run and thrown away at the end. That keeps the repository free
 * of binaries and means the tests exercise the same ffmpeg the app will use,
 * rather than a recording of one.
 */

import { execFile } from 'node:child_process'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'

const run = promisify(execFile)

export async function ffmpeg(args: string[]): Promise<void> {
  await run('ffmpeg', ['-y', '-loglevel', 'error', ...args], { maxBuffer: 1 << 24 })
}

export async function ffprobeJson(path: string): Promise<{
  format: { format_name: string; duration: string }
  streams: {
    index: number
    codec_type: string
    codec_name: string
    tags?: Record<string, string>
  }[]
}> {
  const { stdout } = await run('ffprobe', [
    '-v', 'error', '-show_format', '-show_streams', '-of', 'json', path
  ], { maxBuffer: 1 << 24 })
  return JSON.parse(stdout)
}

/** Codec names of a file's streams, in order. */
export async function codecs(path: string, type?: string): Promise<string[]> {
  const probe = await ffprobeJson(path)
  return probe.streams
    .filter((s) => !type || s.codec_type === type)
    .map((s) => s.codec_name)
}

/**
 * The MD5 of a stream's encoded packets.
 *
 * This is how a test can prove a stream was *copied* rather than re-encoded:
 * a re-encode always produces different bytes, however similar it looks.
 */
export async function streamMd5(path: string, map: string): Promise<string> {
  const { stdout } = await run('ffmpeg', [
    '-v', 'error', '-i', path, '-map', map, '-c', 'copy', '-f', 'md5', '-'
  ], { maxBuffer: 1 << 24 })
  return stdout.trim()
}

/** True when this ffmpeg was built with libass, and so can burn in text subs. */
export async function hasSubtitlesFilter(): Promise<boolean> {
  const { stdout } = await run('ffmpeg', ['-hide_banner', '-filters'], { maxBuffer: 1 << 22 })
  return /^\s*\S+\s+subtitles\s/m.test(stdout)
}

export interface Workspace {
  dir: string
  /** h264 video + aac audio in Matroska: the straight-copy case. */
  copyable: string
  /** vp9 video + aac audio: an MP4 can't usefully hold the video. */
  reencodeVideo: string
  /** h264 video + ac3 audio: an MP4 can't hold the audio. */
  reencodeAudio: string
  /** h264 + three audio tracks tagged eng/jpn/fra, the second one default. */
  multiAudio: string
  /** h264 + aac + a SubRip subtitle track. */
  withSubtitles: string
  /** A name carrying every character that breaks a naive filtergraph. */
  hostileName: string
  /**
   * Long and busy enough that re-encoding it takes seconds.
   *
   * The cancellation test needs a job that is still running when it reaches for
   * the kill switch; the two-second clips finish before the test can blink.
   */
  slowToEncode: string
  /** Not media at all. */
  junk: string
}

const VIDEO = (seconds: number): string[] => [
  '-f', 'lavfi', '-i', `color=c=navy:s=192x108:r=15:d=${seconds}`
]
const TONE = (seconds: number, hz: number): string[] => [
  '-f', 'lavfi', '-i', `sine=frequency=${hz}:duration=${seconds}`
]

export async function makeWorkspace(): Promise<Workspace> {
  const dir = await mkdtemp(join(tmpdir(), 'salin-test-'))
  const at = (name: string): string => join(dir, name)

  const copyable = at('copyable.mkv')
  await ffmpeg([
    ...VIDEO(2), ...TONE(2, 440),
    '-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p',
    '-c:a', 'aac', '-shortest', copyable
  ])

  const reencodeVideo = at('vp9.mkv')
  await ffmpeg([
    ...VIDEO(1), ...TONE(1, 440),
    '-c:v', 'libvpx-vp9', '-deadline', 'realtime', '-cpu-used', '8',
    '-c:a', 'aac', '-shortest', reencodeVideo
  ])

  const reencodeAudio = at('ac3.mkv')
  await ffmpeg([
    ...VIDEO(1), ...TONE(1, 440),
    '-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p',
    '-c:a', 'ac3', '-shortest', reencodeAudio
  ])

  // Three distinguishable tones so a test can prove the *selected* track is
  // the one that came out, not merely that some audio did.
  const multiAudio = at('multi.mkv')
  await ffmpeg([
    ...VIDEO(1), ...TONE(1, 300), ...TONE(1, 900), ...TONE(1, 1500),
    '-map', '0:v', '-map', '1:a', '-map', '2:a', '-map', '3:a',
    '-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p', '-c:a', 'aac',
    '-metadata:s:a:0', 'language=eng',
    '-metadata:s:a:1', 'language=jpn',
    '-metadata:s:a:2', 'language=fra',
    '-disposition:a:0', '0', '-disposition:a:1', 'default',
    '-shortest', multiAudio
  ])

  const srt = at('subs.srt')
  await writeFile(srt, '1\n00:00:00,200 --> 00:00:01,800\nO\'Brien: it works\n', 'utf8')

  const withSubtitles = at('subs.mkv')
  await ffmpeg([
    ...VIDEO(2), ...TONE(2, 440), '-i', srt,
    '-map', '0:v', '-map', '1:a', '-map', '2:s',
    '-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p',
    '-c:a', 'aac', '-c:s', 'srt', '-shortest',
    '-metadata:s:s:0', 'language=eng', withSubtitles
  ])

  const hostileName = at("tricky: it's, a [test].mkv")
  await ffmpeg([
    ...VIDEO(1), ...TONE(1, 440),
    '-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p',
    '-c:a', 'aac', '-shortest', hostileName
  ])

  // Noise rather than a flat colour: a solid frame compresses to almost
  // nothing and would encode as fast as it could be read.
  const slowToEncode = at('long.mkv')
  await ffmpeg([
    // lavfi takes a whole filtergraph as its input description.
    '-f', 'lavfi',
    '-i', 'color=c=gray:s=640x360:r=25:d=30,noise=alls=80:allf=t+u,format=yuv420p',
    '-c:v', 'libx264', '-preset', 'ultrafast', '-crf', '30', slowToEncode
  ])

  const junk = at('junk.mkv')
  await writeFile(junk, 'this is not a video', 'utf8')

  return {
    dir, copyable, reencodeVideo, reencodeAudio, multiAudio, withSubtitles, hostileName,
    slowToEncode, junk
  }
}

export async function cleanWorkspace(workspace: Workspace | undefined): Promise<void> {
  // Tolerates a run that failed while building fixtures, so the real error is
  // the one reported rather than a cascade from the teardown.
  if (workspace?.dir) await rm(workspace.dir, { recursive: true, force: true })
}
