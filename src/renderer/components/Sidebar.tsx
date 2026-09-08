import { NavLink } from 'react-router-dom'
import { Icon } from './icons'
import { IS_MAC, TOP_INSET } from '../lib/platform'

interface NavEntry {
  to: string
  label: string
  icon: (p: React.SVGProps<SVGSVGElement>) => JSX.Element
  end?: boolean
}

const NAV: NavEntry[] = [
  { to: "/", label: "Convert", icon: Icon.Convert, end: true },
  { to: "/queue", label: "Queue", icon: Icon.Queue },
  { to: "/settings", label: "Settings", icon: Icon.Sliders },
];

function NavItem({
  item,
  badge,
  onNavigate
}: {
  item: NavEntry
  badge?: number
  onNavigate: () => void
}): JSX.Element {
  return (
    <NavLink
      to={item.to}
      end={item.end}
      onClick={onNavigate}
      title={item.label}
      className={({ isActive }) =>
        [
          "group relative flex items-center gap-3 rounded-md py-2 text-sm transition-colors",
          "px-3 md:justify-center md:px-0 lg:justify-start lg:px-3",
          isActive ? "bg-raised text-text" : "text-muted hover:bg-raised/60 hover:text-text",
        ].join(" ")
      }
    >
      {({ isActive }) => (
        <>
          {/* The active marker sits on the sidebar's own edge, echoing the
              node dots on a job's pipeline trace. */}
          <span
            aria-hidden="true"
            className={`absolute left-0 h-4 w-[2px] rounded-full transition-colors md:-left-3 lg:left-0 ${
              isActive ? "bg-neon" : "bg-transparent"
            }`}
          />
          <item.icon className="shrink-0" />
          <span className="md:hidden lg:inline">{item.label}</span>
          {badge ? (
            <span className="ml-auto rounded-full bg-neon/15 px-1.5 font-mono text-[10.5px] text-neon md:hidden lg:inline">
              {badge}
            </span>
          ) : null}
        </>
      )}
    </NavLink>
  );
}

export default function Sidebar({
  open,
  onClose,
  activeCount
}: {
  open: boolean
  onClose: () => void
  activeCount: number
}): JSX.Element {
  return (
    <>
      {/* Mobile scrim */}
      <div
        onClick={onClose}
        aria-hidden="true"
        className={`fixed inset-0 z-30 bg-ink/70 backdrop-blur-sm transition-opacity md:hidden ${
          open ? "opacity-100" : "pointer-events-none opacity-0"
        }`}
      />

      <aside
        className={[
          "fixed inset-y-0 left-0 z-40 flex w-[248px] flex-col border-r border-line bg-surface",
          "transition-transform duration-200 ease-out",
          open ? "translate-x-0" : "-translate-x-full",
          // Icon rail at md, full sidebar again at lg.
          "md:translate-x-0 md:w-[68px] lg:w-[248px]",
        ].join(" ")}
      >
        <div
          // On macOS there is no title bar, so this strip is the window's drag
          // handle and carries the clearance the traffic lights need. On Windows
          // the native title bar already does both.
          style={(IS_MAC ? { WebkitAppRegion: 'drag' } : {}) as React.CSSProperties}
          className={`flex items-center gap-2.5 px-5 pb-5 ${TOP_INSET} md:justify-center md:px-0 lg:justify-start lg:px-5`}
        >
          <Icon.Salin className="shrink-0 text-neon" width={20} height={20} />
          <div className="md:hidden lg:block">
            <div className="title text-[18px] leading-none">Salin</div>
            <div className="eyebrow mt-1.5">Video converter</div>
          </div>
          <button
            type="button"
            onClick={onClose}
            style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
            className="btn-quiet ml-auto -mr-2 p-1.5 md:hidden"
            aria-label="Close menu"
          >
            <Icon.Close />
          </button>
        </div>

        <nav className="flex flex-col gap-0.5 px-3">
          {NAV.map((item) => (
            <NavItem
              key={item.to}
              item={item}
              badge={item.to === "/queue" ? activeCount : undefined}
              onNavigate={onClose}
            />
          ))}
        </nav>

        <div className="mt-auto border-t border-line px-5 py-4 md:hidden lg:block">
          <div className="eyebrow">Streams first</div>
          <p className="mt-2 text-[11px] leading-relaxed text-faint">
            Salin copies the picture and sound across untouched whenever the
            format allows it, and only re-encodes when it has to.
          </p>
        </div>
      </aside>
    </>
  );
}
