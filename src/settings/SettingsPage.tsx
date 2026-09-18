/**
 * 设置页。
 *
 * 打开时整窗换掉应用外壳：左边是设置导航，右边是设置内容。
 * 排版照 Codex 那套走——小节标题 + 一张圆角卡片，卡片里一行一个设置项，
 * 行首是名称和说明，行尾是控件。
 */
import { useEffect, useRef, useState, type ComponentType, type ReactNode } from "react";
import { createPortal } from "react-dom";
import {
  FONT_FAMILIES,
  FONT_WEIGHTS,
  SYSTEM_FAMILY,
  loadFontFamilies,
  normalizeFonts,
  type FontRole,
  type FontSetting,
  type FontSettings,
} from "../fonts";
import {
  COLOR_TOKENS,
  THEMES,
  isThemeId,
  normalizeColors,
  type ThemeColors,
  type ThemeId,
  type ThemeState,
} from "../theme";
import {
  ArrowLeftIcon,
  BracesIcon,
  CheckIcon,
  ChevronDownIcon,
  PaletteIcon,
  TypeIcon,
} from "../shell/icons";

type SettingsPageProps = {
  theme: ThemeState;
  fonts: FontSettings;
  onBack: () => void;
  onSelectPreset: (id: ThemeId) => void;
  onChangeColors: (colors: ThemeColors) => void;
  onChangeFont: (role: FontRole, patch: Partial<FontSetting>) => void;
  onImport: (next: { theme: ThemeState; fonts: FontSettings }) => void;
};

const PAGE_GROUPS = [
  {
    group: "个人",
    items: [
      { id: "fonts", label: "字体", icon: TypeIcon },
      { id: "theme", label: "外观", icon: PaletteIcon },
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
  data: "数据",
};

/** 顶部留白兼作窗口拖动区，macOS 的红绿灯按钮浮在这块空白上。 */
const TITLEBAR_DRAG = { "data-tauri-drag-region": true } as const;

const COLOR_GROUPS = [...new Set(COLOR_TOKENS.map((token) => token.group))];

export function SettingsPage({
  theme,
  fonts,
  onBack,
  onSelectPreset,
  onChangeColors,
  onChangeFont,
  onImport,
}: SettingsPageProps) {
  const [page, setPage] = useState<PageId>("fonts");

  return (
    <div className="flex h-full bg-canvas">
      <aside className="flex w-[220px] shrink-0 flex-col">
        <div className="h-12 shrink-0" {...TITLEBAR_DRAG} />
        <div className="px-2.5">
          <NavItem icon={ArrowLeftIcon} label="返回应用" onClick={onBack} />
        </div>

        <nav className="flex-1 overflow-y-auto px-2.5 pt-3">
          {PAGE_GROUPS.map((group) => (
            <div key={group.group} className="pt-4 first:pt-0">
              <h2 className="px-2.5 pb-1 text-ui-sm text-ink-subtle">{group.group}</h2>
              {group.items.map((item) => (
                <NavItem
                  key={item.id}
                  icon={item.icon}
                  label={item.label}
                  active={page === item.id}
                  onClick={() => setPage(item.id)}
                />
              ))}
            </div>
          ))}
        </nav>
      </aside>

      <main className="min-w-0 flex-1 overflow-y-auto">
        <div className="h-12 shrink-0" {...TITLEBAR_DRAG} />
        <div className="mx-auto w-full max-w-[1120px] px-8 pt-6 pb-24">
          <h1 className="pb-8 text-ui-xl font-medium text-ink">{PAGE_TITLES[page]}</h1>
          {page === "fonts" && <FontsPage fonts={fonts} onChangeFont={onChangeFont} />}
          {page === "theme" && (
            <ThemePage
              theme={theme}
              onSelectPreset={onSelectPreset}
              onChangeColors={onChangeColors}
            />
          )}
          {page === "data" && <DataPage theme={theme} fonts={fonts} onImport={onImport} />}
        </div>
      </main>
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
        "flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-ui transition-colors duration-100",
        active ? "bg-accent-soft font-medium text-accent" : "text-ink-muted hover:bg-raised hover:text-ink",
      ].join(" ")}
    >
      <Icon className="size-4 shrink-0" />
      <span className="truncate">{label}</span>
    </button>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="pb-10">
      <h2 className="pb-3 text-ui-sm font-medium text-ink-muted">{title}</h2>
      <div className="overflow-hidden rounded-xl bg-raised px-8">{children}</div>
    </section>
  );
}

function FontsPage({
  fonts,
  onChangeFont,
}: {
  fonts: FontSettings;
  onChangeFont: SettingsPageProps["onChangeFont"];
}) {
  // 系统字体是异步来的，先拿内置列表顶上，加载完再换。
  const [families, setFamilies] = useState(FONT_FAMILIES);

  useEffect(() => {
    loadFontFamilies().then(setFamilies);
  }, []);

  return (
    <>
      <Section title="内容字体">
        <FontRows
          value={fonts.content}
          families={families}
          withLeading
          onChange={(patch) => onChangeFont("content", patch)}
        />
      </Section>
      <Section title="系统字体">
        <FontRows
          value={fonts.ui}
          families={families}
          onChange={(patch) => onChangeFont("ui", patch)}
        />
      </Section>
    </>
  );
}

function FontRows({
  value,
  families,
  withLeading,
  onChange,
}: {
  value: FontSetting;
  families: string[];
  withLeading?: boolean;
  onChange: (patch: Partial<FontSetting>) => void;
}) {
  return (
    <>
      <Row label="字体" hint="本机已安装的字体">
        <FontPicker
          families={families}
          value={value.family}
          onChange={(family) => onChange({ family })}
        />
      </Row>
      <Row label="字号">
        <input
          type="number"
          min={9}
          max={32}
          step={1}
          value={value.size}
          onChange={(event) => changeNumber(event, (size) => onChange({ size }))}
          className={`${CONTROL} w-[76px] text-right`}
        />
      </Row>
      <Row label="字重">
        <select
          value={value.weight}
          onChange={(event) => onChange({ weight: Number(event.target.value) })}
          className={`${CONTROL} w-[132px]`}
        >
          {FONT_WEIGHTS.map((weight) => (
            <option key={weight.value} value={weight.value}>
              {weight.label} {weight.value}
            </option>
          ))}
        </select>
      </Row>
      {withLeading && (
        <Row label="行高">
          <input
            type="number"
            min={1}
            max={3}
            step={0.05}
            value={value.leading}
            onChange={(event) => changeNumber(event, (leading) => onChange({ leading }))}
            className={`${CONTROL} w-[76px] text-right`}
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
  families,
  value,
  onChange,
}: {
  families: string[];
  value: string;
  onChange: (family: string) => void;
}) {
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState<{ top?: number; bottom?: number; right: number; maxHeight: number }>();
  const [query, setQuery] = useState("");

  // 第一项固定是「系统默认」；存过的字体名可能不在系统列表里，补进去免得选不回来。
  const options = [...new Set([SYSTEM_FAMILY, ...families, value])];
  const keyword = query.trim().toLowerCase();
  const matches = keyword
    ? options.filter((family) => family.toLowerCase().includes(keyword))
    : options;

  const close = () => setBox(undefined);

  useEffect(() => {
    if (!box) return;
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (triggerRef.current?.contains(target) || panelRef.current?.contains(target)) return;
      close();
    };
    // 面板是固定定位的，外面的列表一滚它就对不上位置了，索性关掉。
    const onScroll = () => close();
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
        className={`${CONTROL} flex w-[240px] items-center justify-between gap-2`}
      >
        <span className="truncate">{fontLabel(value)}</span>
        <ChevronDownIcon className="size-3.5 shrink-0 text-ink-muted" />
      </button>

      {box &&
        createPortal(
          <div
            ref={panelRef}
            className="fixed z-50 flex w-[240px] flex-col overflow-hidden rounded-lg border border-line-strong bg-raised shadow-xl"
            style={box}
          >
            <input
              autoFocus
              value={query}
              spellCheck={false}
              placeholder="搜索字体"
              onChange={(event) => setQuery(event.target.value)}
              className="shrink-0 border-b border-line bg-transparent px-3 py-2 text-ui text-ink outline-none placeholder:text-ink-subtle"
            />
            <div className="min-h-0 flex-1 overflow-y-auto py-1">
              {matches.map((family) => (
                <button
                  key={family}
                  type="button"
                  onClick={() => {
                    onChange(family);
                    close();
                  }}
                  className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-ink hover:bg-accent-soft"
                >
                  <span className="truncate" style={{ fontFamily: family }}>
                    {fontLabel(family)}
                  </span>
                  {family === value && (
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
      <Section title="预设">
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
                className="flex h-5 w-8 shrink-0 overflow-hidden rounded-[5px] ring-1 ring-line"
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

      {COLOR_GROUPS.map((group) => (
        <Section key={group} title={group}>
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
      <input
        type="color"
        value={value}
        aria-label={`${label} 色值`}
        onChange={(event) => onChange(event.target.value)}
        className="color-input size-5 shrink-0"
      />
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

function DataPage({
  theme,
  fonts,
  onImport,
}: {
  theme: ThemeState;
  fonts: FontSettings;
  onImport: SettingsPageProps["onImport"];
}) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [status, setStatus] = useState<{ text: string; error?: boolean } | null>(null);
  const json = JSON.stringify({ theme, fonts }, null, 2);

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

  const importFile = async (file: File) => {
    try {
      const raw = JSON.parse(await file.text()) as Record<string, unknown>;
      const rawTheme = (raw.theme ?? {}) as Record<string, unknown>;
      const colors = normalizeColors(rawTheme.colors);
      if (!colors) throw new Error("配色必须是完整的 #rrggbb 色值");

      onImport({
        theme: { base: isThemeId(rawTheme.base) ? rawTheme.base : theme.base, colors },
        fonts: normalizeFonts(raw.fonts, fonts),
      });
      setStatus({ text: "已导入" });
    } catch (error) {
      setStatus({ text: `导入失败：${(error as Error).message}`, error: true });
    }
  };

  return (
    <Section title="配置文件">
      <Row label="整份配置" hint="配色和字体都在这个 JSON 里">
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
      <div className="border-t border-line py-8">
        <textarea
          ref={textareaRef}
          readOnly
          value={json}
          spellCheck={false}
          className="h-64 w-full resize-none rounded-lg border border-line bg-canvas p-3 font-mono text-ui-sm text-ink-muted outline-none"
        />
        {status && (
          <p className={`pt-2 text-ui-sm ${status.error ? "text-danger" : "text-ink-subtle"}`}>
            {status.text}
          </p>
        )}
      </div>
    </Section>
  );
}

/** 卡片里的一行：左边名称 + 说明，右边控件。分隔线靠首行豁免拼出来。 */
const ROW =
  "flex w-full items-center gap-4 border-t border-line py-5 text-left first:border-t-0";

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
  "rounded-md border border-line bg-canvas px-2.5 py-1 text-ui text-ink outline-none focus:border-accent";

const HEX_INPUT =
  "w-[92px] rounded-md border border-line bg-canvas px-2.5 py-1 text-right font-mono text-ui-sm text-ink-muted outline-none focus:border-accent";

const BUTTON =
  "rounded-md border border-line bg-canvas px-2.5 py-1 text-ui-sm text-ink-muted transition-colors hover:bg-sunken hover:text-ink";

/** 数字输入允许先清空再输入，空值不算数。 */
function changeNumber(
  event: React.ChangeEvent<HTMLInputElement>,
  apply: (value: number) => void,
) {
  const value = Number.parseFloat(event.target.value);
  if (Number.isFinite(value)) apply(value);
}
