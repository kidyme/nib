/**
 * 主题层只负责一件事：把 data-theme 写到 <html> 上。
 * 真正的色值全部在 styles.css 的 [data-theme="..."] 块里。
 *
 * 加一套配色：styles.css 里加一个块填满 token → 下面的 THEMES 加一行。
 * `mode` 声明它是亮色还是暗色，用于图标一类的明暗相关展示。
 */

export type ThemeMode = "light" | "dark";

export type ThemeDefinition = {
  id: string;
  label: string;
  mode: ThemeMode;
};

export const THEMES = [
  { id: "dark", label: "深色", mode: "dark" },
  { id: "light", label: "浅色", mode: "light" },
] as const satisfies readonly ThemeDefinition[];

export type ThemeId = (typeof THEMES)[number]["id"];

const STORAGE_KEY = "nib:theme";
const DEFAULT_THEME: ThemeId = "dark";

function isThemeId(value: unknown): value is ThemeId {
  return THEMES.some((theme) => theme.id === value);
}

export function readTheme(): ThemeId {
  const stored = localStorage.getItem(STORAGE_KEY);
  return isThemeId(stored) ? stored : DEFAULT_THEME;
}

export function applyTheme(id: ThemeId): void {
  document.documentElement.dataset.theme = id;
  localStorage.setItem(STORAGE_KEY, id);
}

/** 在渲染之前同步调用，避免首帧闪一下默认配色。 */
export function initTheme(): ThemeId {
  const id = readTheme();
  document.documentElement.dataset.theme = id;
  return id;
}
