import type { ReactNode } from "react";
import type { AppDefinition } from "../apps/registry";
import { SlidersIcon } from "./icons";

type AppShellProps = {
  apps: AppDefinition[];
  activeApp: AppDefinition;
  onSelectApp: (id: string) => void;
  onOpenSettings: () => void;
  children: ReactNode;
};

/** 顶部留白兼作窗口拖动区，macOS 的红绿灯按钮浮在这块空白上。 */
const TITLEBAR_DRAG = { "data-tauri-drag-region": true } as const;

export function AppShell({
  apps,
  activeApp,
  onSelectApp,
  onOpenSettings,
  children,
}: AppShellProps) {
  return (
    <div className="flex h-full">
      <aside className="flex w-[220px] shrink-0 flex-col border-r border-line bg-sidebar">
        <div className="h-12 shrink-0" {...TITLEBAR_DRAG} />
        <div
          className="px-5 pb-4 text-ui font-semibold text-ink-subtle"
          {...TITLEBAR_DRAG}
        >
          nib
        </div>

        <nav className="flex-1 space-y-0.5 overflow-y-auto px-2.5">
          {apps.map((app) => {
            const Icon = app.icon;
            const isActive = app.id === activeApp.id;
            return (
              <button
                key={app.id}
                type="button"
                onClick={() => onSelectApp(app.id)}
                className={[
                  "flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-ui",
                  "transition-colors duration-100",
                  isActive
                    ? "bg-accent-soft font-medium text-accent"
                    : "text-ink-muted hover:bg-raised hover:text-ink",
                ].join(" ")}
              >
                <Icon className="size-4 shrink-0" />
                <span className="truncate">{app.name}</span>
              </button>
            );
          })}
        </nav>

        <div className="border-t border-line p-2.5">
          <button
            type="button"
            onClick={onOpenSettings}
            className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-ui text-ink-muted transition-colors duration-100 hover:bg-raised hover:text-ink"
          >
            <SlidersIcon className="size-4 shrink-0" />
            <span className="flex-1 truncate text-left">设置</span>
            <span className="shrink-0 text-ui-xs text-ink-subtle">⌘,</span>
          </button>
        </div>
      </aside>

      <main className="flex min-w-0 flex-1 flex-col bg-canvas">
        <header
          className="flex h-12 shrink-0 items-center border-b border-line bg-titlebar px-5 text-ui font-medium text-ink-muted"
          {...TITLEBAR_DRAG}
        >
          {activeApp.name}
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>
      </main>
    </div>
  );
}
