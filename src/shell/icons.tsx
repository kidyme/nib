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

export function CloseIcon({ className }: IconProps) {
  return (
    <svg {...base} className={className} aria-hidden="true">
      <path d="M4.2 4.2l7.6 7.6M11.8 4.2l-7.6 7.6" />
    </svg>
  );
}
