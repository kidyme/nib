import { useEffect, useState } from "react";
import { APPS, DEFAULT_APP_ID, findApp } from "./apps/registry";
import { applyFonts, readFontSettings, saveFonts, type FontSettings } from "./fonts";
import { SettingsPage } from "./settings/SettingsPage";
import { AppShell } from "./shell/AppShell";
import { applyTheme, readThemeState, saveTheme, type ThemeState } from "./theme";

const LAST_APP_KEY = "nib:last-app";

function readLastApp(): string {
  const stored = localStorage.getItem(LAST_APP_KEY);
  return APPS.some((app) => app.id === stored) ? stored! : DEFAULT_APP_ID;
}

export default function App() {
  // 首帧的 data-theme 与字体变量已由 main.tsx 同步写入，这里读到的是同一个值。
  // 这两个是「已保存」的配置：设置页里改的是草稿，点保存才回写到这里。
  const [theme, setTheme] = useState<ThemeState>(readThemeState);
  const [fonts, setFonts] = useState<FontSettings>(readFontSettings);
  const [activeAppId, setActiveAppId] = useState(readLastApp);
  const [settingsOpen, setSettingsOpen] = useState(false);

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

  /** 退出设置：草稿没保存，把已保存的配置重新铺回 DOM。 */
  const closeSettings = () => {
    setSettingsOpen(false);
    applyTheme(theme);
    applyFonts(fonts);
  };

  /** 保存：草稿已经是当前画面了，这里只更新已保存的那份并落盘。 */
  const saveSettings = (next: { theme: ThemeState; fonts: FontSettings }) => {
    setTheme(next.theme);
    setFonts(next.fonts);
    saveTheme(next.theme);
    saveFonts(next.fonts);
  };

  const activeApp = findApp(activeAppId);
  const ActiveApp = activeApp.component;

  // 设置是独立页面：整窗换掉外壳，不再套 AppShell。
  if (settingsOpen) {
    return (
      <SettingsPage
        theme={theme}
        fonts={fonts}
        onBack={closeSettings}
        onSave={saveSettings}
      />
    );
  }

  return (
    <AppShell
      apps={APPS}
      activeApp={activeApp}
      onSelectApp={(id) => setActiveAppId(id)}
      onOpenSettings={() => setSettingsOpen(true)}
    >
      <ActiveApp />
    </AppShell>
  );
}
