import type { SVGProps } from 'react'

type IconProps = SVGProps<SVGSVGElement>

// Line icons at a single 1.6 stroke weight so the chrome reads as one system.
const base: IconProps = {
  width: 18,
  height: 18,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.6,
  strokeLinecap: "round",
  strokeLinejoin: "round",
};

export const Icon: Record<string, (p: IconProps) => JSX.Element> = {
  // The mark: a stream passing through a frame and coming out the other side.
  Salin: (p: IconProps) => (
    <svg {...base} {...p}>
      <path d="M4 8V5.5A1.5 1.5 0 0 1 5.5 4H8M20 8V5.5A1.5 1.5 0 0 0 18.5 4H16M4 16v2.5A1.5 1.5 0 0 0 5.5 20H8M20 16v2.5a1.5 1.5 0 0 1-1.5 1.5H16" />
      <path d="M7 12h10M14 9l3 3-3 3" />
    </svg>
  ),
  Convert: (p: IconProps) => (
    <svg {...base} {...p}>
      <path d="M4 8h13M14 5l3 3-3 3M20 16H7M10 13l-3 3 3 3" />
    </svg>
  ),
  Queue: (p: IconProps) => (
    <svg {...base} {...p}>
      <path d="M4 6h16M4 12h16M4 18h9" />
    </svg>
  ),
  Sliders: (p: IconProps) => (
    <svg {...base} {...p}>
      <path d="M5 20v-7M5 9V4M12 20v-9M12 7V4M19 20v-4M19 12V4M2.5 13h5M9.5 7h5M16.5 16h5" />
    </svg>
  ),
  Film: (p: IconProps) => (
    <svg {...base} {...p}>
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <path d="M7 4v16M17 4v16M3 12h18M3 8h4M3 16h4M17 8h4M17 16h4" />
    </svg>
  ),
  Music: (p: IconProps) => (
    <svg {...base} {...p}>
      <path d="M9 18V6l11-2v12" />
      <circle cx="6.5" cy="18" r="2.5" />
      <circle cx="17.5" cy="16" r="2.5" />
    </svg>
  ),
  Folder: (p: IconProps) => (
    <svg {...base} {...p}>
      <path d="M3 7a2 2 0 0 1 2-2h3.6a2 2 0 0 1 1.5.7L11.5 7H19a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z" />
    </svg>
  ),
  Plus: (p: IconProps) => (
    <svg {...base} {...p}>
      <path d="M12 5v14M5 12h14" />
    </svg>
  ),
  Trash: (p: IconProps) => (
    <svg {...base} {...p}>
      <path d="M4 7h16M9 7V5h6v2M6 7l1 13h10l1-13M10 11v6M14 11v6" />
    </svg>
  ),
  Menu: (p: IconProps) => (
    <svg {...base} {...p}>
      <path d="M4 7h16M4 12h16M4 17h16" />
    </svg>
  ),
  Close: (p: IconProps) => (
    <svg {...base} {...p}>
      <path d="M6 6l12 12M18 6 6 18" />
    </svg>
  ),
  Check: (p: IconProps) => (
    <svg {...base} {...p}>
      <path d="m5 12.5 4.5 4.5L19 7" />
    </svg>
  ),
  Alert: (p: IconProps) => (
    <svg {...base} {...p}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7.5v5.5M12 16.2v.3" />
    </svg>
  ),
  Rotate: (p: IconProps) => (
    <svg {...base} {...p}>
      <path d="M20 12a8 8 0 1 1-2.6-5.9M20 4v5h-5" />
    </svg>
  ),
  Stop: (p: IconProps) => (
    <svg {...base} {...p}>
      <rect x="6" y="6" width="12" height="12" rx="1.5" />
    </svg>
  ),
  Chevron: (p: IconProps) => (
    <svg {...base} {...p}>
      <path d="m7 10 5 5 5-5" />
    </svg>
  ),
  Reveal: (p: IconProps) => (
    <svg {...base} {...p}>
      <path d="M14 4h6v6M20 4l-8 8M18 14v4a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4" />
    </svg>
  ),
  Bolt: (p: IconProps) => (
    <svg {...base} {...p}>
      <path d="M13 3 5 14h6l-1 7 8-11h-6Z" />
    </svg>
  ),
};
