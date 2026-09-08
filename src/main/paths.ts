/**
 * Where Salin keeps things.
 *
 * Only job records live here — converted files go wherever the user asked for
 * them, which is the entire point of a converter. Nothing large accumulates in
 * the app's own folder.
 */

import { app } from 'electron'
import { join } from 'node:path'
import { mkdirSync } from 'node:fs'

export function dataDir(): string {
  return app.getPath('userData')
}

export function jobsDir(): string {
  return join(dataDir(), 'jobs')
}

export function ensureDirs(): void {
  mkdirSync(jobsDir(), { recursive: true })
}
