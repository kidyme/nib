/**
 * 字体层：界面外壳（系统字体）和内容区（内容字体）各一套。
 *
 * 默认值写在 styles.css 的 :root，这里只负责把用户改过的值内联到 <html>
 * 并持久化；读的时候直接读 CSS 变量，所以默认值和自定义值只有一个出口。
 */

export type FontRole = "ui" | "content";

export type FontSetting = {
  family: string;
  size: number;
  weight: number;
  /** 行高，只有内容字体用得上 */
  leading: number;
};

export type FontSettings = Record<FontRole, FontSetting>;

export const FONT_FAMILIES = [
  "system-ui",
  "PingFang SC",
  "Helvetica Neue",
  "Arial",
  "Georgia",
  "Songti SC",
  "Kaiti SC",
  "Menlo",
  "Monaco",
  "SF Mono",
];

export const FONT_WEIGHTS = [
  { value: 300, label: "细体" },
  { value: 400, label: "常规" },
  { value: 500, label: "中等" },
  { value: 600, label: "半粗" },
  { value: 700, label: "粗体" },
];

const STORAGE_KEY = "nib:fonts";

function varName(role: FontRole, key: "family" | "size" | "weight"): string {
  if (key === "family") return `--f-${role}-family`;
  if (key === "size") return `--f-${role}-size`;
  return `--f-${role}-weight`;
}

export function readFontSettings(): FontSettings {
  const style = getComputedStyle(document.documentElement);
  const read = (role: FontRole, key: "family" | "size" | "weight") =>
    style.getPropertyValue(varName(role, key)).trim();

  const size = (role: FontRole) => parseFloat(read(role, "size")) || 14;
  const weight = (role: FontRole) => parseInt(read(role, "weight"), 10) || 400;

  return {
    ui: {
      family: read("ui", "family") || "system-ui",
      size: size("ui"),
      weight: weight("ui"),
      leading: 1.5,
    },
    content: {
      family: read("content", "family") || "system-ui",
      size: size("content"),
      weight: weight("content"),
      leading: parseFloat(style.getPropertyValue("--f-content-leading")) || 1.65,
    },
  };
}

export function applyFonts(fonts: FontSettings): void {
  const root = document.documentElement;
  for (const role of ["ui", "content"] as const) {
    const font = fonts[role];
    root.style.setProperty(varName(role, "family"), font.family);
    root.style.setProperty(varName(role, "size"), `${font.size}px`);
    root.style.setProperty(varName(role, "weight"), `${font.weight}`);
  }
  root.style.setProperty("--f-content-leading", `${fonts.content.leading}`);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(fonts));
}

export function initFonts(): void {
  const stored = localStorage.getItem(STORAGE_KEY);
  if (!stored) return;
  try {
    applyFonts(JSON.parse(stored) as FontSettings);
  } catch {
    // 存的东西坏了就用 CSS 里的默认值。
  }
}

/** 导入 JSON 时用：缺项/脏数据一律回落到当前值。 */
export function normalizeFonts(value: unknown, fallback: FontSettings): FontSettings {
  const source = (value ?? {}) as Record<string, unknown>;
  const role = (name: FontRole): FontSetting => {
    const raw = (source[name] ?? {}) as Record<string, unknown>;
    const base = fallback[name];
    const num = (input: unknown, min: number, max: number, alt: number) => {
      const parsed = typeof input === "number" ? input : Number.parseFloat(String(input));
      return Number.isFinite(parsed) ? Math.min(max, Math.max(min, parsed)) : alt;
    };
    return {
      family: typeof raw.family === "string" && raw.family.trim() ? raw.family.trim() : base.family,
      size: num(raw.size, 9, 32, base.size),
      weight: num(raw.weight, 100, 900, base.weight),
      leading: num(raw.leading, 1, 3, base.leading),
    };
  };
  return { ui: role("ui"), content: role("content") };
}
