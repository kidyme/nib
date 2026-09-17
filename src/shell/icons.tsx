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

export function SunIcon({ className }: IconProps) {
  return (
    <svg {...base} className={className} aria-hidden="true">
      <circle cx="8" cy="8" r="3.1" />
      <path d="M8 1.4v1.7M8 12.9v1.7M1.4 8h1.7M12.9 8h1.7M3.35 3.35l1.2 1.2M11.45 11.45l1.2 1.2M12.65 3.35l-1.2 1.2M4.55 11.45l-1.2 1.2" />
    </svg>
  );
}

export function MoonIcon({ className }: IconProps) {
  return (
    <svg {...base} className={className} aria-hidden="true">
      <path d="M13.4 9.6A5.8 5.8 0 016.4 2.6a5.8 5.8 0 107 7z" />
    </svg>
  );
}
