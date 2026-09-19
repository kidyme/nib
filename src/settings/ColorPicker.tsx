/**
 * 颜色选择器。
 *
 * 原生 <input type="color"> 在 macOS 上只会弹出系统那个小色盘，看着很业余，
 * 所以这里色块点开自己弹一个面板：明度/饱和度选择区 + 色相滑条 + 常用色 + HEX/RGB 输入。
 * 画盘用 react-colorful（零依赖、2.8kB），外面这层壳和样式跟着主题走，
 * 免得现成组件的样式跟应用的配色打架。
 */
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { HexColorPicker } from "react-colorful";

const HEX = /^#[0-9a-f]{6}$/i;

/** 常用色：上面一排中性底色（挑背景/分割线用），下面一排强调色。 */
const SWATCHES = [
  "#1e2326",
  "#232a2e",
  "#272e33",
  "#2d353b",
  "#343f44",
  "#3d484d",
  "#a7c080",
  "#7fbbb3",
  "#d699b6",
  "#e69875",
  "#dbbc7f",
  "#e67e80",
];

const PANEL_WIDTH = 248;
/** 面板跟触发它的那行之间留的缝。 */
const GAP = 8;
/** 面板跟窗口边缘之间至少留这么多。 */
const MARGIN = 12;

const FIELD =
  "h-[1.875rem] rounded-lg border border-line bg-canvas px-2.5 font-mono text-ui-sm text-ink outline-none transition-colors hover:border-line-strong focus:border-focus";

type Placement = {
  top?: number;
  bottom?: number;
  right: number;
  maxHeight: number;
};

/** 色块本身：点开的是面板，不再是系统色盘。 */
export function ColorSwatch({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState<Placement>();
  // 先把面板量一遍真实高度，再决定贴哪边；量的时候是隐藏的
  const [measuring, setMeasuring] = useState(false);
  const [hex, setHex] = useState(value);

  // 换预设、导入 JSON 之后要把面板里没提交的草稿冲掉
  const [lastValue, setLastValue] = useState(value);
  if (lastValue !== value) {
    setLastValue(value);
    setHex(value);
  }

  const open = Boolean(box);

  const close = () => {
    setBox(undefined);
    setMeasuring(false);
  };

  /**
   * 按「那一行现在在哪」把面板摆好：量真实高度，决定往下弹还是往上翻，
   * 上下都塞不下才居中占满窗口。面板已经挂着 maxHeight，所以量的时候要拿
   * scrollHeight 还原成没被压扁的高度，否则滚动过一次之后就再也展不开了。
   */
  const place = () => {
    const trigger = triggerRef.current;
    const panel = panelRef.current;
    if (!trigger || !panel) return;

    const height = panel.scrollHeight + (panel.offsetHeight - panel.clientHeight);
    // 贴着整行右边缘展开，像下拉一样；行本身拿不到就退回贴着色块
    const anchor = trigger.parentElement?.getBoundingClientRect() ?? trigger.getBoundingClientRect();
    const right = Math.max(MARGIN, window.innerWidth - anchor.right);
    const below = window.innerHeight - anchor.bottom - GAP - MARGIN;
    const above = anchor.top - GAP - MARGIN;

    let top: number;
    let maxHeight = height;
    if (below >= height) {
      // 行下面放得下就往下弹
      top = anchor.bottom + GAP;
    } else if (above >= height) {
      // 放不下就翻到上面去
      top = anchor.top - GAP - height;
    } else {
      // 上下都塞不下（窗口矮、行又在中间）就贴着这行居中，把窗口里能用的高度全占掉，
      // 只有窗口本身真的装不下时才退化成滚动。
      maxHeight = Math.min(height, window.innerHeight - MARGIN * 2);
      const center = (anchor.top + anchor.bottom) / 2;
      top = center - maxHeight / 2;
    }

    // 滚动的时候行可能会滑出窗口，把面板夹在窗口里，别跟着跑丢
    const floor = Math.max(MARGIN, window.innerHeight - MARGIN - maxHeight);
    setBox({ top: Math.min(Math.max(top, MARGIN), floor), right, maxHeight });
  };

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (triggerRef.current?.contains(target) || panelRef.current?.contains(target)) return;
      close();
    };
    // 面板是固定定位的，底下的列表滚走了它就得跟着那一行走，不能原地不动，
    // 更不能一滚就关掉——只有点到别处或者按 Esc 才收。
    let frame = 0;
    const onScroll = (event: Event) => {
      // 面板自己内部滚动不算
      if (event.target instanceof Node && panelRef.current?.contains(event.target)) return;
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        place();
      });
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
      cancelAnimationFrame(frame);
    };
  }, [open]);

  useLayoutEffect(() => {
    if (!measuring) return;
    if (!triggerRef.current || !panelRef.current) return setMeasuring(false);
    place();
    setMeasuring(false);
  }, [measuring]);

  const toggle = () => {
    if (box || measuring) return close();
    setMeasuring(true);
  };

  const commitHex = () => {
    if (HEX.test(hex.trim())) onChange(hex.trim().toLowerCase());
    else setHex(value);
  };

  const rgb = hexToRgb(value);

  const setChannel = (key: "r" | "g" | "b") => (raw: string) => {
    const channel = Math.round(Number.parseFloat(raw));
    if (!Number.isFinite(channel)) return;
    const next = { ...rgb, [key]: Math.min(255, Math.max(0, channel)) };
    onChange(rgbToHex(next.r, next.g, next.b));
  };

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={toggle}
        aria-label={`${label} 调色板`}
        aria-expanded={Boolean(box)}
        className="color-swatch size-5 shrink-0"
        style={{ backgroundColor: value }}
      />

      {(box || measuring) &&
        createPortal(
          <div
            ref={panelRef}
            role="dialog"
            data-nib-overlay
            aria-label={`${label} 调色板`}
            className="color-panel fixed z-50 flex flex-col gap-3 overflow-y-auto rounded-xl border border-line-strong bg-raised p-3 shadow-xl"
            style={
              box
                ? { ...box, width: PANEL_WIDTH }
                : { top: 0, right: MARGIN, width: PANEL_WIDTH, visibility: "hidden" }
            }
          >
            <HexColorPicker color={value} onChange={onChange} />

            <div className="grid grid-cols-6 gap-1.5">
              {SWATCHES.map((color) => (
                <button
                  key={color}
                  type="button"
                  aria-label={color}
                  title={color}
                  onClick={() => onChange(color)}
                  className="color-swatch h-6 w-full"
                  style={{ backgroundColor: color }}
                />
              ))}
            </div>

            <label className="flex items-center gap-2 text-ui-sm text-ink-subtle">
              <span className="w-8 shrink-0">HEX</span>
              <input
                value={hex}
                spellCheck={false}
                aria-label="十六进制色值"
                onChange={(event) => setHex(event.target.value)}
                onBlur={commitHex}
                onKeyDown={(event) => {
                  if (event.key === "Enter") commitHex();
                  if (event.key === "Escape") {
                    setHex(value);
                    close();
                  }
                }}
                className={`${FIELD} min-w-0 flex-1 text-ink-muted`}
              />
            </label>

            <div className="flex gap-2">
              {(["r", "g", "b"] as const).map((key) => (
                <label key={key} className="flex min-w-0 flex-1 flex-col gap-1 text-ui-sm text-ink-subtle">
                  <span className="uppercase">{key}</span>
                  <input
                    value={rgb[key]}
                    inputMode="numeric"
                    aria-label={`${key.toUpperCase()} 通道`}
                    onChange={(event) => setChannel(key)(event.target.value)}
                    className={`${FIELD} w-full text-center text-ink-muted`}
                  />
                </label>
              ))}
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const value = Number.parseInt(HEX.test(hex) ? hex.slice(1) : "000000", 16);
  return { r: (value >> 16) & 255, g: (value >> 8) & 255, b: value & 255 };
}

function rgbToHex(r: number, g: number, b: number): string {
  const hex = (channel: number) => channel.toString(16).padStart(2, "0");
  return `#${hex(r)}${hex(g)}${hex(b)}`;
}
