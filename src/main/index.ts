/** Electron main process: window lifecycle. */

import { app, BrowserWindow, shell } from 'electron'
import { join } from 'node:path'
import { registerIpc } from './ipc'
import { ensureDirs } from './paths'
import { failInterrupted } from './store'

let mainWindow: BrowserWindow | null = null

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 820,
    minWidth: 880,
    minHeight: 600,
    show: false,
    // macOS-only. On Windows the native frame stays, which is what that
    // platform expects — and is why the renderer's drag strip must not
    // render there.
    ...(process.platform === 'darwin' ? { titleBarStyle: 'hiddenInset' as const } : {}),
    // Matches the app's ink background so the window never flashes white.
    backgroundColor: '#05080C',
    webPreferences: {
      // Built as .mjs because the package is type: module. ESM preload requires
      // sandbox: false, which is why that is set rather than left default.
      preload: join(__dirname, '../preload/index.mjs'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  mainWindow.on('ready-to-show', () => mainWindow?.show())
  mainWindow.on('closed', () => {
    mainWindow = null
  })

  // External links open in the real browser, never inside the app shell.
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: 'deny' }
  })

  if (process.env.ELECTRON_RENDERER_URL) {
    mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

app.whenReady().then(async () => {
  ensureDirs()
  registerIpc(() => mainWindow)
  // A quit mid-conversion leaves a record claiming to be running; without this
  // the queue shows a progress bar that will never move again.
  await failInterrupted()
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
