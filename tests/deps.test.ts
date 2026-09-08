/**
 * The PATH problem.
 *
 * An app opened from Finder inherits almost nothing — certainly not the PATH a
 * login shell would have built — so `ffmpeg` is invisible unless the places it
 * actually lives are added explicitly. This is the single difference between an
 * app that works under `npm run dev` and one that works when double-clicked,
 * and it is invisible in development, where the PATH is always right.
 */
import { afterEach, describe, expect, it } from 'vitest'
import { probeCapabilities, probeDependencies, spawnEnv, which } from '../src/main/deps'

const ORIGINAL_PATH = process.env.PATH

afterEach(() => {
  process.env.PATH = ORIGINAL_PATH
})

describe('with no PATH at all — the Finder case', () => {
  it('still finds ffmpeg', async () => {
    process.env.PATH = ''
    expect(await which('ffmpeg')).toMatch(/ffmpeg$/)
  })

  it('still reports both tools as present, with versions', async () => {
    process.env.PATH = ''
    const deps = await probeDependencies()
    expect(deps.map((d) => d.name)).toEqual(['ffmpeg', 'ffprobe'])
    expect(deps.every((d) => d.found)).toBe(true)
    expect(deps.every((d) => d.version.length > 0)).toBe(true)
  })

  it('still knows what this ffmpeg build can do', async () => {
    process.env.PATH = ''
    expect(typeof (await probeCapabilities()).burnText).toBe('boolean')
  })

  it('rebuilds a PATH that contains the usual install locations', () => {
    process.env.PATH = ''
    const path = spawnEnv().PATH ?? ''
    expect(path.length).toBeGreaterThan(0)
    expect(path.split(':').filter(Boolean).length).toBeGreaterThan(1)
  })
})

describe('which', () => {
  it('returns empty for something that is not installed, rather than throwing', async () => {
    expect(await which('definitely-not-a-real-binary-9f3a')).toBe('')
  })

  it('reports an install command alongside anything missing', async () => {
    const deps = await probeDependencies()
    expect(deps.every((d) => d.fix.includes('ffmpeg'))).toBe(true)
  })
})
