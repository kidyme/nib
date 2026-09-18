import { useEffect, useRef, type ReactNode } from "react";
import { CheckIcon, CloseIcon } from "../shell/icons";
import { THEMES, type ThemeDefinition, type ThemeId } from "../theme";

type SettingsDialogProps = {
  theme: ThemeId;
  onSelectTheme: (id: ThemeId) => void;
  onClose: () => void;
};

/**
 * 配置的统一入口。新增设置项 = 在 <Section> 里加一行；
 * 配置项多到一屏放不下时，再把单列分区换成左侧分类导航。
 */
export function SettingsDialog({ theme, onSelectTheme, onClose }: SettingsDialogProps) {
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    panelRef.current?.focus();

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-overlay p-6"
      onClick={onClose}
    >
      <div
        ref={panelRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label="设置"
        onClick={(event) => event.stopPropagation()}
        className="flex max-h-[76vh] w-[520px] max-w-full flex-col overflow-hidden rounded-xl border border-line bg-raised outline-none"
      >
        <header className="flex shrink-0 items-center justify-between border-b border-line px-5 py-3">
          <h2 className="text-[14px] font-medium text-ink">设置</h2>
          <button
            type="button"
            onClick={onClose}
            title="关闭"
            className="-mr-1 flex size-6 items-center justify-center rounded-md text-ink-subtle transition-colors hover:bg-sunken hover:text-ink"
          >
            <CloseIcon className="size-3.5" />
          </button>
        </header>

        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-5 py-4">
          <Section title="外观">
            <ThemePicker value={theme} onChange={onSelectTheme} />
          </Section>
        </div>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-2">
      <h3 className="text-[12px] font-medium text-ink-subtle">{title}</h3>
      {children}
    </section>
  );
}

function ThemePicker({
  value,
  onChange,
}: {
  value: ThemeId;
  onChange: (id: ThemeId) => void;
}) {
  return (
    <div className="overflow-hidden rounded-lg border border-line">
      {THEMES.map((theme, index) => (
        <button
          key={theme.id}
          type="button"
          onClick={() => onChange(theme.id)}
          className={[
            "flex w-full items-center gap-3 px-3 py-2.5 text-left text-[13px] transition-colors",
            index > 0 ? "border-t border-line" : "",
            value === theme.id
              ? "bg-accent-soft text-accent"
              : "text-ink hover:bg-sunken",
          ]
            .filter(Boolean)
            .join(" ")}
        >
          <ThemeSwatch theme={theme} />
          <span className="flex-1 truncate">{theme.label}</span>
          {value === theme.id && <CheckIcon className="size-4 shrink-0" />}
        </button>
      ))}
    </div>
  );
}

/**
 * 预览色块不写死色值：给元素挂上 data-theme，[data-theme="x"] 里的 CSS 变量
 * 就会在这个子树里重新解析，于是拿到的是那一套配色的真实颜色。
 */
function ThemeSwatch({ theme }: { theme: ThemeDefinition }) {
  return (
    <span
      data-theme={theme.id}
      className="flex h-5 w-8 shrink-0 overflow-hidden rounded-[5px] ring-1 ring-line"
    >
      <span className="flex-1 bg-surface" />
      <span className="flex-1 bg-canvas" />
      <span className="w-2.5 bg-accent" />
    </span>
  );
}
