import { IS_MAC } from '../lib/platform'

/**
 * The window's drag handle.
 *
 * The window is frameless (`titleBarStyle: 'hiddenInset'`), so it has no real
 * title bar to grab. This strip stands in for one across the top of the main
 * pane; the sidebar's own header covers the strip to its left.
 *
 * Double-click is deliberately not handled here. macOS acts on a double-click
 * in any `-webkit-app-region: drag` area itself — zoom, minimise or nothing,
 * according to the setting in System Settings › Desktop & Dock. Adding a
 * handler would fire alongside that one and undo it.
 */
export default function TitleBar(): JSX.Element | null {
  // Windows and Linux keep their native title bar; drawing another strip
  // there would be a dead band under a real, working one.
  if (!IS_MAC) return null

  return (
    <div
      aria-hidden="true"
      style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
      className="fixed inset-x-0 top-0 z-30 hidden h-9 bg-ink/85 backdrop-blur-md
                 md:block md:left-[68px] lg:left-[248px]"
    />
  )
}
