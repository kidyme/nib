import { useEffect, useState } from "react";
import { APPS, DEFAULT_APP_ID, findApp } from "./apps/registry";
import {
  applyFonts,
  readFontSettings,
  type FontRole,
  type FontSetting,
  type FontSettings,
} from "./fonts";
import { SettingsPage } from "./settings/SettingsPage";
import { AppShell } from "./shell/AppShell";
import {
  applyTheme,
  presetTheme,
  readThemeState,
  type ThemeColors,
  type ThemeId,
  type ThemeState,
} from "./theme";

const LAST_APP_KEY = "nib:last-app";

function readLastApp(): string {
  const stored = localStorage.getItem(LAST_APP_KEY);
  return APPS.some((app) => app.id === stored) ? stored! : DEFAULT_APP_ID;
}

export default function App() {
  // 首帧的 data-theme 与字体变量已由 main.tsx 同步写入，这里读到的是同一个值。
  const [theme, setTheme] = useState<ThemeState>(readThemeState);
  const [fonts, setFonts] = useState<FontSettings>(readFontSettings);
  const [activeAppId, setActiveAppId] = useState(readLastApp);
  const [settingsOpen, setSettingsOpen] = useState(false);

  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  useEffect(() => {
    applyFonts(fonts);
  }, [fonts]);

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

  const changeFont = (role: FontRole, patch: Partial<FontSetting>) =>
    setFonts((current) => ({ ...current, [role]: { ...current[role], ...patch } }));

  const activeApp = findApp(activeAppId);
  const ActiveApp = activeApp.component;

  return (
    <AppShell
      apps={APPS}
      activeApp={activeApp}
      settingsOpen={settingsOpen}
      onSelectApp={(id) => {
        setSettingsOpen(false);
        setActiveAppId(id);
      }}
      onOpenSettings={() => setSettingsOpen(true)}
    >
      {settingsOpen ? (
        <SettingsPage
          theme={theme}
          fonts={fonts}
          onSelectPreset={(id: ThemeId) => setTheme(presetTheme(id))}
          onChangeColors={(colors: ThemeColors) => setTheme((current) => ({ ...current, colors }))}
          onChangeFont={changeFont}
          onImport={(next) => {
            setTheme(next.theme);
            setFonts(next.fonts);
          }}
        />
      ) : (
        <ActiveApp />
      )}
    </AppShell>
  );
}
