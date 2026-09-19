/**
 * 字体层：界面外壳（系统字体）和内容区（内容字体）各一套。
 *
 * 默认值写在 styles.css 的 :root，这里只负责把用户改过的值内联到 <html>；
 * 落盘分开做（applyFonts 只写 DOM，saveFonts 才写 localStorage）。
 * 读的时候直接读 CSS 变量，所以默认值和自定义值只有一个出口。
 */

import { invoke } from "@tauri-apps/api/core";

export type FontRole = "ui" | "content";

/** 默认字体：不是某个具体字体族，交给系统挑，所以单独当一项列。 */
export const SYSTEM_FAMILY = "system-ui";

/** CoreText 返回的一项就是一个 font face，对应 Font Book 里的一个“字样”。 */
export type FontFace = {
  postScriptName: string;
  family: string;
  styleName: string;
  displayName: string;
};

export type FontSetting = {
  family: string;
  /** 有它时按 PostScript 名精确加载；旧配置没有，继续走 family + weight。 */
  face?: { postScriptName: string };
  size: number;
  weight: number;
  /** 行高，只有内容字体用得上 */
  leading: number;
};

/** FontSettings = 两套字体 + 全局界面缩放（1 = 100%）。 */
export type FontSettings = Record<FontRole, FontSetting> & { scale: number };

/** 界面缩放档位：root 字号和字体字号一起放大，布局（rem 间距）跟着走。 */
export const UI_SCALES = [
  { value: 1, label: "100%" },
  { value: 1.1, label: "110%" },
  { value: 1.25, label: "125%" },
  { value: 1.5, label: "150%" },
] as const;

/** 拿不到系统字体列表时（浏览器里跑 vite、调用失败）的兜底。 */
export const FONT_FACES: FontFace[] = [
  {
    postScriptName: "ChalkboardSE-Regular",
    family: "Chalkboard SE",
    styleName: "Regular",
    displayName: "Chalkboard SE Regular",
  },
  {
    postScriptName: "STHeitiSC-Medium",
    family: "Heiti SC",
    styleName: "Medium",
    displayName: "Heiti SC Medium",
  },
  {
    postScriptName: "PingFangSC-Regular",
    family: "PingFang SC",
    styleName: "常规体",
    displayName: "PingFang SC Regular",
  },
  {
    postScriptName: "HelveticaNeue",
    family: "Helvetica Neue",
    styleName: "Regular",
    displayName: "Helvetica Neue",
  },
  { postScriptName: "ArialMT", family: "Arial", styleName: "Regular", displayName: "Arial" },
  { postScriptName: "Georgia", family: "Georgia", styleName: "Regular", displayName: "Georgia" },
  {
    postScriptName: "STSongti-SC-Regular",
    family: "Songti SC",
    styleName: "常规体",
    displayName: "Songti SC Regular",
  },
  {
    postScriptName: "STKaitiSC-Regular",
    family: "Kaiti SC",
    styleName: "常规体",
    displayName: "Kaiti SC Regular",
  },
  {
    postScriptName: "Menlo-Regular",
    family: "Menlo",
    styleName: "Regular",
    displayName: "Menlo Regular",
  },
  { postScriptName: "Monaco", family: "Monaco", styleName: "Regular", displayName: "Monaco" },
  {
    postScriptName: "SFMono-Regular",
    family: "SF Mono",
    styleName: "Regular",
    displayName: "SF Mono Regular",
  },
];

/** 出厂默认，跟 styles.css 的 :root 保持一致；「恢复默认配置」用的就是这一份。 */
export const DEFAULT_FONTS: FontSettings = {
  ui: {
    family: "Heiti SC",
    face: { postScriptName: "STHeitiSC-Medium" },
    size: 14,
    weight: 400,
    leading: 1.5,
  },
  content: {
    family: "Chalkboard SE",
    face: { postScriptName: "ChalkboardSE-Regular" },
    size: 15,
    weight: 400,
    leading: 1.65,
  },
  scale: 1,
};

export const FONT_WEIGHTS = [
  { value: 300, label: "细体" },
  { value: 400, label: "常规" },
  { value: 500, label: "中等" },
  { value: 600, label: "半粗" },
  { value: 700, label: "粗体" },
];

const STORAGE_KEY = "nib:fonts";
const FACE_STYLE_ID = "nib-font-faces";
const FACE_ALIASES: Record<FontRole, string> = {
  ui: "__nib_ui_face",
  content: "__nib_content_face",
};

let installedFonts: Promise<FontFace[]> | undefined;

/** 本机已安装的全部 font face，只问系统一次。 */
export function loadFontFaces(): Promise<FontFace[]> {
  installedFonts ??= invoke<FontFace[]>("list_fonts")
    .then((faces) => (faces.length > 0 ? faces : FONT_FACES))
    .catch(() => FONT_FACES);
  return installedFonts;
}

function varName(
  role: FontRole,
  key: "family" | "familyEffective" | "face" | "size" | "weight",
): string {
  if (key === "family") return `--f-${role}-family`;
  if (key === "familyEffective") return `--f-${role}-family-effective`;
  if (key === "face") return `--f-${role}-face`;
  if (key === "size") return `--f-${role}-size`;
  return `--f-${role}-weight`;
}

export function readFontSettings(): FontSettings {
  const style = getComputedStyle(document.documentElement);
  const read = (role: FontRole, key: "family" | "face" | "size" | "weight") =>
    style.getPropertyValue(varName(role, key)).trim();

  // CSS 变量里存的是已乘过缩放的 px，读回设置时要除回去，避免二次放大。
  const scale = parseFloat(style.getPropertyValue("--ui-scale")) || DEFAULT_FONTS.scale;
  const size = (role: FontRole) =>
    (parseFloat(read(role, "size")) || DEFAULT_FONTS[role].size) / scale;
  const weight = (role: FontRole) =>
    parseInt(read(role, "weight"), 10) || DEFAULT_FONTS[role].weight;
  const face = (role: FontRole) => {
    const postScriptName = read(role, "face");
    return postScriptName ? { postScriptName } : undefined;
  };

  return {
    ui: {
      family: read("ui", "family") || DEFAULT_FONTS.ui.family,
      face: face("ui"),
      size: size("ui"),
      weight: weight("ui"),
      leading: DEFAULT_FONTS.ui.leading,
    },
    content: {
      family: read("content", "family") || DEFAULT_FONTS.content.family,
      face: face("content"),
      size: size("content"),
      weight: weight("content"),
      leading:
        parseFloat(style.getPropertyValue("--f-content-leading")) ||
        DEFAULT_FONTS.content.leading,
    },
    scale,
  };
}

function cssString(value: string): string {
  return JSON.stringify(value);
}

/** 用 PostScript 名建一个内部 family，避免 CSS 再按 weight/style 猜具体字样。 */
function installFontFaceRules(fonts: FontSettings): void {
  let style = document.getElementById(FACE_STYLE_ID) as HTMLStyleElement | null;
  if (!style) {
    style = document.createElement("style");
    style.id = FACE_STYLE_ID;
    document.head.append(style);
  }

  style.textContent = (["ui", "content"] as const)
    .flatMap((role) => {
      const face = fonts[role].face;
      if (!face) return [];
      return [
        `@font-face { font-family: ${cssString(FACE_ALIASES[role])}; src: local(${cssString(
          face.postScriptName,
        )}); font-style: normal; font-weight: 400; }`,
      ];
    })
    .join("\n");
}

/** 只写 DOM、不落盘：设置页改的是草稿，要点保存才写 localStorage。 */
export function applyFonts(fonts: FontSettings): void {
  installFontFaceRules(fonts);
  const root = document.documentElement;
  // 缩放走两条线：root 字号放大所有 rem 布局（间距/宽度），字体变量放大文字。
  root.style.setProperty("--ui-scale", `${fonts.scale}`);
  root.style.fontSize = `${16 * fonts.scale}px`;
  for (const role of ["ui", "content"] as const) {
    const font = fonts[role];
    root.style.setProperty(varName(role, "family"), font.family);
    root.style.setProperty(
      varName(role, "familyEffective"),
      font.face ? FACE_ALIASES[role] : font.family,
    );
    root.style.setProperty(varName(role, "face"), font.face?.postScriptName ?? "");
    root.style.setProperty(varName(role, "size"), `${font.size * fonts.scale}px`);
    root.style.setProperty(varName(role, "weight"), `${font.face ? 400 : font.weight}`);
  }
  root.style.setProperty("--f-content-leading", `${fonts.content.leading}`);
}

/** 保存：把当前字体落盘，下次启动接着用。 */
export function saveFonts(fonts: FontSettings): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(fonts));
}

export function initFonts(): void {
  const stored = localStorage.getItem(STORAGE_KEY);
  if (!stored) {
    applyFonts(DEFAULT_FONTS);
    return;
  }
  try {
    const fonts = JSON.parse(stored) as FontSettings;
    // 旧版本存的就是旧的 system-ui 默认值；改内置默认后让这批用户也跟着换新默认。
    const legacyDefaults: FontSettings = {
      ui: { family: SYSTEM_FAMILY, size: 14, weight: 400, leading: 1.5 },
      content: { family: SYSTEM_FAMILY, size: 15, weight: 400, leading: 1.65 },
      scale: 1,
    };
    applyFonts(
      JSON.stringify(fonts) === JSON.stringify(legacyDefaults) ? DEFAULT_FONTS : fonts,
    );
  } catch {
    applyFonts(DEFAULT_FONTS);
  }
}

/** 导入 JSON 时用：缺项/脏数据一律回落到当前值。 */
export function normalizeFonts(value: unknown, fallback: FontSettings): FontSettings {
  const source = (value ?? {}) as Record<string, unknown>;
  const num = (input: unknown, min: number, max: number, alt: number) => {
    const parsed = typeof input === "number" ? input : Number.parseFloat(String(input));
    return Number.isFinite(parsed) ? Math.min(max, Math.max(min, parsed)) : alt;
  };
  const role = (name: FontRole): FontSetting => {
    const raw = (source[name] ?? {}) as Record<string, unknown>;
    const base = fallback[name];
    const rawFace = (raw.face ?? {}) as Record<string, unknown>;
    const face =
      typeof rawFace.postScriptName === "string" && rawFace.postScriptName.trim()
        ? { postScriptName: rawFace.postScriptName.trim() }
        : undefined;
    return {
      family: typeof raw.family === "string" && raw.family.trim() ? raw.family.trim() : base.family,
      face,
      size: num(raw.size, 9, 32, base.size),
      weight: num(raw.weight, 100, 900, base.weight),
      leading: num(raw.leading, 1, 3, base.leading),
    };
  };
  return {
    ui: role("ui"),
    content: role("content"),
    scale: num(source.scale, 0.75, 2, fallback.scale),
  };
}
