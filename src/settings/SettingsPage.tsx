/**
 * 设置页。
 *
 * 打开时整窗换掉应用外壳：左边是设置导航，右边是设置内容。
 * 排版照 Codex 那套走——小节标题 + 一张圆角卡片，卡片里一行一个设置项，
 * 行首是名称和说明，行尾是控件。
 *
 * 改动先落在本地草稿上：草稿即时写 DOM，所以能边改边看到效果，但不落盘。
 * 右上角保存才写回 localStorage；直接返回就等于放弃草稿，回去还是原来那套。
 */
import { useEffect, useRef, useState, type ComponentType, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { APPS } from "../apps/registry";
import { ColorSwatch } from "./ColorPicker";
import {
  DEFAULT_FONTS,
  FONT_FACES,
  FONT_WEIGHTS,
  SYSTEM_FAMILY,
  UI_SCALES,
  applyFonts,
  isBuiltinFace,
  loadFontFaces,
  normalizeFonts,
  type FontFace,
  type FontRole,
  type FontSetting,
  type FontSettings,
} from "../fonts";
import {
  COLOR_TOKENS,
  DEFAULT_THEME,
  THEMES,
  applyTheme,
  isThemeId,
  normalizeColors,
  presetTheme,
  type ThemeColors,
  type ThemeId,
  type ThemeState,
} from "../theme";
import {
  ArrowLeftIcon,
  BracesIcon,
  CheckIcon,
  ChevronDownIcon,
  KeyboardIcon,
  PaletteIcon,
  TypeIcon,
} from "../shell/icons";
import {
  DEFAULT_SHORTCUTS,
  isSameShortcut,
  normalizeShortcuts,
  shortcutFromEvent,
  shortcutKeys,
  type Shortcut,
  type ShortcutId,
  type ShortcutSettings,
} from "../shortcuts";

/** 一份完整配置：配色 + 两套字体 + 快捷键。 */
type Config = { theme: ThemeState; fonts: FontSettings; shortcuts: ShortcutSettings };

type SettingsPageProps = {
  /** 上次保存的配置，进来时拿它当草稿的初值和「还原」的目标 */
  theme: ThemeState;
  fonts: FontSettings;
  shortcuts: ShortcutSettings;
  onBack: () => void;
  onSave: (next: Config) => void;
};

const PAGE_GROUPS = [
  {
    group: "个人",
    items: [
      { id: "fonts", label: "字体", icon: TypeIcon },
      { id: "theme", label: "外观", icon: PaletteIcon },
      { id: "shortcuts", label: "快捷键", icon: KeyboardIcon },
    ],
  },
  {
    group: "配置",
    items: [{ id: "data", label: "数据", icon: BracesIcon }],
  },
] as const;

type PageId = (typeof PAGE_GROUPS)[number]["items"][number]["id"];

const PAGE_TITLES: Record<PageId, string> = {
  fonts: "字体",
  theme: "外观",
  shortcuts: "快捷键",
  data: "数据",
};

/** 顶部留白兼作窗口拖动区，macOS 的红绿灯按钮浮在这块空白上。 */
const TITLEBAR_DRAG = { "data-tauri-drag-region": true } as const;

const COLOR_GROUPS = [...new Set(COLOR_TOKENS.map((token) => token.group))];

const ALL_SECTION_IDS = PAGE_GROUPS.flatMap((group) =>
  group.items.map((item) => `${item.id}-page`),
);

export function SettingsPage({ theme, fonts, shortcuts, onBack, onSave }: SettingsPageProps) {
  const [activeSection, setActiveSection] = useState(ALL_SECTION_IDS[0]);
  const scrollRef = useRef<HTMLElement | null>(null);
  const saved: Config = { theme, fonts, shortcuts };
  // 草稿：改了立刻写 DOM 预览效果，但没落盘，返回就没了。
  const [draft, setDraft] = useState<Config>(saved);
  // 比内容不比引用：色值改回原样、恢复默认后本来就等于存的那份，都不算改动。
  const dirty = JSON.stringify(draft) !== JSON.stringify(saved);

  useEffect(() => {
    applyTheme(draft.theme);
    applyFonts(draft.fonts);
  }, [draft]);

  // Esc 和「返回应用」一样直接退出设置；弹层打开时它会先消费 Esc，这里让路。
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || event.metaKey || event.ctrlKey || event.altKey) return;
      if (document.querySelector("[data-nib-overlay]")) return;
      onBack();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onBack]);

  const goToSection = (id: string) => {
    const section = document.getElementById(id);
    const container = scrollRef.current;
    if (!section || !container) return;

    setActiveSection(id);
    // scrollIntoView 在临界位置可能停得不够准，导致滚动跟随又把高亮抢回上一项。
    // 这里直接按 scroll-mt 计算目标位置，保证滚动结束后高亮和点击项一致。
    const targetTop =
      section.getBoundingClientRect().top -
      container.getBoundingClientRect().top +
      container.scrollTop -
      72;
    container.scrollTo({ top: targetTop, behavior: "smooth" });
  };

  // 滚动时反查当前区块，让左侧子导航保持 VSCode 那种跟随高亮。
  useEffect(() => {
    const container = scrollRef.current;
    if (!container) return;
    let frame = 0;
    const update = () => {
      frame = 0;
      const boundary = container.getBoundingClientRect().top + 88;
      const current = [...ALL_SECTION_IDS]
        .reverse()
        .find((id: string) => {
          const section = document.getElementById(id);
          return section && section.getBoundingClientRect().top <= boundary;
        });
      const atBottom =
        container.scrollTop + container.clientHeight >= container.scrollHeight - 16;
      const last = ALL_SECTION_IDS[ALL_SECTION_IDS.length - 1];
      setActiveSection(atBottom ? last : current ?? ALL_SECTION_IDS[0]);
    };
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };
    const observer = new ResizeObserver(onScroll);
    observer.observe(container);
    container.addEventListener("scroll", onScroll, { passive: true });
    frame = requestAnimationFrame(update);
    return () => {
      observer.disconnect();
      container.removeEventListener("scroll", onScroll);
      if (frame) cancelAnimationFrame(frame);
    };
  }, []);

  const selectPreset = (id: ThemeId) =>
    setDraft((current) => ({ ...current, theme: presetTheme(id) }));

  const changeColors = (colors: ThemeColors) =>
    setDraft((current) => ({ ...current, theme: { ...current.theme, colors } }));

  /** 恢复默认配置：只改草稿，照样得点保存，点错了「还原」还能退回来。 */
  const resetToDefaults = () =>
    setDraft({
      theme: presetTheme(DEFAULT_THEME),
      fonts: DEFAULT_FONTS,
      shortcuts: DEFAULT_SHORTCUTS,
    });

  const changeFont = (role: FontRole, patch: Partial<FontSetting>) =>
    setDraft((current) => ({
      ...current,
      fonts: { ...current.fonts, [role]: { ...current.fonts[role], ...patch } },
    }));

  const changeShortcut = (id: ShortcutId, shortcut: Shortcut) =>
    setDraft((current) => ({
      ...current,
      shortcuts: { ...current.shortcuts, [id]: shortcut },
    }));

  const changeSwitchApp = (index: number, shortcut: Shortcut) =>
    setDraft((current) => ({
      ...current,
      shortcuts: {
        ...current.shortcuts,
        switchApps: current.shortcuts.switchApps.map((item, i) =>
          i === index ? shortcut : item,
        ),
      },
    }));

  return (
    <div className="flex h-full bg-canvas">
      <aside className="flex w-[13.75rem] shrink-0 flex-col border-r border-line bg-sidebar">
        <div className="h-12 shrink-0" {...TITLEBAR_DRAG} />
        <div className="px-2.5">
          <NavItem icon={ArrowLeftIcon} label="返回应用" onClick={onBack} />
        </div>

        <nav className="flex-1 overflow-y-auto px-2.5 pt-3">
          {PAGE_GROUPS.map((group) => (
            <div key={group.group} className="pt-4 first:pt-0">
              <h2 className="px-2.5 pb-1 text-ui-sm text-ink-subtle">{group.group}</h2>
              {group.items.map((item) => (
                <div key={item.id}>
                  <NavItem
                    icon={item.icon}
                    label={item.label}
                    active={activeSection.startsWith(`${item.id}-`)}
                    onClick={() => goToSection(`${item.id}-page`)}
                  />
                </div>
              ))}
            </div>
          ))}
        </nav>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        {/* 顶部只留拖动区；配置内容整体滚动，操作栏吸附在滚动容器顶部 */}
        <div className="h-12 shrink-0" {...TITLEBAR_DRAG} />

        <main ref={scrollRef} className="min-w-0 flex-1 overflow-y-auto">
          <div className="mx-auto w-full max-w-[70rem] px-8 pb-24 pt-2">
            <div className="sticky top-0 z-10 -mx-8 bg-canvas px-8 pb-4 pt-2">
              <div className="flex shrink-0 items-center gap-2">
                <h1 className="min-w-0 flex-1 text-ui-xl font-medium text-ink">设置</h1>
                {dirty && <span className="text-ui-sm text-ink-subtle">有未保存的改动</span>}
                <button type="button" onClick={resetToDefaults} className={GHOST_BUTTON}>
                  恢复默认配置
                </button>
                <button
                  type="button"
                  onClick={() => setDraft(saved)}
                  disabled={!dirty}
                  className={GHOST_BUTTON}
                >
                  还原
                </button>
                <button
                  type="button"
                  onClick={() => onSave(draft)}
                  disabled={!dirty}
                  className={PRIMARY_BUTTON}
                >
                  保存
                </button>
              </div>
            </div>

            {PAGE_GROUPS.map((group) =>
              group.items.map((item) => (
              <section
                key={item.id}
                id={`${item.id}-page`}
                className="scroll-mt-[4.5rem] pb-16"
              >
                <h2 className="pb-8 text-ui-xl font-medium text-ink">{PAGE_TITLES[item.id]}</h2>
                {item.id === "fonts" && (
                  <FontsPage
                    fonts={draft.fonts}
                    onChangeFont={changeFont}
                    onChangeScale={(scale) =>
                      setDraft((current) => ({ ...current, fonts: { ...current.fonts, scale } }))
                    }
                  />
                )}
                {item.id === "theme" && (
                  <ThemePage
                    theme={draft.theme}
                    onSelectPreset={selectPreset}
                    onChangeColors={changeColors}
                  />
                )}
                {item.id === "shortcuts" && (
                  <ShortcutsPage
                    shortcuts={draft.shortcuts}
                    onChange={changeShortcut}
                    onSwitchAppChange={changeSwitchApp}
                    onReset={() => setDraft((current) => ({ ...current, shortcuts: DEFAULT_SHORTCUTS }))}
                  />
                )}
                {item.id === "data" && (
                  <DataPage
                    theme={draft.theme}
                    fonts={draft.fonts}
                    shortcuts={draft.shortcuts}
                    onImport={setDraft}
                  />
                )}
              </section>
              ))
            )}
          </div>
        </main>
      </div>
    </div>
  );
}

function NavItem({
  icon: Icon,
  label,
  active,
  onClick,
}: {
  icon: ComponentType<{ className?: string }>;
  label: string;
  active?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        "flex h-[1.875rem] w-full items-center gap-2.5 rounded-lg px-2.5 text-left text-ui transition-colors duration-100",
        active ? "bg-accent-soft font-medium text-accent" : "text-ink-muted hover:bg-raised hover:text-ink",
      ].join(" ")}
    >
      <Icon className="size-4 shrink-0" />
      <span className="truncate">{label}</span>
    </button>
  );
}

function Section({
  title,
  id,
  children,
  fill = false,
}: {
  title: string;
  id?: string;
  children: ReactNode;
  fill?: boolean;
}) {
  return (
    <section id={id} className={`scroll-mt-[4.5rem] ${fill ? "flex min-h-0 flex-1 flex-col" : "pb-10"}`}>
      <h2 className="shrink-0 pb-3 text-ui-sm font-medium text-ink-muted">{title}</h2>
      <div
        className={`overflow-hidden rounded-xl border border-line bg-raised px-8 ${
          fill ? "flex min-h-0 flex-1 flex-col" : ""
        }`}
      >
        {children}
      </div>
    </section>
  );
}

function FontsPage({
  fonts,
  onChangeFont,
  onChangeScale,
}: {
  fonts: FontSettings;
  onChangeFont: (role: FontRole, patch: Partial<FontSetting>) => void;
  onChangeScale: (scale: number) => void;
}) {
  // 系统字体是异步来的，先拿内置列表顶上，加载完再换。
  const [faces, setFaces] = useState(FONT_FACES);

  useEffect(() => {
    loadFontFaces().then(setFaces);
  }, []);

  return (
    <>
      <Section title="界面缩放" id="fonts-scale">
        <Row label="整体大小" hint="文字和布局一起放大，默认 100%">
          <select
            value={fonts.scale}
            onChange={(event) => onChangeScale(Number(event.target.value))}
            className={`${CONTROL} w-[8.25rem]`}
          >
            {UI_SCALES.map((item) => (
              <option key={item.value} value={item.value}>
                {item.label}
              </option>
            ))}
          </select>
        </Row>
      </Section>
      <Section title="内容字体" id="fonts-content">
        <FontRows
          value={fonts.content}
          faces={faces}
          withLeading
          onChange={(patch) => onChangeFont("content", patch)}
        />
      </Section>
      <Section title="系统字体" id="fonts-ui">
        <FontRows
          value={fonts.ui}
          faces={faces}
          onChange={(patch) => onChangeFont("ui", patch)}
        />
      </Section>
    </>
  );
}

function FontRows({
  value,
  faces,
  withLeading,
  onChange,
}: {
  value: FontSetting;
  faces: FontFace[];
  withLeading?: boolean;
  onChange: (patch: Partial<FontSetting>) => void;
}) {
  return (
    <>
      <Row label="字体" hint="本机已安装的全部字样">
        <FontPicker faces={faces} value={value} onChange={onChange} />
      </Row>
      <Row label="字号">
        <input
          type="number"
          min={9}
          max={32}
          step={1}
          value={value.size}
          onChange={(event) => changeNumber(event, (size) => onChange({ size }))}
          className={`${CONTROL} w-[4.75rem] text-right`}
        />
      </Row>
      {!value.face && (
        <Row label="字重">
          <select
            value={value.weight}
            onChange={(event) => onChange({ weight: Number(event.target.value) })}
            className={`${CONTROL} w-[8.25rem]`}
          >
            {FONT_WEIGHTS.map((weight) => (
              <option key={weight.value} value={weight.value}>
                {weight.label} {weight.value}
              </option>
            ))}
          </select>
        </Row>
      )}
      {withLeading && (
        <Row label="行高">
          <input
            type="number"
            min={1}
            max={3}
            step={0.05}
            value={value.leading}
            onChange={(event) => changeNumber(event, (leading) => onChange({ leading }))}
            className={`${CONTROL} w-[4.75rem] text-right`}
          />
        </Row>
      )}
    </>
  );
}

/**
 * 字体选择框。
 *
 * 不用原生 <select>：macOS 会把它弹成一条几百项的长菜单，一滚就跳回顶部。
 * 这里自己画一个，面板用 fixed 挂在 body 上（躲开卡片的 overflow-hidden），
 * 列表自己滚，顶上带搜索。
 */
function FontPicker({
  faces,
  value,
  onChange,
}: {
  faces: FontFace[];
  value: FontSetting;
  onChange: (patch: Partial<FontSetting>) => void;
}) {
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState<{ top?: number; bottom?: number; right: number; maxHeight: number }>();
  const [query, setQuery] = useState("");

  const availableFaces =
    value.face && !faces.some((face) => face.postScriptName === value.face?.postScriptName)
      ? [
          {
            postScriptName: value.face.postScriptName,
            family: value.family,
            styleName: "当前选择",
            displayName: value.face.postScriptName,
          },
          ...faces,
        ]
      : faces;
  const legacyFamily =
    !value.face && value.family !== SYSTEM_FAMILY ? value.family : undefined;
  const options: Array<{
    key: string;
    label: string;
    search: string;
    face?: FontFace;
  }> = [
    { key: SYSTEM_FAMILY, label: "系统默认", search: "系统默认 system-ui" },
    ...availableFaces.map((face) => ({
      key: face.postScriptName,
      // 内置的两项标出来：它们是出厂默认，和「本机装的字体」不是一回事。
      label: isBuiltinFace(face.postScriptName)
        ? `${faceLabel(face)}（内置）`
        : faceLabel(face),
      search: [face.family, face.styleName, face.displayName, face.postScriptName].join(" "),
      face,
    })),
    ...(legacyFamily
      ? [
          {
            key: `legacy:${legacyFamily}`,
            label: `${legacyFamily}（旧配置 · ${value.weight}）`,
            search: `${legacyFamily} 旧配置 ${value.weight}`,
          },
        ]
      : []),
  ];
  const selectedKey =
    value.face?.postScriptName ??
    (legacyFamily ? `legacy:${legacyFamily}` : SYSTEM_FAMILY);
  const currentFace = availableFaces.find(
    (face) => face.postScriptName === value.face?.postScriptName,
  );
  const keyword = query.trim().toLowerCase();
  const matches = keyword
    ? options.filter((option) => option.search.toLowerCase().includes(keyword))
    : options;

  const close = () => setBox(undefined);

  useEffect(() => {
    if (!box) return;
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (triggerRef.current?.contains(target) || panelRef.current?.contains(target)) return;
      close();
    };
    // 面板是固定定位的，外面的列表一滚它就对不上位置了，索性关掉；
    // 面板自己的列表不算「外面」，不然滚字体就把弹层滚没了。
    const onScroll = (event: Event) => {
      // resize 事件的 target 是 window，不是节点，contains 会直接抛错
      if (event.target instanceof Node && panelRef.current?.contains(event.target)) return;
      close();
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") close();
    };
    window.addEventListener("pointerdown", onPointerDown, true);
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", onScroll);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("pointerdown", onPointerDown, true);
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", onScroll);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [box]);

  const toggle = () => {
    if (box) return close();
    const rect = triggerRef.current!.getBoundingClientRect();
    // 下面放不下就翻到上面去，省得面板跑出窗口。
    const below = window.innerHeight - rect.bottom - 24;
    const flip = below < 200;
    setQuery("");
    setBox({
      right: window.innerWidth - rect.right,
      top: flip ? undefined : rect.bottom + 6,
      bottom: flip ? window.innerHeight - rect.top + 6 : undefined,
      maxHeight: Math.max(160, Math.min(360, flip ? rect.top - 24 : below)),
    });
  };

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={toggle}
        className={`${CONTROL} flex w-[18.75rem] items-center justify-between gap-2`}
      >
        <span className="truncate">
          {currentFace
            ? faceLabel(currentFace)
            : value.face?.postScriptName ?? fontLabel(value.family)}
        </span>
        <ChevronDownIcon className="size-3.5 shrink-0 text-ink-muted" />
      </button>

      {box &&
        createPortal(
          <div
            ref={panelRef}
            data-nib-overlay
            className="fixed z-50 flex w-[18.75rem] flex-col overflow-hidden rounded-lg border border-line-strong bg-raised shadow-xl"
            style={box}
          >
            <input
              autoFocus
              value={query}
              spellCheck={false}
              placeholder="搜索字体、样式或 PostScript 名"
              onChange={(event) => setQuery(event.target.value)}
              className="shrink-0 border-b border-line bg-transparent px-3 py-2 text-ui text-ink outline-none placeholder:text-ink-subtle"
            />
            <div className="min-h-0 flex-1 overflow-y-auto py-1">
              {matches.map((option) => (
                <button
                  key={option.key}
                  type="button"
                  onClick={() => {
                    if (option.face) {
                      onChange({
                        family: option.face.family,
                        face: { postScriptName: option.face.postScriptName },
                      });
                    } else if (option.key === SYSTEM_FAMILY) {
                      onChange({ family: SYSTEM_FAMILY, face: undefined });
                    }
                    close();
                  }}
                  className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-ink hover:bg-control"
                >
                  <span className="truncate" style={{ fontFamily: option.face?.family }}>
                    {option.label}
                  </span>
                  {option.key === selectedKey && (
                    <CheckIcon className="ml-auto size-3.5 shrink-0 text-accent" />
                  )}
                </button>
              ))}
              {matches.length === 0 && (
                <div className="px-3 py-2 text-ui-sm text-ink-subtle">没有匹配的字体</div>
              )}
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}

/** 字体族在界面上的名字：system-ui 不是具体字体，写成「系统默认」。 */
function fontLabel(family: string): string {
  return family === SYSTEM_FAMILY ? "系统默认" : family;
}

/** Font Book 里一项「字样」的显示名。 */
function faceLabel(face: FontFace): string {
  return face.styleName && face.styleName !== face.family
    ? `${face.family} — ${face.styleName}`
    : face.family;
}

function ThemePage({
  theme,
  onSelectPreset,
  onChangeColors,
}: {
  theme: ThemeState;
  onSelectPreset: (id: ThemeId) => void;
  onChangeColors: (colors: ThemeColors) => void;
}) {
  return (
    <>
      <Section title="预设" id="theme-presets">
        {THEMES.map((preset) => {
          const active = preset.id === theme.base;
          return (
            <button
              key={preset.id}
              type="button"
              onClick={() => onSelectPreset(preset.id)}
              className={ROW}
            >
              <span
                data-theme={preset.id}
                className="flex h-5 w-8 shrink-0 overflow-hidden rounded-[0.3125rem] ring-1 ring-line"
              >
                <span className="flex-1 bg-canvas" />
                <span className="flex-1 bg-raised" />
                <span className="w-2.5 bg-accent" />
              </span>
              <span className="min-w-0 flex-1 truncate text-ui text-ink">{preset.label}</span>
              {active && <CheckIcon className="size-4 shrink-0 text-accent" />}
            </button>
          );
        })}
        <Row label="恢复预设" hint="把手改过的色值退回当前预设">
          <button type="button" onClick={() => onSelectPreset(theme.base)} className={BUTTON}>
            恢复
          </button>
        </Row>
      </Section>

      {COLOR_GROUPS.map((group, index) => (
        <Section key={group} title={group} id={`theme-group-${index}`}>
          {COLOR_TOKENS.filter((token) => token.group === group).map((token) => (
            <ColorRow
              key={token.id}
              label={token.label}
              value={theme.colors[token.id]}
              onChange={(value) => onChangeColors({ ...theme.colors, [token.id]: value })}
            />
          ))}
        </Section>
      ))}
    </>
  );
}

function ColorRow({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  const [draft, setDraft] = useState(value);

  // 换预设、导入 JSON 都要把输入框里没提交的草稿冲掉
  const [lastValue, setLastValue] = useState(value);
  if (lastValue !== value) {
    setLastValue(value);
    setDraft(value);
  }

  const commit = () => {
    const hex = draft.trim().toLowerCase();
    if (/^#[0-9a-f]{6}$/.test(hex)) onChange(hex);
    else setDraft(value);
  };

  return (
    <div className={ROW}>
      <span className="min-w-0 flex-1 truncate text-ui text-ink">{label}</span>
      <ColorSwatch label={label} value={value} onChange={onChange} />
      <input
        value={draft}
        spellCheck={false}
        aria-label={`${label} 十六进制`}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={commit}
        onKeyDown={(event) => {
          if (event.key === "Enter") commit();
          if (event.key === "Escape") setDraft(value);
        }}
        className={HEX_INPUT}
      />
    </div>
  );
}

const SHORTCUT_ROWS: Array<{
  id: "openSettings" | "toggleFullscreen";
  label: string;
  hint: string;
}> = [
  { id: "openSettings", label: "打开设置", hint: "在应用和设置页里都可以使用" },
  { id: "toggleFullscreen", label: "切换页面全屏", hint: "进入或退出当前应用的全屏模式" },
];

function ShortcutsPage({
  shortcuts,
  onChange,
  onSwitchAppChange,
  onReset,
}: {
  shortcuts: ShortcutSettings;
  onChange: (id: ShortcutId, shortcut: Shortcut) => void;
  onSwitchAppChange: (index: number, shortcut: Shortcut) => void;
  onReset: () => void;
}) {
  // 冲突检测要覆盖全部条目：固定项 + 每个标签页槽位。
  const fixedShortcuts = [shortcuts.openSettings, shortcuts.toggleFullscreen];
  const switchAppConflicts = (index: number) => [
    ...fixedShortcuts,
    ...shortcuts.switchApps.filter((_, i) => i !== index),
  ];

  return (
    <>
      <Section title="应用快捷键" id="shortcuts-app">
        {SHORTCUT_ROWS.map((row) => (
          <Row key={row.id} label={row.label} hint={row.hint}>
            <ShortcutRecorder
              value={shortcuts[row.id]}
              conflicts={[...fixedShortcuts.filter((other) => other !== shortcuts[row.id]), ...shortcuts.switchApps]}
              onChange={(shortcut) => onChange(row.id, shortcut)}
            />
          </Row>
        ))}
      </Section>
      <Section title="切换标签页" id="shortcuts-tabs">
        {APPS.map((app, index) => (
          <Row
            key={app.id}
            label={`切换到 ${app.name}`}
            hint={`默认 ⌘${index + 1}，按注册顺序分配`}
          >
            <ShortcutRecorder
              value={shortcuts.switchApps[index] ?? DEFAULT_SHORTCUTS.switchApps[index]}
              conflicts={switchAppConflicts(index)}
              onChange={(shortcut) => onSwitchAppChange(index, shortcut)}
            />
          </Row>
        ))}
        <Row label="恢复默认快捷键" hint="只影响快捷键，不改变配色和字体">
          <button type="button" onClick={onReset} className={BUTTON}>
            恢复
          </button>
        </Row>
      </Section>
    </>
  );
}

function ShortcutRecorder({
  value,
  conflicts,
  onChange,
}: {
  value: Shortcut;
  conflicts: Shortcut[];
  onChange: (shortcut: Shortcut) => void;
}) {
  const [recording, setRecording] = useState(false);
  const [error, setError] = useState<string>();

  useEffect(() => {
    if (!recording) return;
    const onKeyDown = (event: KeyboardEvent) => {
      event.preventDefault();
      event.stopPropagation();

      // Esc 一律是「取消录制」。
      if (event.key === "Escape") {
        setRecording(false);
        setError(undefined);
        return;
      }

      const shortcut = shortcutFromEvent(event);
      if (!shortcut) {
        setError("请同时按 Ctrl、Command 或 Option 和一个按键");
        return;
      }
      if (conflicts.some((conflict) => isSameShortcut(conflict, shortcut))) {
        setError("这个快捷键已被其他操作占用");
        return;
      }

      onChange(shortcut);
      setRecording(false);
      setError(undefined);
    };

    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [conflicts, onChange, recording]);

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        aria-label={recording ? "正在录制快捷键" : `修改快捷键：${shortcutKeys(value).join(" + ")}`}
        aria-pressed={recording}
        onClick={() => {
          setRecording((current) => !current);
          setError(undefined);
        }}
        onBlur={() => {
          setRecording(false);
          setError(undefined);
        }}
        className={[
          "inline-flex h-[1.875rem] min-w-[5.375rem] items-center justify-center rounded-lg border bg-canvas px-2.5 text-ui text-ink transition-colors",
          recording ? "border-focus" : "border-line hover:border-line-strong",
        ].join(" ")}
      >
        {recording ? (
          <span className="text-ink-subtle">请按快捷键…</span>
        ) : (
          <ShortcutKeycaps shortcut={value} />
        )}
      </button>
      {error && <span className="text-ui-xs text-danger">{error}</span>}
    </div>
  );
}

function ShortcutKeycaps({ shortcut }: { shortcut: Shortcut }) {
  return (
    <span className="flex items-center gap-1">
      {shortcutKeys(shortcut).map((key, index) => (
        <kbd
          key={`${key}-${index}`}
          className="flex h-[1.125rem] min-w-[1.125rem] items-center justify-center rounded-[0.3125rem] border border-line bg-control px-1 font-sans text-ui-xs leading-none"
        >
          {key}
        </kbd>
      ))}
    </span>
  );
}

function DataPage({
  theme,
  fonts,
  shortcuts,
  onImport,
}: {
  theme: ThemeState;
  fonts: FontSettings;
  shortcuts: ShortcutSettings;
  onImport: (next: Config) => void;
}) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const highlightRef = useRef<HTMLPreElement>(null);
  const [status, setStatus] = useState<{ text: string; error?: boolean } | null>(null);
  const [mode, setMode] = useState<"preview" | "edit">("preview");
  const [editValue, setEditValue] = useState("");
  const json = JSON.stringify({ theme, fonts, shortcuts }, null, 2);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(json);
    } catch {
      textareaRef.current?.select();
      document.execCommand("copy");
    }
    setStatus({ text: "已复制到剪贴板" });
  };

  const download = () => {
    const url = URL.createObjectURL(new Blob([json], { type: "application/json" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = "nib-config.json";
    link.click();
    URL.revokeObjectURL(url);
    setStatus({ text: "已导出 nib-config.json" });
  };

  /** 把解析后的 JSON 收敛成配置；字段缺失/非法直接抛错，由调用方展示。 */
  const parseConfig = (raw: Record<string, unknown>): Config => {
    const rawTheme = (raw.theme ?? {}) as Record<string, unknown>;
    const colors = normalizeColors(rawTheme.colors);
    if (!colors) throw new Error("配色必须是完整的 #rrggbb 色值");
    return {
      theme: { base: isThemeId(rawTheme.base) ? rawTheme.base : theme.base, colors },
      fonts: normalizeFonts(raw.fonts, fonts),
      shortcuts: normalizeShortcuts(raw.shortcuts, shortcuts),
    };
  };

  const importFile = async (file: File) => {
    try {
      const raw = JSON.parse(await file.text()) as Record<string, unknown>;
      onImport(parseConfig(raw));
      setStatus({ text: "已导入到草稿，点右上角保存生效" });
    } catch (error) {
      setStatus({ text: `导入失败：${(error as Error).message}`, error: true });
    }
  };

  const startEdit = () => {
    setEditValue(json);
    setStatus(null);
    setMode("edit");
  };

  /** 编辑完切回预览：先校验，通过才应用到草稿，否则留在编辑态。 */
  const applyEdit = () => {
    try {
      const raw = JSON.parse(editValue) as Record<string, unknown>;
      onImport(parseConfig(raw));
      setStatus({ text: "已应用到草稿，点右上角保存生效" });
      setMode("preview");
    } catch (error) {
      setStatus({ text: `JSON 有误：${(error as Error).message}`, error: true });
    }
  };

  const CODE_AREA =
    "block h-[38rem] w-full resize-none overflow-auto rounded-lg border border-line bg-canvas p-3 font-mono text-ui-sm leading-5 text-ink-muted outline-none focus:border-focus";

  return (
    <Section title="配置文件" id="data-config">
      <Row label="整份配置">
        <div className="flex items-center gap-2">
          <button type="button" onClick={copy} className={BUTTON}>
            复制
          </button>
          <button type="button" onClick={download} className={BUTTON}>
            导出
          </button>
          <label className={BUTTON}>
            导入
            <input
              type="file"
              accept=".json,application/json"
              className="hidden"
              onChange={(event) => {
                const file = event.target.files?.[0];
                event.target.value = "";
                if (file) void importFile(file);
              }}
            />
          </label>
        </div>
      </Row>
      <div className="flex flex-col border-t border-line py-8">
        <div className="flex shrink-0 items-center gap-3 pb-3">
          <div className="inline-flex items-center gap-0.5 rounded-lg bg-control p-0.5">
            {(
              [
                ["preview", "预览"],
                ["edit", "编辑"],
              ] as const
            ).map(([value, label]) => (
              <button
                key={value}
                type="button"
                aria-pressed={mode === value}
                onClick={() => (value === "edit" ? startEdit() : applyEdit())}
                className={`h-7 rounded-md px-3 text-ui transition-colors ${
                  mode === value
                    ? "bg-surface font-medium text-ink shadow-sm"
                    : "text-ink-muted hover:text-ink"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
          {mode === "edit" && (
            <span className="text-ui-sm text-ink-subtle">切回预览时会校验并应用到草稿</span>
          )}
        </div>

        <div className="min-h-0 flex-1">
          {mode === "preview" ? (
            <pre aria-label="配置 JSON 预览" className={CODE_AREA}>
              {highlightJson(json)}
            </pre>
          ) : (
            <div className="relative h-[38rem] w-full overflow-hidden rounded-lg border border-line bg-canvas focus-within:border-focus">
              <pre
                ref={highlightRef}
                aria-hidden="true"
                className="pointer-events-none absolute inset-0 overflow-hidden whitespace-pre p-3 font-mono text-ui-sm leading-5 text-ink-muted"
              >
                {highlightJson(editValue)}
              </pre>
              <textarea
                ref={textareaRef}
                value={editValue}
                onChange={(event) => setEditValue(event.target.value)}
                onScroll={(event) => {
                  if (!highlightRef.current) return;
                  highlightRef.current.scrollTop = event.currentTarget.scrollTop;
                  highlightRef.current.scrollLeft = event.currentTarget.scrollLeft;
                }}
                wrap="off"
                spellCheck={false}
                aria-label="配置 JSON 编辑"
                className="absolute inset-0 resize-none overflow-auto whitespace-pre border-0 bg-transparent p-3 font-mono text-ui-sm leading-5 text-transparent caret-ink outline-none"
              />
            </div>
          )}
        </div>
        {status && (
          <p
            className={`shrink-0 pt-2 text-ui-sm ${
              status.error ? "text-danger" : "text-ink-subtle"
            }`}
          >
            {status.text}
          </p>
        )}
      </div>
    </Section>
  );
}

const JSON_TOKEN =
  /("(?:\\.|[^"\\])*")(\s*:)?|(-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)|\b(true|false|null)\b/g;

/** 轻量 JSON 高亮：键 info、字符串 success、数字 warning、字面量 danger。 */
function highlightJson(text: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  let last = 0;
  let id = 0;
  for (const match of text.matchAll(JSON_TOKEN)) {
    const index = match.index ?? 0;
    if (index > last) nodes.push(text.slice(last, index));
    const [raw, str, colon, num, literal] = match;
    if (str && colon !== undefined) {
      nodes.push(
        <span key={id++} className="text-info">
          {str}
        </span>,
        colon,
      );
    } else if (str) {
      nodes.push(
        <span key={id++} className="text-success">
          {str}
        </span>,
      );
    } else if (num) {
      nodes.push(
        <span key={id++} className="text-warning">
          {num}
        </span>,
      );
    } else if (literal) {
      nodes.push(
        <span key={id++} className="text-danger">
          {literal}
        </span>,
      );
    }
    last = index + raw.length;
  }
  if (last < text.length) nodes.push(text.slice(last));
  return nodes;
}

/** 卡片里的一行：左边名称 + 说明，右边控件。分隔线靠首行豁免拼出来。 */
const ROW =
  "flex w-full shrink-0 items-center gap-4 border-t border-line py-5 text-left first:border-t-0";

function Row({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <div className={ROW}>
      <div className="min-w-0 flex-1">
        <div className="text-ui text-ink">{label}</div>
        {hint && <div className="pt-1 text-ui-sm text-ink-subtle">{hint}</div>}
      </div>
      <div className="flex shrink-0 items-center gap-2.5">{children}</div>
    </div>
  );
}

const CONTROL =
  "h-[1.875rem] rounded-lg border border-line bg-canvas px-2.5 text-ui text-ink outline-none transition-colors hover:border-line-strong focus:border-focus";

const HEX_INPUT =
  "h-[1.875rem] w-[5.75rem] rounded-lg border border-line bg-canvas px-2.5 text-right font-mono text-ui-sm text-ink-muted outline-none transition-colors hover:border-line-strong focus:border-focus";

/** 配置页里的次按钮：Codex 式轻灰底，不要描边。 */
const BUTTON =
  "inline-flex h-[1.875rem] items-center justify-center rounded-lg bg-control px-3 text-ui text-ink transition-colors enabled:hover:bg-control-hover enabled:active:bg-control-active";

/** 右上角的重置类按钮：透明底，别跟「保存」抢注意力。 */
const GHOST_BUTTON =
  "inline-flex h-[1.875rem] items-center justify-center rounded-lg px-2.5 text-ui text-ink-muted transition-colors enabled:hover:bg-control enabled:hover:text-ink enabled:active:bg-control-hover disabled:text-ink-subtle disabled:opacity-60";

/** 主按钮：Light 下是深灰实心，跟 Codex 的保存按钮一致。 */
const PRIMARY_BUTTON =
  "inline-flex h-[1.875rem] items-center justify-center rounded-lg bg-button px-3 text-ui font-medium text-ink-inverse transition-colors enabled:hover:bg-button-hover enabled:active:bg-button-active disabled:bg-control disabled:text-ink-subtle";

/** 数字输入允许先清空再输入，空值不算数。 */
function changeNumber(
  event: React.ChangeEvent<HTMLInputElement>,
  apply: (value: number) => void,
) {
  const value = Number.parseFloat(event.target.value);
  if (Number.isFinite(value)) apply(value);
}
