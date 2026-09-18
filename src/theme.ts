/**
 * 配色层。
 *
 * 预设色值写在 styles.css 的 [data-theme="..."] 块里（那是唯一的一份）；
 * 这里只做三件事：
 *   1. 记住用户选了哪套预设；
 *   2. 把用户手改过的色值内联到 <html>，覆盖预设；
 *   3. 读出当前实际生效的色值，给设置页和导出用。
 *
 * 半透明色（accent-soft / ring / 状态色 -soft）由 CSS 用 color-mix 从实色派生，
 * 所以可以配、可以导出的就是下面 COLOR_TOKENS 这些实色。
 */

export type ThemeMode = "light" | "dark";

export const THEMES = [
  { id: "dark", label: "深色", mode: "dark" },
  { id: "light", label: "浅色", mode: "light" },
] as const satisfies readonly {
  id: string;
  label: string;
  mode: ThemeMode;
}[];

export type ThemeId = (typeof THEMES)[number]["id"];

/** 设置页里逐项可调的色值，顺序即显示顺序。 */
export const COLOR_TOKENS = [
  { id: "canvas", group: "界面", label: "工作区底色" },
  { id: "surface", group: "界面", label: "内容面板" },
  { id: "raised", group: "界面", label: "卡片 / 浮层" },
  { id: "sunken", group: "界面", label: "凹陷区" },
  { id: "sidebar", group: "界面", label: "侧边栏" },
  { id: "titlebar", group: "界面", label: "标题栏" },

  { id: "line", group: "分割线", label: "常规分割线" },
  { id: "lineStrong", group: "分割线", label: "强调分割线" },

  { id: "ink", group: "文字", label: "正文" },
  { id: "inkMuted", group: "文字", label: "次要文字" },
  { id: "inkSubtle", group: "文字", label: "弱化文字" },
  { id: "inkInverse", group: "文字", label: "反色文字" },

  { id: "accent", group: "主色", label: "主色" },
  { id: "accentHover", group: "主色", label: "主色 · 悬停" },
  { id: "accentActive", group: "主色", label: "主色 · 按下" },
  { id: "accentFg", group: "主色", label: "主色上的文字" },

  { id: "success", group: "状态", label: "成功" },
  { id: "warning", group: "状态", label: "警告" },
  { id: "danger", group: "状态", label: "危险" },
  { id: "info", group: "状态", label: "信息" },

  { id: "scrollbar", group: "滚动条", label: "滚动条" },
  { id: "scrollbarHover", group: "滚动条", label: "滚动条 · 悬停" },
] as const;

export type ColorTokenId = (typeof COLOR_TOKENS)[number]["id"];
export type ThemeColors = Record<ColorTokenId, string>;

export type ThemeState = {
  base: ThemeId;
  /** 当前实际生效的全部色值（换预设后重新读一遍预设值） */
  colors: ThemeColors;
};

const STORAGE_KEY = "nib:theme";
const DEFAULT_THEME: ThemeId = "dark";

/** accentHover -> --c-accent-hover */
function cssVar(id: ColorTokenId): string {
  return `--c-${id.replace(/[A-Z]/g, (char) => `-${char.toLowerCase()}`)}`;
}

export function isThemeId(value: unknown): value is ThemeId {
  return THEMES.some((theme) => theme.id === value);
}

export function tokenLabel(id: ColorTokenId): string {
  return COLOR_TOKENS.find((token) => token.id === id)?.label ?? id;
}

function readStored(): { base: ThemeId; colors: Partial<ThemeColors> } {
  try {
    const raw: unknown = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "null");
    if (raw && typeof raw === "object") {
      const stored = raw as { base?: unknown; colors?: unknown };
      return {
        base: isThemeId(stored.base) ? stored.base : DEFAULT_THEME,
        colors: normalizeColors(stored.colors) ?? {},
      };
    }
  } catch {
    // 存的东西坏了就当没存过，用默认预设。
  }
  return { base: DEFAULT_THEME, colors: {} };
}

/** 只收 #rrggbb，别的一律丢掉——JSON 是手改得动的入口，必须挡住脏数据。 */
export function normalizeColors(value: unknown): ThemeColors | null {
  if (!value || typeof value !== "object") return null;
  const colors = {} as ThemeColors;
  for (const token of COLOR_TOKENS) {
    const raw = (value as Record<string, unknown>)[token.id];
    if (typeof raw !== "string" || !/^#[0-9a-f]{6}$/i.test(raw)) return null;
    colors[token.id] = raw.toLowerCase();
  }
  return colors;
}

/** 当前生效的色值。自定义色是内联在 <html> 上的，读出来就是内联值。 */
export function readThemeColors(): ThemeColors {
  const style = getComputedStyle(document.documentElement);
  const colors = {} as ThemeColors;
  for (const token of COLOR_TOKENS) {
    colors[token.id] = style.getPropertyValue(cssVar(token.id)).trim();
  }
  return colors;
}

export function readThemeState(): ThemeState {
  return { base: readStored().base, colors: readThemeColors() };
}

/** 换预设：先清掉手改的内联色，再把新预设的值读回来。 */
export function presetTheme(id: ThemeId): ThemeState {
  const root = document.documentElement;
  root.dataset.theme = id;
  for (const token of COLOR_TOKENS) root.style.removeProperty(cssVar(token.id));
  return { base: id, colors: readThemeColors() };
}

export function applyTheme({ base, colors }: ThemeState): void {
  const root = document.documentElement;
  root.dataset.theme = base;
  for (const token of COLOR_TOKENS) {
    root.style.setProperty(cssVar(token.id), colors[token.id]);
  }
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ base, colors }));
}

/** 渲染之前同步跑，避免首帧闪一下默认配色。 */
export function initTheme(): void {
  const { base, colors } = readStored();
  const root = document.documentElement;
  root.dataset.theme = base;
  for (const token of COLOR_TOKENS) {
    const value = colors[token.id];
    if (value) root.style.setProperty(cssVar(token.id), value);
  }
}
