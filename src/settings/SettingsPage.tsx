import { useRef, useState, type ReactNode } from "react";
import {
  FONT_FAMILIES,
  FONT_WEIGHTS,
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
import { CheckIcon } from "../shell/icons";

type SettingsPageProps = {
  theme: ThemeState;
  fonts: FontSettings;
  onSelectPreset: (id: ThemeId) => void;
  onChangeColors: (colors: ThemeColors) => void;
  onChangeFont: (role: FontRole, patch: Partial<FontSetting>) => void;
  onImport: (next: { theme: ThemeState; fonts: FontSettings }) => void;
};

const COLOR_GROUPS = [...new Set(COLOR_TOKENS.map((token) => token.group))];

export function SettingsPage({
  theme,
  fonts,
  onSelectPreset,
  onChangeColors,
  onChangeFont,
  onImport,
}: SettingsPageProps) {
  return (
    <div className="mx-auto max-w-[720px] space-y-8 px-8 py-7">
      <FontSection
        title="内容字体"
        hint="TODO、文档正文这些你自己读的内容"
        value={fonts.content}
        withLeading
        onChange={(patch) => onChangeFont("content", patch)}
      />
      <FontSection
        title="系统字体"
        hint="侧边栏、标题栏、设置界面这些外壳"
        value={fonts.ui}
        onChange={(patch) => onChangeFont("ui", patch)}
      />
      <ColorSection
        theme={theme}
        onSelectPreset={onSelectPreset}
        onChangeColors={onChangeColors}
      />
      <ConfigSection theme={theme} fonts={fonts} onImport={onImport} />

      <datalist id="nib-font-families">
        {FONT_FAMILIES.map((family) => (
          <option key={family} value={family} />
        ))}
      </datalist>
    </div>
  );
}

function Section({
  title,
  hint,
  action,
  children,
}: {
  title: string;
  hint?: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="space-y-3">
      <div className="flex items-end justify-between gap-4">
        <div className="space-y-0.5">
          <h2 className="text-ui-lg font-medium text-ink">{title}</h2>
          {hint && <p className="text-ui-sm text-ink-subtle">{hint}</p>}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

function FontSection({
  title,
  hint,
  value,
  withLeading,
  onChange,
}: {
  title: string;
  hint: string;
  value: FontSetting;
  withLeading?: boolean;
  onChange: (patch: Partial<FontSetting>) => void;
}) {
  const columns = withLeading
    ? "grid-cols-[minmax(0,1fr)_84px_104px_84px]"
    : "grid-cols-[minmax(0,1fr)_84px_104px]";

  return (
    <Section title={title} hint={hint}>
      <div className={`grid gap-3 rounded-lg border border-line bg-surface p-3.5 ${columns}`}>
        <Field label="字体">
          <input
            list="nib-font-families"
            value={value.family}
            spellCheck={false}
            onChange={(event) => onChange({ family: event.target.value })}
            className={INPUT}
          />
        </Field>

        <Field label="字号">
          <input
            type="number"
            min={9}
            max={32}
            step={1}
            value={value.size}
            onChange={(event) => changeNumber(event, (size) => onChange({ size }))}
            className={INPUT}
          />
        </Field>

        <Field label="字重">
          <select
            value={value.weight}
            onChange={(event) => onChange({ weight: Number(event.target.value) })}
            className={INPUT}
          >
            {FONT_WEIGHTS.map((weight) => (
              <option key={weight.value} value={weight.value}>
                {weight.label} {weight.value}
              </option>
            ))}
          </select>
        </Field>

        {withLeading && (
          <Field label="行高">
            <input
              type="number"
              min={1}
              max={3}
              step={0.05}
              value={value.leading}
              onChange={(event) => changeNumber(event, (leading) => onChange({ leading }))}
              className={INPUT}
            />
          </Field>
        )}
      </div>
    </Section>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="space-y-1">
      <span className="block text-ui-sm text-ink-subtle">{label}</span>
      {children}
    </label>
  );
}

function ColorSection({
  theme,
  onSelectPreset,
  onChangeColors,
}: {
  theme: ThemeState;
  onSelectPreset: (id: ThemeId) => void;
  onChangeColors: (colors: ThemeColors) => void;
}) {
  return (
    <Section
      title="配色"
      hint="预设提供基础，逐项改过就是你自己的一套"
      action={
        <button
          type="button"
          onClick={() => onSelectPreset(theme.base)}
          className={BUTTON}
        >
          恢复预设
        </button>
      }
    >
      <div className="overflow-hidden rounded-lg border border-line">
        {THEMES.map((preset, index) => {
          const active = preset.id === theme.base;
          return (
            <button
              key={preset.id}
              type="button"
              onClick={() => onSelectPreset(preset.id)}
              className={[
                "flex w-full items-center gap-3 px-3 py-2.5 text-left text-ui transition-colors",
                index > 0 ? "border-t border-line" : "",
                active ? "bg-accent-soft text-accent" : "text-ink hover:bg-sunken",
              ]
                .filter(Boolean)
                .join(" ")}
            >
              <span
                data-theme={preset.id}
                className="flex h-5 w-8 shrink-0 overflow-hidden rounded-[5px] ring-1 ring-line"
              >
                <span className="flex-1 bg-surface" />
                <span className="flex-1 bg-canvas" />
                <span className="w-2.5 bg-accent" />
              </span>
              <span className="flex-1 truncate">{preset.label}</span>
              {active && <CheckIcon className="size-4 shrink-0" />}
            </button>
          );
        })}
      </div>

      <div className="space-y-3 pt-1">
        {COLOR_GROUPS.map((group) => (
          <div key={group} className="space-y-1.5">
            <h3 className="text-ui-sm text-ink-subtle">{group}</h3>
            <div className="grid grid-cols-2 gap-1.5">
              {COLOR_TOKENS.filter((token) => token.group === group).map((token) => (
                <ColorRow
                  key={token.id}
                  label={token.label}
                  value={theme.colors[token.id]}
                  onChange={(value) => onChangeColors({ ...theme.colors, [token.id]: value })}
                />
              ))}
            </div>
          </div>
        ))}
      </div>
    </Section>
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
    <div className="flex items-center gap-2 rounded-md border border-line bg-surface px-2 py-1.5">
      <input
        type="color"
        value={value}
        aria-label={`${label} 色值`}
        onChange={(event) => onChange(event.target.value)}
        className="color-input size-5 shrink-0"
      />
      <span className="min-w-0 flex-1 truncate text-ui-sm text-ink-muted">{label}</span>
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
        className="w-[70px] shrink-0 bg-transparent text-right font-mono text-ui-xs text-ink-subtle outline-none"
      />
    </div>
  );
}

function ConfigSection({
  theme,
  fonts,
  onImport,
}: {
  theme: ThemeState;
  fonts: FontSettings;
  onImport: (next: { theme: ThemeState; fonts: FontSettings }) => void;
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
    <Section title="配置" hint="整份配置就是一个 JSON，配色和字体都在里面">
      <textarea
        ref={textareaRef}
        readOnly
        value={json}
        spellCheck={false}
        className="h-48 w-full resize-none rounded-lg border border-line bg-sunken p-3 font-mono text-ui-xs text-ink-muted outline-none"
      />
      <div className="flex items-center gap-2">
        <button type="button" onClick={copy} className={BUTTON}>
          复制
        </button>
        <button type="button" onClick={download} className={BUTTON}>
          导出 JSON
        </button>
        <label className={BUTTON}>
          导入 JSON
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
        {status && (
          <span className={`text-ui-sm ${status.error ? "text-danger" : "text-ink-subtle"}`}>
            {status.text}
          </span>
        )}
      </div>
    </Section>
  );
}

const INPUT =
  "w-full rounded-md border border-line bg-canvas px-2.5 py-1.5 text-ui text-ink outline-none focus:border-accent";

const BUTTON =
  "cursor-pointer rounded-md border border-line bg-surface px-2.5 py-1.5 text-ui-sm text-ink-muted transition-colors hover:bg-sunken hover:text-ink";

/** 数字输入允许先清空再输入，空值不算数。 */
function changeNumber(
  event: React.ChangeEvent<HTMLInputElement>,
  apply: (value: number) => void,
) {
  const value = Number.parseFloat(event.target.value);
  if (Number.isFinite(value)) apply(value);
}
