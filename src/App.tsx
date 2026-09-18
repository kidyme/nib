import { useCallback, useEffect, useState } from "react";
import { APPS, DEFAULT_APP_ID, findApp } from "./apps/registry";
import { SettingsDialog } from "./settings/SettingsDialog";
import { AppShell } from "./shell/AppShell";
import { applyTheme, readTheme, type ThemeId } from "./theme";

const LAST_APP_KEY = "nib:last-app";

function readLastApp(): string {
  const stored = localStorage.getItem(LAST_APP_KEY);
  return APPS.some((app) => app.id === stored) ? stored! : DEFAULT_APP_ID;
}

export default function App() {
  // 首帧的 data-theme 已由 main.tsx 的 initTheme() 同步写入，这里读到同一个值。
  const [theme, setTheme] = useState<ThemeId>(readTheme);
  const [activeAppId, setActiveAppId] = useState(readLastApp);
  const [settingsOpen, setSettingsOpen] = useState(false);

  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  useEffect(() => {
    localStorage.setItem(LAST_APP_KEY, activeAppId);
  }, [activeAppId]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.metaKey && event.key === ",") {
        event.preventDefault();
        setSettingsOpen(true);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const closeSettings = useCallback(() => setSettingsOpen(false), []);

  const activeApp = findApp(activeAppId);
  const ActiveApp = activeApp.component;

  return (
    <>
      <AppShell
        apps={APPS}
        activeApp={activeApp}
        onSelectApp={setActiveAppId}
        onOpenSettings={() => setSettingsOpen(true)}
      >
        <ActiveApp />
      </AppShell>

      {settingsOpen && (
        <SettingsDialog
          theme={theme}
          onSelectTheme={setTheme}
          onClose={closeSettings}
        />
      )}
    </>
  );
}
