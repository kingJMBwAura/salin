/**
 * The contextBridge surface — the renderer's entire view of the outside world.
 *
 * Deliberately a fixed set of named methods rather than a generic
 * `invoke(channel)`, so a bug in the UI can't reach a channel it was never
 * meant to touch.
 */

import { contextBridge, ipcRenderer, webUtils } from 'electron'
import type {
  Capabilities, DepStatus, Job, JobOptions, JobProgress, MediaInfo, PresetSpec, ProbeResult,
  Settings
} from '../shared/types'

export interface Meta {
  appName: string
  inputExtensions: string[]
  presets: PresetSpec[]
  mp3Bitrates: number[]
  crfMin: number
  crfMax: number
  /** What the ffmpeg on this machine can actually do. */
  capabilities: Capabilities
}

const api = {
  /**
   * Which platform the window is running on.
   *
   * The renderer supplies its own title-bar chrome on macOS, where the
   * native frame is hidden, and must not on Windows, where it isn't.
   */
  platform: process.platform,

  meta: (): Promise<Meta> => ipcRenderer.invoke('meta:get'),
  probeDeps: (): Promise<DepStatus[]> => ipcRenderer.invoke('deps:probe'),

  files: {
    pick: (): Promise<string[]> => ipcRenderer.invoke('files:pick'),
    pickFolder: (): Promise<string> => ipcRenderer.invoke('files:pickFolder'),
    probe: (paths: string[]): Promise<ProbeResult[]> => ipcRenderer.invoke('files:probe', paths),
    /**
     * The real filesystem path behind a dropped File.
     *
     * `File.path` was removed from Electron's renderer; this is the sanctioned
     * replacement and it only works from the preload, which is why drag and
     * drop needs a bridge method at all.
     */
    pathFor: (file: File): string => webUtils.getPathForFile(file)
  },

  jobs: {
    /** `folderOverride` answers "ask me each time" for one batch. */
    create: (
      entries: { info: MediaInfo; options: JobOptions }[],
      folderOverride?: string
    ): Promise<Job[]> => ipcRenderer.invoke('jobs:create', entries, folderOverride ?? ''),
    list: (): Promise<Job[]> => ipcRenderer.invoke('jobs:list'),
    cancel: (id: string): Promise<boolean> => ipcRenderer.invoke('jobs:cancel', id),
    remove: (id: string): Promise<boolean> => ipcRenderer.invoke('jobs:remove', id),
    clearFinished: (): Promise<number> => ipcRenderer.invoke('jobs:clearFinished'),
    retry: (id: string): Promise<Job | null> => ipcRenderer.invoke('jobs:retry', id),
    reveal: (id: string): Promise<void> => ipcRenderer.invoke('jobs:reveal', id),
    /** Resolves with '' on success, or the reason it wouldn't open. */
    open: (id: string): Promise<string> => ipcRenderer.invoke('jobs:open', id),
    onProgress: (callback: (progress: JobProgress) => void): (() => void) => {
      const listener = (_e: unknown, progress: JobProgress): void => callback(progress)
      ipcRenderer.on('job:progress', listener)
      return () => ipcRenderer.removeListener('job:progress', listener)
    }
  },

  settings: {
    get: (): Promise<Settings> => ipcRenderer.invoke('settings:get'),
    save: (patch: Partial<Settings>): Promise<Settings> =>
      ipcRenderer.invoke('settings:save', patch),
    /** Prompts natively; only a clear yes turns source deletion on. */
    confirmDeleteSource: (): Promise<boolean> =>
      ipcRenderer.invoke('settings:confirmDeleteSource')
  }
}

contextBridge.exposeInMainWorld('salin', api)

export type SalinApi = typeof api
