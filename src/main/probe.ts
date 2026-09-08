/**
 * Reading a file's streams with ffprobe.
 *
 * Everything downstream — the remux-or-encode decision, the audio track picker,
 * whether a subtitle can be soft-muxed — is derived from this one call, so it
 * runs the moment a file is added rather than when the job starts. The user
 * sees what will happen before committing to it.
 */

import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { statSync } from 'node:fs'
import { basename } from 'node:path'
import type { AudioStream, MediaInfo, SubtitleStream, VideoStream } from '../shared/types'
import { isTextSubtitle } from '../shared/plan'
import { requireBinary, spawnEnv } from './deps'

const run = promisify(execFile)

interface RawStream {
  index?: number
  codec_type?: string
  codec_name?: string
  width?: number
  height?: number
  r_frame_rate?: string
  pix_fmt?: string
  channels?: number
  channel_layout?: string
  sample_rate?: string
  bit_rate?: string
  tags?: Record<string, string>
  disposition?: Record<string, number>
}

interface RawProbe {
  format?: { format_name?: string; duration?: string; size?: string }
  streams?: RawStream[]
}

function num(value: string | number | undefined): number {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

/** r_frame_rate arrives as a rational like "30000/1001". */
function rate(value: string | undefined): number {
  if (!value) return 0
  const [top, bottom] = value.split('/')
  const denominator = num(bottom)
  if (!denominator) return 0
  return Math.round((num(top) / denominator) * 1000) / 1000
}

/** Tag lookup is case-insensitive: MKV writes `language`, MP4 sometimes `LANGUAGE`. */
function tag(stream: RawStream, name: string): string {
  const tags = stream.tags ?? {}
  const key = Object.keys(tags).find((k) => k.toLowerCase() === name)
  const value = key ? tags[key] : ''
  // ffprobe reports 'und' for an explicitly-undefined language; treat it as absent.
  return value && value !== 'und' ? value : ''
}

/**
 * Turn ffprobe's flat stream list into the shape the rest of the app uses.
 *
 * Split out from `probe` so the mapping — in particular the per-type indices
 * ffmpeg's `-map` needs — can be tested without running ffprobe.
 */
export function parseProbe(raw: RawProbe, path: string): MediaInfo {
  const streams = raw.streams ?? []
  const audio: AudioStream[] = []
  const subtitles: SubtitleStream[] = []
  let video: VideoStream | null = null

  // Counted per type, because `-map 0:a:1` means "the second audio stream",
  // not "stream 1". ffprobe's own `index` is absolute across all types.
  const seen = { video: 0, audio: 0, subtitle: 0 }

  for (const stream of streams) {
    const codec = stream.codec_name ?? ''
    const base = {
      index: num(stream.index),
      codec,
      language: tag(stream, 'language'),
      title: tag(stream, 'title'),
      isDefault: (stream.disposition?.default ?? 0) === 1
    }

    if (stream.codec_type === 'video') {
      // Cover art in an audio file is an "attached picture" video stream, not
      // something to convert. Skipping it keeps `video` meaning what it says.
      if ((stream.disposition?.attached_pic ?? 0) === 1) continue
      const typeIndex = seen.video++
      // Only the first real video stream matters; MP4 output carries one.
      if (video) continue
      video = {
        ...base,
        typeIndex,
        width: num(stream.width),
        height: num(stream.height),
        fps: rate(stream.r_frame_rate),
        pixelFormat: stream.pix_fmt ?? ''
      }
    } else if (stream.codec_type === 'audio') {
      audio.push({
        ...base,
        typeIndex: seen.audio++,
        channels: num(stream.channels),
        channelLayout: stream.channel_layout ?? '',
        sampleRate: num(stream.sample_rate),
        bitrateKbps: Math.round(num(stream.bit_rate) / 1000)
      })
    } else if (stream.codec_type === 'subtitle') {
      subtitles.push({
        ...base,
        typeIndex: seen.subtitle++,
        text: isTextSubtitle(codec)
      })
    }
  }

  return {
    path,
    filename: basename(path),
    container: raw.format?.format_name ?? '',
    durationSec: num(raw.format?.duration),
    sizeBytes: num(raw.format?.size),
    video,
    audio,
    subtitles
  }
}

/** Throws with ffprobe's own message when the file isn't media it can read. */
export async function probe(path: string): Promise<MediaInfo> {
  const ffprobe = await requireBinary('ffprobe')
  let stdout: string
  try {
    ;({ stdout } = await run(
      ffprobe,
      ['-v', 'error', '-show_format', '-show_streams', '-of', 'json', path],
      { env: spawnEnv(), maxBuffer: 1 << 24 }
    ))
  } catch (error) {
    const stderr = String((error as { stderr?: string }).stderr ?? '').trim()
    throw new Error(
      `ffprobe could not read ${basename(path)}${stderr ? `:\n${stderr.split('\n').slice(-3).join('\n')}` : '.'}`
    )
  }

  const info = parseProbe(JSON.parse(stdout) as RawProbe, path)
  if (!info.video && info.audio.length === 0) {
    throw new Error(`${basename(path)} has no video or audio streams.`)
  }
  // ffprobe reports size from the container header, which some MKVs get wrong;
  // the filesystem is the authority.
  if (!info.sizeBytes) {
    info.sizeBytes = statSync(path).size
  }
  return info
}
