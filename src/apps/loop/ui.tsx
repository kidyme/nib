import {
  useEffect,
  useId,
  useState,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { CheckIcon, CloseIcon } from "../../shell/icons";
import type { LoopOption } from "./model";

export const ICON_BUTTON =
  "flex size-7 shrink-0 items-center justify-center rounded-lg text-ink-muted transition-colors hover:bg-control hover:text-ink";

export const CONTROL =
  "h-8 rounded-lg border border-line bg-canvas px-2.5 text-[0.86em] text-ink outline-none transition-colors placeholder:text-ink-subtle hover:border-line-strong focus:border-focus";

type ModalSize = "sm" | "md" | "lg" | "xl" | "2xl";

const MODAL_SIZE: Record<ModalSize, string> = {
  sm: "max-w-[26.875rem]",
  md: "max-w-[42.5rem]",
  lg: "max-w-[53.75rem]",
  xl: "max-w-[65rem]",
  "2xl": "max-w-[80rem]",
};

export function Modal({
  title,
  description,
  onClose,
  children,
  footer,
  size = "md",
}: {
  title: string;
  description?: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  size?: ModalSize;
}) {
  const titleId = useId();

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-overlay p-6"
      onPointerDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className={`flex max-h-[min(55rem,calc(100vh-2.5rem))] w-full ${MODAL_SIZE[size]} flex-col overflow-hidden rounded-xl border border-line bg-surface shadow-2xl`}
      >
        <header className="flex shrink-0 items-start gap-4 border-b border-line px-5 py-4">
          <div className="min-w-0 flex-1">
            <h2 id={titleId} className="truncate text-[1.05em] font-semibold text-ink">
              {title}
            </h2>
            {description && <p className="mt-1 text-[0.86em] text-ink-muted">{description}</p>}
          </div>
          <button type="button" className={ICON_BUTTON} aria-label="关闭" onClick={onClose}>
            <CloseIcon className="size-4" />
          </button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>
        {footer && <footer className="shrink-0 border-t border-line px-5 py-3">{footer}</footer>}
      </section>
    </div>,
    document.body,
  );
}

function channel(value: string): number {
  const hex = value.replace("#", "");
  const number = Number.parseInt(hex, 16);
  return Number.isFinite(number) ? (number >> 16) & 255 : 0;
}

function green(value: string): number {
  const hex = value.replace("#", "");
  const number = Number.parseInt(hex, 16);
  return Number.isFinite(number) ? (number >> 8) & 255 : 0;
}

function blue(value: string): number {
  const hex = value.replace("#", "");
  const number = Number.parseInt(hex, 16);
  return Number.isFinite(number) ? number & 255 : 0;
}

/** 彩色 chip 上的文字颜色。状态和标签共用这一条规则，保证视觉完全一致。 */
function readableTextColor(color: string): string {
  const luminance =
    (channel(color) * 299 + green(color) * 587 + blue(color) * 114) / 1000;
  return luminance > 155 ? "#17201d" : "#fffaf0";
}

export function Chip({
  option,
  className = "",
}: {
  option: LoopOption;
  className?: string;
}) {
  return (
    <span
      title={option.name}
      className={`inline-flex h-5 max-w-full items-center rounded-[0.3125rem] px-1.5 text-[0.76em] font-medium leading-none ${className}`}
      style={{ backgroundColor: option.color, color: readableTextColor(option.color) }}
    >
      <span className="truncate">{option.name}</span>
    </span>
  );
}

export function OptionPicker({
  title,
  mode,
  options,
  selectedIds,
  onSelect,
  onClear,
  onManage,
  onClose,
}: {
  title: string;
  mode: "single" | "multiple";
  options: LoopOption[];
  selectedIds: string[];
  onSelect: (id: string) => void;
  onClear?: () => void;
  onManage: () => void;
  onClose: () => void;
}) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [onClose]);

  return createPortal(
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-overlay p-6"
      onPointerDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section
        role="dialog"
        aria-modal="true"
        className="w-full max-w-[21.25rem] overflow-hidden rounded-xl border border-line bg-surface shadow-2xl"
      >
        <header className="flex items-center gap-3 border-b border-line px-4 py-3">
          <h3 className="flex-1 text-[0.98em] font-semibold text-ink">{title}</h3>
          <button type="button" className={ICON_BUTTON} aria-label="关闭" onClick={onClose}>
            <CloseIcon className="size-4" />
          </button>
        </header>

        <div className="max-h-[20rem] overflow-y-auto p-2">
          {options.length === 0 && (
            <p className="px-3 py-8 text-center text-[0.88em] text-ink-subtle">
              还没有可选项
            </p>
          )}
          {options.map((option) => {
            const selected = selectedIds.includes(option.id);
            return (
              <button
                key={option.id}
                type="button"
                onClick={() => {
                  onSelect(option.id);
                  if (mode === "single") onClose();
                }}
                className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left transition-colors hover:bg-control"
              >
                <span
                  className={`flex size-4 shrink-0 items-center justify-center border ${
                    mode === "single" ? "rounded-full" : "rounded-[0.25rem]"
                  } ${
                    selected
                      ? "border-accent bg-accent text-accent-fg"
                      : "border-line-strong bg-canvas"
                  }`}
                >
                  {selected && <CheckIcon className="size-3" />}
                </span>
                <Chip option={option} className="min-w-0 flex-1" />
              </button>
            );
          })}
        </div>

        <footer className="flex items-center gap-2 border-t border-line p-3">
          {onClear && (
            <button
              type="button"
              onClick={onClear}
              className="h-8 rounded-lg px-3 text-[0.86em] text-ink-muted transition-colors hover:bg-control hover:text-ink"
            >
              清除
            </button>
          )}
          <button
            type="button"
            onClick={onManage}
            className="ml-auto h-8 rounded-lg bg-control px-3 text-[0.86em] font-medium text-ink transition-colors hover:bg-control-hover"
          >
            管理{title}
          </button>
        </footer>
      </section>
    </div>,
    document.body,
  );
}

export function TextPromptDialog({
  title,
  description,
  label,
  initialValue = "",
  submitLabel = "保存",
  onSubmit,
  onClose,
}: {
  title: string;
  description?: string;
  label: string;
  initialValue?: string;
  submitLabel?: string;
  onSubmit: (value: string) => void;
  onClose: () => void;
}) {
  const [value, setValue] = useState(initialValue);
  const trimmed = value.trim();

  return (
    <Modal
      title={title}
      description={description}
      size="sm"
      onClose={onClose}
      footer={
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="h-8 rounded-lg px-3 text-[0.86em] text-ink-muted transition-colors hover:bg-control hover:text-ink"
          >
            取消
          </button>
          <button
            type="button"
            disabled={!trimmed}
            onClick={() => {
              if (trimmed) onSubmit(trimmed);
            }}
            className="h-8 rounded-lg bg-button px-3 text-[0.86em] font-medium text-ink-inverse transition-colors hover:bg-button-hover disabled:opacity-40"
          >
            {submitLabel}
          </button>
        </div>
      }
    >
      <div className="p-5">
        <label className="block text-[0.84em] font-medium text-ink-muted">
          <span className="mb-2 block">{label}</span>
          <input
            autoFocus
            value={value}
            onChange={(event) => setValue(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && trimmed) onSubmit(trimmed);
            }}
            className={`${CONTROL} w-full`}
          />
        </label>
      </div>
    </Modal>
  );
}

export function ConfirmDialog({
  title,
  description,
  confirmLabel,
  danger = false,
  onConfirm,
  onClose,
}: {
  title: string;
  description: string;
  confirmLabel: string;
  danger?: boolean;
  onConfirm: () => void;
  onClose: () => void;
}) {
  return (
    <Modal
      title={title}
      size="sm"
      onClose={onClose}
      footer={
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="h-8 rounded-lg px-3 text-[0.86em] text-ink-muted transition-colors hover:bg-control hover:text-ink"
          >
            取消
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className={`h-8 rounded-lg px-3 text-[0.86em] font-medium transition-colors ${
              danger
                ? "bg-danger text-white hover:opacity-90"
                : "bg-button text-ink-inverse hover:bg-button-hover"
            }`}
          >
            {confirmLabel}
          </button>
        </div>
      }
    >
      <p className="px-5 py-5 text-[0.92em] leading-6 text-ink-muted">{description}</p>
    </Modal>
  );
}
