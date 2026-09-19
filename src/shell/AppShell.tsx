import { useEffect, useState, type ReactNode } from "react";
import type { AppDefinition } from "../apps/registry";
import { matchesShortcut, type ShortcutSettings } from "../shortcuts";
import {
  FullscreenExitIcon,
  FullscreenIcon,
  PanelLeftIcon,
  SlidersIcon,
} from "./icons";

type AppShellProps = {
  apps: AppDefinition[];
  activeApp: AppDefinition;
  shortcuts: ShortcutSettings;
  fullscreen: boolean;
  onFullscreenChange: (fullscreen: boolean) => void;
  onSelectApp: (id: string) => void;
  onOpenSettings: () => void;
  children: ReactNode;
};

type AppNavigationProps = {
  apps: AppDefinition[];
  activeApp: AppDefinition;
  onSelectApp: (id: string) => void;
  onOpenSettings: () => void;
};

type AppSidebarProps = AppNavigationProps & {
  onCollapse: () => void;
};

/** 顶部留白兼作窗口拖动区，macOS 的红绿灯按钮浮在这块空白上。 */
const TITLEBAR_DRAG = { "data-tauri-drag-region": true } as const;

/**
 * 红绿灯（titleBarStyle: Overlay）浮在窗口左上角，横向占到 x≈80：
 * 侧边栏在的时候它正好压在侧边栏顶上那块空白里，标题栏从侧边栏右边开始，
 * 谁也不挡谁；页面全屏把侧边栏收掉之后标题栏顶到了窗口左边缘，就得自己
 * 把这块让出来，不然按钮会钻到红绿灯底下（点下去点到的是窗口按钮）。
 */
const BELOW_TRAFFIC_LIGHTS = "pl-24";

const RAIL_BUTTON =
  "flex size-[1.875rem] shrink-0 items-center justify-center rounded-lg transition-colors duration-100";
const RAIL_IDLE = "text-ink-muted hover:bg-control hover:text-ink";
const RAIL_ACTIVE = "bg-control text-ink";
const SHELL_ICON = "size-[1.125rem] shrink-0";

const SIDEBAR_ITEM =
  "flex h-[1.875rem] w-full items-center gap-2.5 rounded-lg px-2.5 text-left text-ui transition-colors duration-100";

/** 收起态：64px 宽，只放图标，名字走 title 提示。 */
function AppRail({ apps, activeApp, onSelectApp, onOpenSettings }: AppNavigationProps) {
  return (
    <>
      <div className="h-12 shrink-0 border-b border-line bg-titlebar" {...TITLEBAR_DRAG} />

      {/* 收起态的分隔线从标题栏下方才出现，别穿过红绿灯区域。 */}
      <div className="flex min-h-0 flex-1 flex-col border-r border-line bg-sidebar">
        <nav className="flex flex-1 flex-col items-center gap-1 overflow-y-auto px-2 pt-10">
          {apps.map((app) => {
            const Icon = app.icon;
            const isActive = app.id === activeApp.id;
            return (
              <button
                key={app.id}
                type="button"
                title={app.name}
                aria-label={app.name}
                aria-current={isActive ? "page" : undefined}
                onClick={() => onSelectApp(app.id)}
                className={`${RAIL_BUTTON} ${isActive ? RAIL_ACTIVE : RAIL_IDLE}`}
              >
                <Icon className={SHELL_ICON} />
              </button>
            );
          })}
        </nav>

        <div className="flex shrink-0 justify-center p-2">
          <button
            type="button"
            title="设置"
            aria-label="设置"
            onClick={onOpenSettings}
            className={`${RAIL_BUTTON} ${RAIL_IDLE}`}
          >
            <SlidersIcon className={SHELL_ICON} />
          </button>
        </div>
      </div>
    </>
  );
}

/** 展开态：220px 宽，应用名与快捷键都直接可见。 */
function AppSidebar({
  apps,
  activeApp,
  onSelectApp,
  onOpenSettings,
  onCollapse,
}: AppSidebarProps) {
  return (
    <>
      <div className="relative h-12 shrink-0" {...TITLEBAR_DRAG}>
        <button
          type="button"
          title="收起侧边栏"
          aria-label="收起侧边栏"
          onClick={onCollapse}
          className={`${RAIL_BUTTON} ${RAIL_IDLE} absolute right-2.5 top-[0.5625rem]`}
        >
          <PanelLeftIcon className={SHELL_ICON} />
        </button>
      </div>


      <nav className="flex-1 space-y-1.5 overflow-y-auto px-2.5 pt-3">
        {apps.map((app) => {
          const Icon = app.icon;
          const isActive = app.id === activeApp.id;
          return (
            <button
              key={app.id}
              type="button"
              aria-current={isActive ? "page" : undefined}
              onClick={() => onSelectApp(app.id)}
              className={[
                SIDEBAR_ITEM,
                isActive
                  ? "bg-accent-soft font-medium text-accent"
                  : "text-ink-muted hover:bg-raised hover:text-ink",
              ].join(" ")}
            >
              <Icon className={SHELL_ICON} />
              <span className="truncate">{app.name}</span>
            </button>
          );
        })}
      </nav>

      <div className="border-t border-line p-2.5">
        <button
          type="button"
          onClick={onOpenSettings}
          className={`${SIDEBAR_ITEM} ${RAIL_IDLE}`}
        >
          <SlidersIcon className={SHELL_ICON} />
          <span className="flex-1 truncate text-left">设置</span>
        </button>
      </div>
    </>
  );
}

export function AppShell({
  apps,
  activeApp,
  shortcuts,
  fullscreen,
  onFullscreenChange,
  onSelectApp,
  onOpenSettings,
  children,
}: AppShellProps) {
  // 应用内的收起只切换到 64px 图标栏；页面全屏会整条藏掉侧边栏。
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const fullscreenAvailable = activeApp.fullscreen === true;
  const isFullscreen = fullscreenAvailable && fullscreen;

  // ⌘Enter 切换页面全屏；Esc 不参与全屏，留给弹窗关闭用。⌘数字按注册顺序切换标签。
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.repeat) return;
      if (fullscreenAvailable && matchesShortcut(event, shortcuts.toggleFullscreen)) {
        event.preventDefault();
        onFullscreenChange(!isFullscreen);
        return;
      }
      const index = shortcuts.switchApps.findIndex((item) => matchesShortcut(event, item));
      if (index >= 0 && index < apps.length) {
        event.preventDefault();
        if (apps[index].id !== activeApp.id) onSelectApp(apps[index].id);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [
    activeApp.id,
    apps,
    fullscreenAvailable,
    isFullscreen,
    onFullscreenChange,
    onSelectApp,
    shortcuts,
  ]);

  return (
    <div className="flex h-full">
      {!isFullscreen && (
        <aside
          className={[
            "flex shrink-0 flex-col",
            sidebarCollapsed
              ? "w-16 bg-titlebar"
              : "w-[13.75rem] border-r border-line bg-sidebar",
          ].join(" ")}
        >
          {sidebarCollapsed ? (
            <AppRail
              apps={apps}
              activeApp={activeApp}
              onSelectApp={onSelectApp}
              onOpenSettings={onOpenSettings}
            />
          ) : (
            <AppSidebar
              apps={apps}
              activeApp={activeApp}
              onSelectApp={onSelectApp}
              onOpenSettings={onOpenSettings}
              onCollapse={() => setSidebarCollapsed(true)}
            />
          )}
        </aside>
      )}

      <main className="flex min-w-0 flex-1 flex-col bg-canvas">
        <header
          className={[
            "relative flex h-12 shrink-0 items-center gap-2 border-b border-line bg-titlebar",
            "text-ui font-medium text-ink-muted",
            isFullscreen
              ? `${BELOW_TRAFFIC_LIGHTS} pr-4`
              : sidebarCollapsed
                ? "pl-8 pr-4"
                : "px-4",
          ].join(" ")}
        >
          {!isFullscreen && sidebarCollapsed && (
            <button
              type="button"
              title="展开侧边栏"
              aria-label="展开侧边栏"
              onClick={() => {
                onFullscreenChange(false);
                setSidebarCollapsed(false);
              }}
              className={`${RAIL_BUTTON} ${RAIL_IDLE}`}
            >
              <PanelLeftIcon className={SHELL_ICON} />
            </button>
          )}

          {/* 拖动区只占中间，两边的按钮自己挡住拖动 */}
          <div className="flex h-full min-w-0 flex-1 items-center" {...TITLEBAR_DRAG}>
            {!isFullscreen && <span className="truncate">{activeApp.name}</span>}
          </div>

          {fullscreenAvailable && (
            <button
              type="button"
              title={isFullscreen ? "退出页面全屏" : "页面全屏"}
              aria-label={isFullscreen ? "退出页面全屏" : "页面全屏"}
              aria-pressed={isFullscreen}
              onClick={() => onFullscreenChange(!isFullscreen)}
              className={`${RAIL_BUTTON} ${isFullscreen ? RAIL_ACTIVE : RAIL_IDLE}`}
            >
              {isFullscreen ? (
                <FullscreenExitIcon className={SHELL_ICON} />
              ) : (
                <FullscreenIcon className={SHELL_ICON} />
              )}
            </button>
          )}
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>
      </main>
    </div>
  );
}
