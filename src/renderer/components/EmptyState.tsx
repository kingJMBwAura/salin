import type { ReactNode, SVGProps } from 'react'

export default function EmptyState({
  icon: Glyph,
  title,
  children,
  action
}: {
  icon?: (p: SVGProps<SVGSVGElement>) => JSX.Element
  title: string
  children?: ReactNode
  action?: ReactNode
}): JSX.Element {
  return (
    <div className="card flex flex-col items-center px-6 py-14 text-center">
      {Glyph && (
        <span className="mb-4 rounded-lg border border-line bg-raised p-3 text-faint">
          <Glyph width={22} height={22} />
        </span>
      )}
      <h2 className="title text-base">{title}</h2>
      {children && (
        <p className="mt-2 max-w-sm text-sm leading-relaxed text-muted">{children}</p>
      )}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}
