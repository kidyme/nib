import type { ComponentType } from "react";

type PlaceholderProps = {
  icon: ComponentType<{ className?: string }>;
  title: string;
  hint: string;
};

export function Placeholder({ icon: Icon, title, hint }: PlaceholderProps) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-4 px-10 text-center">
      <div className="flex size-11 items-center justify-center rounded-xl border border-line bg-surface">
        <Icon className="size-5 text-ink-subtle" />
      </div>
      <div className="space-y-1.5">
        <h1 className="text-[15px] font-medium text-ink">{title}</h1>
        <p className="max-w-xs text-[13px] leading-relaxed text-ink-muted">{hint}</p>
      </div>
    </div>
  );
}
