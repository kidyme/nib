type IconProps = { className?: string };

const base = {
  viewBox: "0 0 16 16",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.5,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

export function CheckSquareIcon({ className }: IconProps) {
  return (
    <svg {...base} className={className} aria-hidden="true">
      <rect x="2.25" y="2.25" width="11.5" height="11.5" rx="3" />
      <path d="M5.5 8.2l1.9 1.9 3.6-4" />
    </svg>
  );
}

export function BookIcon({ className }: IconProps) {
  return (
    <svg {...base} className={className} aria-hidden="true">
      <path d="M8 3.6C6.9 2.7 5.3 2.5 3.4 2.5a.9.9 0 00-.9.9v7.2c0 .5.4.9.9.9 1.9 0 3.5.2 4.6 1.1" />
      <path d="M8 3.6c1.1-.9 2.7-1.1 4.6-1.1.5 0 .9.4.9.9v7.2c0 .5-.4.9-.9.9-1.9 0-3.5.2-4.6 1.1" />
      <path d="M8 3.6v10.1" />
    </svg>
  );
}

export function SlidersIcon({ className }: IconProps) {
  return (
    <svg {...base} className={className} aria-hidden="true">
      <path d="M2.5 5h1.9M7.6 5h5.9M2.5 11h6M11.6 11h1.9" />
      <circle cx="6" cy="5" r="1.6" />
      <circle cx="10" cy="11" r="1.6" />
    </svg>
  );
}

export function CheckIcon({ className }: IconProps) {
  return (
    <svg {...base} className={className} aria-hidden="true">
      <path d="M3.5 8.4l3 3 6-7" />
    </svg>
  );
}

export function ChevronDownIcon({ className }: IconProps) {
  return (
    <svg {...base} className={className} aria-hidden="true">
      <path d="M4.3 6.3L8 10l3.7-3.7" />
    </svg>
  );
}

export function ChevronRightIcon({ className }: IconProps) {
  return (
    <svg {...base} className={className} aria-hidden="true">
      <path d="M6.3 4.3L10 8l-3.7 3.7" />
    </svg>
  );
}

export function ChevronLeftIcon({ className }: IconProps) {
  return (
    <svg {...base} className={className} aria-hidden="true">
      <path d="M9.7 4.3L6 8l3.7 3.7" />
    </svg>
  );
}

export function CloseIcon({ className }: IconProps) {
  return (
    <svg {...base} className={className} aria-hidden="true">
      <path d="M4.2 4.2l7.6 7.6M11.8 4.2l-7.6 7.6" />
    </svg>
  );
}

export function ArrowLeftIcon({ className }: IconProps) {
  return (
    <svg {...base} className={className} aria-hidden="true">
      <path d="M8.2 3.6L4 8l4.2 4.4M4.5 8h7.2" />
    </svg>
  );
}

export function TypeIcon({ className }: IconProps) {
  return (
    <svg {...base} className={className} aria-hidden="true">
      <path d="M3.2 4.4h9.6M8 4.4v7.2M5.8 11.6h4.4" />
    </svg>
  );
}

export function PaletteIcon({ className }: IconProps) {
  return (
    <svg {...base} className={className} aria-hidden="true">
      <circle cx="8" cy="8" r="5.3" />
      <circle cx="6.2" cy="6.1" r=".9" fill="currentColor" stroke="none" />
      <circle cx="9.8" cy="6.1" r=".9" fill="currentColor" stroke="none" />
      <circle cx="5.4" cy="9.6" r=".9" fill="currentColor" stroke="none" />
    </svg>
  );
}

export function BracesIcon({ className }: IconProps) {
  return (
    <svg {...base} className={className} aria-hidden="true">
      <path d="M6.3 2.6c-1.5 0-1.7.9-1.7 2.1 0 1.4-.2 2.2-1.8 3.3 1.6 1.1 1.8 1.9 1.8 3.3 0 1.2.2 2.1 1.7 2.1" />
      <path d="M9.7 2.6c1.5 0 1.7.9 1.7 2.1 0 1.4.2 2.2 1.8 3.3-1.6 1.1-1.8 1.9-1.8 3.3 0 1.2-.2 2.1-1.7 2.1" />
    </svg>
  );
}

export function KeyboardIcon({ className }: IconProps) {
  return (
    <svg {...base} className={className} aria-hidden="true">
      <rect x="2.25" y="3.25" width="11.5" height="9.5" rx="2" />
      <path d="M4.4 6.3h.01M6.8 6.3h.01M9.2 6.3h.01M11.6 6.3h.01M4.4 8.4h.01M6.8 8.4h.01M9.2 8.4h.01M11.6 8.4h.01M4.5 10.5h7" />
    </svg>
  );
}

export function PanelLeftIcon({ className }: IconProps) {
  return (
    <svg {...base} className={className} aria-hidden="true">
      <rect x="2.25" y="2.5" width="11.5" height="11" rx="2.5" />
      <path d="M6 2.5v11" />
    </svg>
  );
}

export function FullscreenIcon({ className }: IconProps) {
  return (
    <svg {...base} className={className} aria-hidden="true">
      <path d="M6.25 2.5H4A1.5 1.5 0 002.5 4v2.25M9.75 2.5H12A1.5 1.5 0 0113.5 4v2.25M13.5 9.75V12A1.5 1.5 0 0112 13.5H9.75M6.25 13.5H4A1.5 1.5 0 012.5 12V9.75" />
    </svg>
  );
}

export function FullscreenExitIcon({ className }: IconProps) {
  return (
    <svg {...base} className={className} aria-hidden="true">
      <path d="M2.5 6.25H4A1.5 1.5 0 005.5 4.75V3.25M13.5 6.25H12A1.5 1.5 0 0110.5 4.75V3.25M10.5 12.75V11.25A1.5 1.5 0 0112 9.75h1.5M5.5 12.75V11.25A1.5 1.5 0 004 9.75H2.5" />
    </svg>
  );
}

export function LoopIcon({ className }: IconProps) {
  return (
    <svg {...base} className={className} aria-hidden="true">
      <path d="M12.7 5.15A5 5 0 1 0 13 9.4" />
      <path d="M12.8 2.6v2.7h-2.7" />
    </svg>
  );
}

export function SearchIcon({ className }: IconProps) {
  return (
    <svg {...base} className={className} aria-hidden="true">
      <circle cx="7.1" cy="7.1" r="4.1" />
      <path d="M10.2 10.2l3.2 3.2" />
    </svg>
  );
}

export function PlusIcon({ className }: IconProps) {
  return (
    <svg {...base} className={className} aria-hidden="true">
      <path d="M8 3.2v9.6M3.2 8h9.6" />
    </svg>
  );
}

export function MoreHorizontalIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 16 16" fill="currentColor" className={className} aria-hidden="true">
      <circle cx="3.2" cy="8" r="1" />
      <circle cx="8" cy="8" r="1" />
      <circle cx="12.8" cy="8" r="1" />
    </svg>
  );
}

export function LinkIcon({ className }: IconProps) {
  return (
    <svg {...base} className={className} aria-hidden="true">
      <path d="M6.4 9.6l3.2-3.2" />
      <path d="M5.2 10.8l-1 .9a2.2 2.2 0 0 1-3.1-3.1l2.1-2.1a2.2 2.2 0 0 1 3.1 0" />
      <path d="M10.8 5.2l1-.9a2.2 2.2 0 0 1 3.1 3.1l-2.1 2.1a2.2 2.2 0 0 1-3.1 0" />
    </svg>
  );
}

export function PencilIcon({ className }: IconProps) {
  return (
    <svg {...base} className={className} aria-hidden="true">
      <path d="M3 13l.7-3.1 6.8-6.8 2.4 2.4-6.8 6.8L3 13z" />
      <path d="M9.5 4.1l2.4 2.4" />
    </svg>
  );
}

export function CopyIcon({ className }: IconProps) {
  return (
    <svg {...base} className={className} aria-hidden="true">
      <rect x="5.4" y="5.4" width="7.1" height="7.1" rx="1.5" />
      <path d="M10.6 5.4V4.6c0-.9-.7-1.6-1.6-1.6H4.6c-.9 0-1.6.7-1.6 1.6V9c0 .9.7 1.6 1.6 1.6h.8" />
    </svg>
  );
}

export function TrashIcon({ className }: IconProps) {
  return (
    <svg {...base} className={className} aria-hidden="true">
      <path d="M3.3 4.5h9.4M6 2.8h4M4.5 4.5l.5 8.2h6l.5-8.2M6.7 6.8v3.7M9.3 6.8v3.7" />
    </svg>
  );
}

export function ArchiveIcon({ className }: IconProps) {
  return (
    <svg {...base} className={className} aria-hidden="true">
      <rect x="2.5" y="3" width="11" height="3" rx="1" />
      <path d="M3.5 6v6.2c0 .55.45 1 1 1h7c.55 0 1-.45 1-1V6M6.4 8.7h3.2" />
    </svg>
  );
}

export function GripVerticalIcon({ className }: IconProps) {
  return (
    <svg {...base} className={className} aria-hidden="true">
      <circle cx="6" cy="3.5" r="0.5" fill="currentColor" />
      <circle cx="10" cy="3.5" r="0.5" fill="currentColor" />
      <circle cx="6" cy="8" r="0.5" fill="currentColor" />
      <circle cx="10" cy="8" r="0.5" fill="currentColor" />
      <circle cx="6" cy="12.5" r="0.5" fill="currentColor" />
      <circle cx="10" cy="12.5" r="0.5" fill="currentColor" />
    </svg>
  );
}
