export type Shortcut = {
  key: string;
  ctrl: boolean;
  meta: boolean;
  alt: boolean;
  shift: boolean;
};

/** 切换标签页快捷键的槽位数：⌘1…⌘9，按应用注册顺序取用。 */
export const SWITCH_APP_SLOTS = 9;

export type ShortcutSettings = {
  openSettings: Shortcut;
  toggleFullscreen: Shortcut;
  /** 按注册顺序切换应用标签，默认 ⌘1…⌘9；只用到前 apps.length 个。 */
  switchApps: Shortcut[];
};

export type ShortcutId = keyof ShortcutSettings;

function switchAppDefaults(): Shortcut[] {
  return Array.from({ length: SWITCH_APP_SLOTS }, (_, index) => ({
    key: String(index + 1),
    ctrl: false,
    meta: true,
    alt: false,
    shift: false,
  }));
}

export const DEFAULT_SHORTCUTS: ShortcutSettings = {
  openSettings: { key: ",", ctrl: false, meta: true, alt: false, shift: false },
  toggleFullscreen: { key: "Enter", ctrl: false, meta: true, alt: false, shift: false },
  switchApps: switchAppDefaults(),
};

const STORAGE_KEY = "nib:shortcuts";
const MODIFIER_KEYS = new Set(["Control", "Meta", "Alt", "Shift", "CapsLock"]);
const KEY_ALIASES: Record<string, string> = {
  " ": "Space",
  Escape: "Esc",
  ArrowUp: "↑",
  ArrowDown: "↓",
  ArrowLeft: "←",
  ArrowRight: "→",
};

function normalizeKey(key: string): string | null {
  if (!key || MODIFIER_KEYS.has(key)) return null;
  return KEY_ALIASES[key] ?? (key.length === 1 ? key.toLowerCase() : key);
}

export function normalizeShortcut(value: unknown): Shortcut | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Record<string, unknown>;
  if (typeof raw.key !== "string") return null;

  const key = normalizeKey(raw.key);
  const ctrl = raw.ctrl === true;
  const meta = raw.meta === true;
  const alt = raw.alt === true;
  const shift = raw.shift === true;
  // 普通按键会抢输入焦点（Esc 还得留给弹窗关闭），所以至少保留一个主修饰键。
  if (!key || (!ctrl && !meta && !alt)) return null;
  return { key, ctrl, meta, alt, shift };
}

export function shortcutFromEvent(event: KeyboardEvent): Shortcut | null {
  if (event.repeat || event.isComposing) return null;
  const key = normalizeKey(event.key);
  if (!key) return null;
  if (!event.ctrlKey && !event.metaKey && !event.altKey) return null;
  return {
    key,
    ctrl: event.ctrlKey,
    meta: event.metaKey,
    alt: event.altKey,
    shift: event.shiftKey,
  };
}

export function matchesShortcut(event: KeyboardEvent, shortcut: Shortcut): boolean {
  const key = normalizeKey(event.key);
  return (
    key === shortcut.key &&
    event.ctrlKey === shortcut.ctrl &&
    event.metaKey === shortcut.meta &&
    event.altKey === shortcut.alt &&
    event.shiftKey === shortcut.shift
  );
}

export function isSameShortcut(a: Shortcut, b: Shortcut): boolean {
  return (
    a.key === b.key &&
    a.ctrl === b.ctrl &&
    a.meta === b.meta &&
    a.alt === b.alt &&
    a.shift === b.shift
  );
}

export function shortcutKeys(shortcut: Shortcut): string[] {
  const keys: string[] = [];
  if (shortcut.ctrl) keys.push("Ctrl");
  if (shortcut.meta) keys.push("⌘");
  if (shortcut.alt) keys.push("Option");
  if (shortcut.shift) keys.push("Shift");
  keys.push(shortcut.key.length === 1 ? shortcut.key.toUpperCase() : shortcut.key);
  return keys;
}

export function normalizeShortcuts(
  value: unknown,
  fallback: ShortcutSettings = DEFAULT_SHORTCUTS,
): ShortcutSettings {
  const raw = (value ?? {}) as Record<string, unknown>;
  // 旧版配置里还有「退出全屏」等已删除的条目，整份视为过期，回到新默认值。
  if ("exitFullscreen" in raw) return fallback;

  const rawSwitchApps = Array.isArray(raw.switchApps) ? raw.switchApps : [];
  const shortcuts: ShortcutSettings = {
    openSettings: normalizeShortcut(raw.openSettings) ?? fallback.openSettings,
    toggleFullscreen: normalizeShortcut(raw.toggleFullscreen) ?? fallback.toggleFullscreen,
    switchApps: fallback.switchApps.map(
      (item, index) => normalizeShortcut(rawSwitchApps[index]) ?? item,
    ),
  };

  const all = [shortcuts.openSettings, shortcuts.toggleFullscreen, ...shortcuts.switchApps];
  const hasDuplicate = all.some((shortcut, index) =>
    all.slice(index + 1).some((other) => isSameShortcut(shortcut, other)),
  );
  return hasDuplicate ? fallback : shortcuts;
}

export function readShortcuts(): ShortcutSettings {
  try {
    return normalizeShortcuts(JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "null"));
  } catch {
    return DEFAULT_SHORTCUTS;
  }
}

export function saveShortcuts(shortcuts: ShortcutSettings): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(shortcuts));
}
