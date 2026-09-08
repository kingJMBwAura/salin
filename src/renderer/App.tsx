import { useCallback, useEffect, useState } from 'react'
import { Navigate, Route, Routes, useLocation } from 'react-router-dom'
import type { DepStatus, Settings } from '@shared/types'
import type { Meta } from '../preload'
import { api } from './lib/api'
import { useJobProgress } from './lib/useJobProgress'
import Sidebar from './components/Sidebar'
import TitleBar from './components/TitleBar'
import { IS_MAC, TOP_INSET } from './lib/platform'
import { Icon } from './components/icons'
import Convert from './pages/Convert'
import Queue from './pages/Queue'
import SettingsPage from './pages/Settings'

export default function App(): JSX.Element {
  const location = useLocation()
  const [menuOpen, setMenuOpen] = useState(false)
  const [meta, setMeta] = useState<Meta | null>(null)
  const [settings, setSettings] = useState<Settings | null>(null)
  const [missingDeps, setMissingDeps] = useState<DepStatus[]>([])
  const [activeCount, setActiveCount] = useState(0)

  useEffect(() => {
    void Promise.all([api.meta(), api.settings.get(), api.probeDeps()]).then(([m, s, deps]) => {
      setMeta(m)
      setSettings(s)
      setMissingDeps(deps.filter((d) => !d.found))
    })
  }, [])

  const countActive = useCallback(async () => {
    const jobs = await api.jobs.list()
    setActiveCount(jobs.filter((j) => j.status === 'running' || j.status === 'queued').length)
  }, [])

  useEffect(() => {
    void countActive()
  }, [countActive, location.pathname])

  // The sidebar badge has to stay right while the user is on another page, so
  // it listens to the same broadcast the queue does.
  useJobProgress(useCallback(() => void countActive(), [countActive]))

  useEffect(() => setMenuOpen(false), [location.pathname])

  /**
   * A file dropped anywhere but a drop zone would otherwise make the window
   * navigate to it, replacing the whole app with a video player and no way
   * back. The drop zones stop propagation of their own events first.
   */
  useEffect(() => {
    const swallow = (event: DragEvent): void => event.preventDefault()
    window.addEventListener('dragover', swallow)
    window.addEventListener('drop', swallow)
    return () => {
      window.removeEventListener('dragover', swallow)
      window.removeEventListener('drop', swallow)
    }
  }, [])

  return (
    <div className="min-h-screen">
      <Sidebar open={menuOpen} onClose={() => setMenuOpen(false)} activeCount={activeCount} />

      <TitleBar />

      <div className="md:pl-[68px] lg:pl-[248px]">
        {/* Mobile bar. On macOS the window has no title bar, so this doubles as
            the drag strip at narrow widths where the sidebar is hidden. */}
        <div
          style={(IS_MAC ? { WebkitAppRegion: 'drag' } : {}) as React.CSSProperties}
          className={`flex items-center gap-2 border-b border-line px-4 pb-3 ${TOP_INSET} md:hidden`}
        >
          <button
            type="button"
            onClick={() => setMenuOpen(true)}
            style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
            className="btn-quiet -ml-2 p-2"
            aria-label="Open menu"
          >
            <Icon.Menu />
          </button>
          <Icon.Salin width={17} height={17} className="text-neon" />
          <span className="title text-[15px]">Salin</span>
        </div>

        <main className={`mx-auto max-w-5xl px-4 py-6 sm:px-6 sm:py-8 ${IS_MAC ? 'md:pt-10' : ''}`}>
          {missingDeps.length > 0 && (
            <div className="mb-6 rounded-md border border-flare/30 bg-flare/10 px-4 py-3">
              <div className="flex items-start gap-2.5 text-sm text-flare">
                <Icon.Alert width={16} height={16} className="mt-0.5 shrink-0" />
                <div>
                  <p>
                    Salin needs {missingDeps.map((d) => d.name).join(' and ')} to convert anything.
                  </p>
                  {[...new Set(missingDeps.map((d) => d.fix))].map((fix) => (
                    <p key={fix} className="mt-1 font-mono text-[11.5px] text-muted">
                      {fix}
                    </p>
                  ))}
                </div>
              </div>
            </div>
          )}

          {!meta || !settings ? (
            <div className="text-sm text-muted">Starting…</div>
          ) : (
            <Routes>
              <Route path="/" element={<Convert meta={meta} settings={settings} />} />
              <Route path="/queue" element={<Queue />} />
              <Route
                path="/settings"
                element={
                  <SettingsPage meta={meta} settings={settings} onSettingsChange={setSettings} />
                }
              />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          )}
        </main>
      </div>
    </div>
  )
}
