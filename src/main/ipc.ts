/** Every IPC handler, in one place. */

import { BrowserWindow, dialog, ipcMain, shell } from 'electron'
import { existsSync } from 'node:fs'
import { basename, dirname, extname, join } from 'node:path'
import type {
  Job, JobOptions, MediaInfo, OutputFormat, ProbeResult, Settings
} from '../shared/types'
import {
  APP_NAME, CRF_MAX, CRF_MIN, INPUT_EXTENSIONS, MP3_BITRATES, VIDEO_PRESETS
} from './config'
import { uniqueOutputPath } from './convert'
import { probeCapabilities, probeDependencies } from './deps'
import { buildPlan } from '../shared/plan'
import { probe } from './probe'
import * as queue from './queue'
import { getSettings, saveSettings } from './settings'
import * as store from './store'

function allowedExtension(path: string): boolean {
  return INPUT_EXTENSIONS.includes(extname(path).toLowerCase().replace(/^\./, ''))
}

/**
 * Where a finished file goes.
 *
 * `folderOverride` is the "ask me each time" answer for one batch; without it
 * the setting decides, and beside the source is the fallback that always works.
 */
function resolveOutputPath(
  info: MediaInfo,
  format: OutputFormat,
  settings: Settings,
  folderOverride?: string
): string {
  const chosen =
    folderOverride ||
    (settings.outputMode === 'folder' && settings.outputFolder ? settings.outputFolder : '')
  const dir = chosen && existsSync(chosen) ? chosen : dirname(info.path)
  const stem = basename(info.path, extname(info.path))
  // Never overwrite: converting movie.mp4 to MP4 in place would otherwise eat
  // the source before ffmpeg had finished reading it.
  return uniqueOutputPath(join(dir, `${stem}.${format}`))
}

export function registerIpc(getWindow: () => BrowserWindow | null): void {
  queue.setEmitter((progress) => {
    getWindow()?.webContents.send('job:progress', progress)
  })

  const window = (): BrowserWindow => getWindow() as BrowserWindow

  // --- metadata -----------------------------------------------------------

  ipcMain.handle('meta:get', async () => ({
    appName: APP_NAME,
    inputExtensions: INPUT_EXTENSIONS,
    presets: VIDEO_PRESETS,
    mp3Bitrates: MP3_BITRATES,
    crfMin: CRF_MIN,
    crfMax: CRF_MAX,
    capabilities: await probeCapabilities()
  }))

  ipcMain.handle('deps:probe', () => probeDependencies())

  // --- files --------------------------------------------------------------

  ipcMain.handle('files:pick', async (): Promise<string[]> => {
    const result = await dialog.showOpenDialog(window(), {
      title: 'Choose video files',
      properties: ['openFile', 'multiSelections'],
      filters: [
        { name: 'Video', extensions: INPUT_EXTENSIONS },
        { name: 'All files', extensions: ['*'] }
      ]
    })
    return result.canceled ? [] : result.filePaths
  })

  ipcMain.handle('files:pickFolder', async (): Promise<string> => {
    const result = await dialog.showOpenDialog(window(), {
      title: 'Choose where converted files go',
      properties: ['openDirectory', 'createDirectory']
    })
    return result.canceled ? '' : (result.filePaths[0] ?? '')
  })

  /**
   * Probe several files at once.
   *
   * One bad file in a drop of twenty must not sink the other nineteen, so each
   * result carries its own error rather than the whole call rejecting.
   */
  ipcMain.handle('files:probe', async (_e, paths: string[]): Promise<ProbeResult[]> =>
    Promise.all(
      (paths ?? []).map(async (path): Promise<ProbeResult> => {
        if (!allowedExtension(path)) {
          return {
            path,
            info: null,
            error: `Salin doesn't read ${extname(path) || basename(path)} files.`
          }
        }
        try {
          return { path, info: await probe(path), error: '' }
        } catch (error) {
          return { path, info: null, error: error instanceof Error ? error.message : String(error) }
        }
      })
    )
  )

  // --- jobs ---------------------------------------------------------------

  ipcMain.handle(
    'jobs:create',
    async (
      _e,
      entries: { info: MediaInfo; options: JobOptions }[],
      folderOverride = ''
    ): Promise<Job[]> => {
      const settings = getSettings()
      const capabilities = await probeCapabilities()
      const created: Job[] = []

      for (const entry of entries ?? []) {
        if (!existsSync(entry.info.path)) {
          throw new Error(`${entry.info.filename} is no longer where it was.`)
        }
        const plan = buildPlan(entry.info, entry.options, capabilities)
        // The renderer disables the button when a plan has problems; this is
        // the check that actually holds, because IPC is reachable regardless.
        if (plan.problems.length > 0) {
          throw new Error(`${entry.info.filename}: ${plan.problems[0]}`)
        }
        const job = await store.create({
          info: entry.info,
          options: entry.options,
          plan,
          outputPath: resolveOutputPath(entry.info, entry.options.format, settings, folderOverride)
        })
        queue.enqueue(job.id)
        created.push(job)
      }
      return created
    }
  )

  ipcMain.handle('jobs:list', (): Promise<Job[]> => store.list())

  ipcMain.handle('jobs:cancel', (_e, id: string) => queue.cancel(id))

  ipcMain.handle('jobs:remove', (_e, id: string) => store.remove(id))

  ipcMain.handle('jobs:clearFinished', () => store.clearFinished())

  ipcMain.handle('jobs:retry', async (_e, id: string): Promise<Job | null> => {
    const job = await store.get(id)
    if (!job) return null
    if (!existsSync(job.info.path)) {
      throw new Error(`${job.info.filename} is no longer where it was.`)
    }
    // A fresh output path: the previous attempt may have left a finished file
    // behind, and this run must not silently replace it.
    const next = await store.update(id, {
      status: 'queued',
      progress: 0,
      error: '',
      outputBytes: 0,
      elapsedSec: 0,
      outputPath: resolveOutputPath(job.info, job.options.format, getSettings())
    })
    queue.enqueue(id)
    return next
  })

  ipcMain.handle('jobs:reveal', async (_e, id: string) => {
    const job = await store.get(id)
    if (!job) return
    // Fall back to the source when the output is gone or was never written —
    // opening the right folder still beats doing nothing.
    const target = job.outputPath && existsSync(job.outputPath) ? job.outputPath : job.info.path
    if (existsSync(target)) shell.showItemInFolder(target)
  })

  ipcMain.handle('jobs:open', async (_e, id: string): Promise<string> => {
    const job = await store.get(id)
    if (!job || !existsSync(job.outputPath)) return 'That file is no longer there.'
    return shell.openPath(job.outputPath)
  })

  // --- settings -----------------------------------------------------------

  ipcMain.handle('settings:get', (): Settings => getSettings())
  ipcMain.handle('settings:save', (_e, patch: Partial<Settings>) => saveSettings(patch))

  /**
   * Confirms natively before turning on source deletion.
   *
   * It is the only setting in the app that destroys the user's own files, so
   * it is the only one that asks.
   */
  ipcMain.handle('settings:confirmDeleteSource', async (): Promise<boolean> => {
    const { response } = await dialog.showMessageBox(window(), {
      type: 'warning',
      buttons: ['Delete originals', 'Keep them'],
      defaultId: 1,
      cancelId: 1,
      message: 'Delete the original file after a successful conversion?',
      detail:
        'The original is removed for good — it does not go to the Trash. ' +
        'Salin only does this when the converted file has been written successfully.'
    })
    return response === 0
  })
}
