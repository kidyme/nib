import { useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { ColorSwatch } from "../../settings/ColorPicker";
import {
  GripVerticalIcon,
  PlusIcon,
  TrashIcon,
} from "../../shell/icons";
import {
  DEFAULT_COLUMN_WIDTH,
  LOOP_COLORS,
  MAX_COLUMN_WIDTH,
  MIN_COLUMN_WIDTH,
  createId,
  createInitialLoopData,
  findListByRole,
  normalizeLoopData,
  type LoopData,
  type LoopOption,
} from "./model";
import { exportJsonFile } from "../../shell/exportFile";
import { CONTROL, ICON_BUTTON, Modal, Chip } from "./ui";

export type LoopSettingsTab = "board" | "statuses" | "labels" | "display" | "data";

const TABS: Array<{ id: LoopSettingsTab; label: string }> = [
  { id: "board", label: "看板" },
  { id: "statuses", label: "状态" },
  { id: "labels", label: "标签" },
  { id: "display", label: "显示" },
  { id: "data", label: "数据" },
];

export function LoopSettingsDialog({
  data,
  initialTab,
  onChange,
  onClose,
}: {
  data: LoopData;
  initialTab: LoopSettingsTab;
  onChange: (next: LoopData) => void;
  onClose: () => void;
}) {
  const [tab, setTab] = useState<LoopSettingsTab>(initialTab);

  return (
    <Modal
      title="Loop 设置"
      description="只配置 Loop 自己，不影响 nib 的字体、主题和其他应用。"
      size="xl"
      onClose={onClose}
    >
      <div className="flex min-h-[29.375rem]">
        <aside className="w-[8.625rem] shrink-0 border-r border-line p-2.5">
          {TABS.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setTab(item.id)}
              className={`flex h-8 w-full items-center rounded-lg px-3 text-left text-[0.88em] transition-colors ${
                tab === item.id
                  ? "bg-control font-medium text-ink"
                  : "text-ink-muted hover:bg-control hover:text-ink"
              }`}
            >
              {item.label}
            </button>
          ))}
        </aside>

        <div className="min-w-0 flex-1 overflow-y-auto p-6">
          {tab === "board" && <BoardSettings data={data} onChange={onChange} />}
          {tab === "statuses" && (
            <OptionSettings
              kind="status"
              title="状态"
              description="每张卡片同时只能选择一个状态。文字、颜色和顺序完全自定义。"
              options={data.statuses}
              onChange={(statuses) => onChange(withStatuses(data, statuses))}
            />
          )}
          {tab === "labels" && (
            <OptionSettings
              kind="label"
              title="标签"
              description="每张卡片可以同时选择多个标签，和状态使用完全相同的颜色与文字样式。"
              options={data.labels}
              onChange={(labels) => onChange(withLabels(data, labels))}
            />
          )}
          {tab === "display" && <DisplaySettings data={data} onChange={onChange} />}
          {tab === "data" && <DataSettings data={data} onChange={onChange} />}
        </div>
      </div>
    </Modal>
  );
}

/** 用指针事件排序列表，绕开 WebView 里不可靠的原生 HTML5 拖拽。 */
function useDragReorder(onMove: (from: number, to: number) => void) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const onMoveRef = useRef(onMove);
  const [drag, setDrag] = useState<{ from: number; to: number } | null>(null);
  const dragRef = useRef<{ from: number; to: number } | null>(null);
  onMoveRef.current = onMove;

  const start = (index: number) => (event: ReactPointerEvent) => {
    if (event.button !== 0) return;
    event.preventDefault();
    dragRef.current = { from: index, to: index };
    setDrag(dragRef.current);

    // 拖到新位置时立刻交换，列表跟着指针走；onMoveRef 保证每次都拿到最新列表。
    const track = (moveEvent: PointerEvent) => {
      const container = containerRef.current;
      const current = dragRef.current;
      if (!container || !current) return;
      const row = [...container.querySelectorAll<HTMLElement>("[data-drag-row]")].find((item) => {
        const box = item.getBoundingClientRect();
        return moveEvent.clientY >= box.top && moveEvent.clientY <= box.bottom;
      });
      const to = row ? Number(row.dataset.dragRow) : Number.NaN;
      if (Number.isNaN(to) || to === current.to) return;
      onMoveRef.current(current.from, to);
      dragRef.current = { from: to, to };
      setDrag(dragRef.current);
    };
    const finish = () => {
      window.removeEventListener("pointermove", track);
      window.removeEventListener("pointerup", finish);
      window.removeEventListener("pointercancel", finish);
      dragRef.current = null;
      setDrag(null);
    };
    window.addEventListener("pointermove", track);
    window.addEventListener("pointerup", finish);
    window.addEventListener("pointercancel", finish);
  };

  return { containerRef, drag, start };
}

function withStatuses(data: LoopData, statuses: LoopOption[]): LoopData {
  const ids = new Set(statuses.map((status) => status.id));
  return {
    ...data,
    statuses,
    cards: data.cards.map((card) =>
      card.statusId && !ids.has(card.statusId) ? { ...card, statusId: null } : card,
    ),
  };
}

function withLabels(data: LoopData, labels: LoopOption[]): LoopData {
  const ids = new Set(labels.map((label) => label.id));
  return {
    ...data,
    labels,
    cards: data.cards.map((card) => ({
      ...card,
      labelIds: card.labelIds.filter((id) => ids.has(id)),
    })),
  };
}

function SectionTitle({ title, description }: { title: string; description?: string }) {
  return (
    <header className="pb-5">
      <h3 className="text-[1em] font-semibold text-ink">{title}</h3>
      {description && <p className="mt-1 max-w-xl text-[0.86em] leading-5 text-ink-muted">{description}</p>}
    </header>
  );
}

function BoardSettings({
  data,
  onChange,
}: {
  data: LoopData;
  onChange: (next: LoopData) => void;
}) {
  const [newListName, setNewListName] = useState("");
  const [deleteListId, setDeleteListId] = useState<string | null>(null);
  const listDrag = useDragReorder((from, to) => {
    const lists = [...data.lists];
    const [moved] = lists.splice(from, 1);
    lists.splice(to, 0, moved);
    onChange({ ...data, lists });
  });

  const updateList = (id: string, name: string) =>
    onChange({
      ...data,
      lists: data.lists.map((list) => (list.id === id ? { ...list, name } : list)),
    });

  const removeList = (listId: string) => {
    if (data.lists.length <= 1) return;
    const trash = findListByRole(
      data.lists.filter((list) => list.id !== listId),
      "trash",
    );
    const movedCards = trash ? data.cards.filter((card) => card.listId === listId) : [];
    const trashOrder = trash ? data.cards.filter((card) => card.listId === trash.id).length : 0;
    const movedOrder = new Map(movedCards.map((card, index) => [card.id, trashOrder + index]));
    onChange({
      ...data,
      lists: data.lists.filter((list) => list.id !== listId),
      cards: trash
        ? data.cards.map((card) => {
            const order = movedOrder.get(card.id);
            return order === undefined
              ? card
              : { ...card, listId: trash.id, order };
          })
        : data.cards.filter((card) => card.listId !== listId),
    });
    setDeleteListId(null);
  };

  return (
    <div>
      <SectionTitle title="看板" description="列都保存在 Loop 自己的数据里。" />

      <div className="pb-6">
        <h4 className="pb-2 text-[0.84em] font-medium text-ink-muted">列</h4>
        <div ref={listDrag.containerRef} className="overflow-hidden rounded-xl border border-line bg-raised">
          {data.lists.map((list, index) => (
            <div
              key={list.id}
              data-drag-row={index}
              className={`flex h-12 items-center gap-2 border-b border-line px-3 transition-[background-color,box-shadow,transform] last:border-b-0 ${
                listDrag.drag?.from === index
                  ? "relative z-10 scale-[1.01] bg-surface shadow-lg ring-1 ring-line-strong"
                  : ""
              }`}
            >
              <span
                className="flex cursor-grab touch-none select-none text-ink-subtle active:cursor-grabbing"
                onPointerDown={listDrag.start(index)}
              >
                <GripVerticalIcon className="size-4" />
              </span>
              <input
                value={list.name}
                onChange={(event) => updateList(list.id, event.target.value)}
                className={`${CONTROL} min-w-0 flex-1`}
              />
              {deleteListId === list.id ? (
                <div className="flex items-center gap-1">
                  <span className="text-[0.78em] text-danger">删除？</span>
                  <button
                    type="button"
                    onClick={() => setDeleteListId(null)}
                    className="h-7 rounded-md px-2 text-[0.78em] text-ink-muted hover:bg-control"
                  >
                    取消
                  </button>
                  <button
                    type="button"
                    onClick={() => removeList(list.id)}
                    className="h-7 rounded-md bg-danger px-2 text-[0.78em] font-medium text-white"
                  >
                    删除
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  title="删除列"
                  aria-label="删除列"
                  disabled={data.lists.length <= 1}
                  onClick={() => setDeleteListId(list.id)}
                  className={`${ICON_BUTTON} hover:text-danger disabled:opacity-30`}
                >
                  <TrashIcon className="size-4" />
                </button>
              )}
            </div>
          ))}
        </div>

        <form
          className="flex items-center gap-2 pt-3"
          onSubmit={(event) => {
            event.preventDefault();
            const name = newListName.trim();
            if (!name) return;
            onChange({
              ...data,
              lists: [...data.lists, { id: createId("list"), name }],
            });
            setNewListName("");
          }}
        >
          <input
            value={newListName}
            onChange={(event) => setNewListName(event.target.value)}
            placeholder="新列表名称"
            className={`${CONTROL} min-w-0 flex-1`}
          />
          <button
            type="submit"
            disabled={!newListName.trim()}
            className="flex h-8 items-center gap-1.5 rounded-lg bg-control px-3 text-[0.84em] font-medium text-ink transition-colors hover:bg-control-hover disabled:opacity-40"
          >
            <PlusIcon className="size-3.5" />
            添加列
          </button>
        </form>
      </div>
    </div>
  );
}

function OptionSettings({
  kind,
  title,
  description,
  options,
  onChange,
}: {
  kind: "status" | "label";
  title: string;
  description: string;
  options: LoopOption[];
  onChange: (options: LoopOption[]) => void;
}) {
  const [name, setName] = useState("");
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const optionDrag = useDragReorder((from, to) => {
    const next = [...options];
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    onChange(next);
  });
  const color = LOOP_COLORS[options.length % LOOP_COLORS.length];

  const update = (id: string, patch: Partial<LoopOption>) =>
    onChange(options.map((option) => (option.id === id ? { ...option, ...patch } : option)));

  return (
    <div>
      <SectionTitle title={title} description={description} />
      <div ref={optionDrag.containerRef} className="overflow-hidden rounded-xl border border-line bg-raised">
        {options.length === 0 && (
          <p className="px-4 py-8 text-center text-[0.88em] text-ink-subtle">还没有{title}</p>
        )}
        {options.map((option, index) => (
          <div
            key={option.id}
            data-drag-row={index}
            className={`flex items-center gap-3 border-b border-line px-3 py-2.5 transition-[background-color,box-shadow,transform] last:border-b-0 ${
              optionDrag.drag?.from === index
                ? "relative z-10 scale-[1.01] bg-surface shadow-lg ring-1 ring-line-strong"
                : ""
            }`}
          >
            <span
              className="flex cursor-grab touch-none select-none text-ink-subtle active:cursor-grabbing"
              onPointerDown={optionDrag.start(index)}
            >
              <GripVerticalIcon className="size-4" />
            </span>
            <Chip option={option} className="w-[5.375rem] shrink-0" />
            <input
              value={option.name}
              onChange={(event) => update(option.id, { name: event.target.value })}
              className={`${CONTROL} min-w-0 flex-1`}
            />
            <ColorSwatch
              label={`${kind === "status" ? "状态" : "标签"}颜色`}
              value={option.color}
              onChange={(value) => update(option.id, { color: value })}
            />
            {deleteId === option.id ? (
              <div className="flex shrink-0 items-center gap-1">
                <span className="text-[0.78em] text-danger">删除？</span>
                <button
                  type="button"
                  onClick={() => setDeleteId(null)}
                  className="h-7 rounded-md px-2 text-[0.78em] text-ink-muted hover:bg-control"
                >
                  取消
                </button>
                <button
                  type="button"
                  onClick={() => {
                    onChange(options.filter((item) => item.id !== option.id));
                    setDeleteId(null);
                  }}
                  className="h-7 rounded-md bg-danger px-2 text-[0.78em] font-medium text-white"
                >
                  删除
                </button>
              </div>
            ) : (
              <button
                type="button"
                title={`删除${title}`}
                aria-label={`删除${title}`}
                onClick={() => setDeleteId(option.id)}
                className={`${ICON_BUTTON} hover:text-danger`}
              >
                <TrashIcon className="size-4" />
              </button>
            )}
          </div>
        ))}
      </div>

      <form
        className="flex items-center gap-2 pt-3"
        onSubmit={(event) => {
          event.preventDefault();
          const value = name.trim();
          if (!value) return;
          onChange([
            ...options,
            { id: createId(kind === "status" ? "status" : "label"), name: value, color },
          ]);
          setName("");
        }}
      >
        <input
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder={`新${title}名称`}
          className={`${CONTROL} min-w-0 flex-1`}
        />
        <button
          type="submit"
          disabled={!name.trim()}
          className="flex h-8 items-center gap-1.5 rounded-lg bg-control px-3 text-[0.84em] font-medium text-ink transition-colors hover:bg-control-hover disabled:opacity-40"
        >
          <PlusIcon className="size-3.5" />
          添加{title}
        </button>
      </form>
    </div>
  );
}

function DataSettings({
  data,
  onChange,
}: {
  data: LoopData;
  onChange: (next: LoopData) => void;
}) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [status, setStatus] = useState<{ text: string; error?: boolean } | null>(null);
  const [confirmReset, setConfirmReset] = useState(false);
  const json = JSON.stringify(data, null, 2);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(json);
    } catch {
      textareaRef.current?.select();
      document.execCommand("copy");
    }
    setStatus({ text: "已复制 Loop 数据" });
  };

  const download = async () => {
    try {
      const path = await exportJsonFile("nib-loop.json", json);
      setStatus({ text: path ? "已导出到桌面" : "已导出 nib-loop.json" });
    } catch {
      setStatus({ text: "导出失败", error: true });
    }
  };

  const importFile = async (file: File) => {
    try {
      const next = normalizeLoopData(JSON.parse(await file.text()));
      if (!next) throw new Error("invalid loop data");
      onChange(next);
      setStatus({ text: "已导入 Loop 数据" });
    } catch {
      setStatus({ text: "导入失败：请选择由 Loop 导出的 JSON", error: true });
    } finally {
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  return (
    <div>
      <SectionTitle
        title="数据"
        description="Loop 数据独立保存在 nib:loop，可以单独备份、迁移和重置。"
      />

      <textarea
        ref={textareaRef}
        readOnly
        value={json}
        spellCheck={false}
        rows={14}
        className="w-full resize-y rounded-xl border border-line bg-canvas p-3 font-mono text-[0.76em] leading-5 text-ink outline-none"
      />

      <div className="flex flex-wrap gap-2 pt-3">
        <button
          type="button"
          onClick={() => void copy()}
          className="h-8 rounded-lg bg-control px-3 text-[0.84em] font-medium text-ink transition-colors hover:bg-control-hover"
        >
          复制 JSON
        </button>
        <button
          type="button"
          onClick={() => void download()}
          className="h-8 rounded-lg bg-control px-3 text-[0.84em] font-medium text-ink transition-colors hover:bg-control-hover"
        >
          导出
        </button>
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          className="h-8 rounded-lg bg-control px-3 text-[0.84em] font-medium text-ink transition-colors hover:bg-control-hover"
        >
          导入
        </button>
      </div>

      {status && (
        <p className={`pt-2 text-[0.8em] ${status.error ? "text-danger" : "text-ink-muted"}`}>
          {status.text}
        </p>
      )}

      <div className="mt-6 flex items-center gap-3 border-t border-line pt-5">
        <div className="min-w-0 flex-1">
          <p className="text-[0.86em] font-medium text-ink">恢复默认数据</p>
          <p className="mt-1 text-[0.78em] text-ink-muted">清空卡片、列、状态、标签和显示配置。</p>
        </div>
        {confirmReset ? (
          <div className="flex shrink-0 items-center gap-1">
            <button
              type="button"
              onClick={() => setConfirmReset(false)}
              className="h-8 rounded-lg px-3 text-[0.82em] text-ink-muted hover:bg-control"
            >
              取消
            </button>
            <button
              type="button"
              onClick={() => {
                onChange(createInitialLoopData());
                setConfirmReset(false);
                setStatus({ text: "已恢复默认数据" });
              }}
              className="h-8 rounded-lg bg-danger px-3 text-[0.82em] font-medium text-white"
            >
              确认重置
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setConfirmReset(true)}
            className="h-8 shrink-0 rounded-lg px-3 text-[0.84em] text-danger transition-colors hover:bg-danger-soft"
          >
            重置
          </button>
        )}
      </div>

      <input
        ref={fileRef}
        type="file"
        accept=".json,application/json"
        className="hidden"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) void importFile(file);
        }}
      />
    </div>
  );
}

function DisplaySettings({
  data,
  onChange,
}: {
  data: LoopData;
  onChange: (next: LoopData) => void;
}) {
  const patch = (value: Partial<LoopData["settings"]>) =>
    onChange({ ...data, settings: { ...data.settings, ...value } });

  return (
    <div>
      <SectionTitle title="显示" description="只控制卡片在 Loop 看板里的呈现方式。" />
      <div className="overflow-hidden rounded-xl border border-line bg-raised">
        <DisplayRow
          label="显示状态"
          checked={data.settings.showStatus}
          onChange={(checked) => patch({ showStatus: checked })}
        />
        <DisplayRow
          label="显示标签"
          checked={data.settings.showLabels}
          onChange={(checked) => patch({ showLabels: checked })}
        />
        <DisplayRow
          label="显示附件数量"
          checked={data.settings.showLinks}
          onChange={(checked) => patch({ showLinks: checked })}
        />
      </div>

      <div className="pt-6">
        <div className="flex items-baseline gap-3 pb-2">
          <p className="text-[0.84em] font-medium text-ink-muted">列宽</p>
          <span className="text-[0.8em] text-ink-subtle">{data.settings.columnWidth}px</span>
          {data.settings.columnWidth !== DEFAULT_COLUMN_WIDTH && (
            <button
              type="button"
              onClick={() => patch({ columnWidth: DEFAULT_COLUMN_WIDTH })}
              className="text-[0.8em] text-accent hover:underline"
            >
              恢复默认
            </button>
          )}
        </div>
        <input
          type="range"
          min={MIN_COLUMN_WIDTH}
          max={MAX_COLUMN_WIDTH}
          step={10}
          value={data.settings.columnWidth}
          onChange={(event) => patch({ columnWidth: Number(event.target.value) })}
          aria-label="列宽"
          className="w-full max-w-md accent-[var(--c-accent)]"
        />
        <div className="flex max-w-md justify-between pt-1 text-[0.76em] text-ink-subtle">
          <span>{MIN_COLUMN_WIDTH}px</span>
          <span>{MAX_COLUMN_WIDTH}px</span>
        </div>
      </div>

      <div className="pt-6">
        <p className="pb-2 text-[0.84em] font-medium text-ink-muted">卡片密度</p>
        <div className="inline-flex rounded-lg border border-line bg-raised p-1">
          {(["comfortable", "compact"] as const).map((density) => (
            <button
              key={density}
              type="button"
              onClick={() => patch({ density })}
              className={`h-7 rounded-md px-3 text-[0.82em] transition-colors ${
                data.settings.density === density
                  ? "bg-control font-medium text-ink"
                  : "text-ink-muted hover:text-ink"
              }`}
            >
              {density === "comfortable" ? "舒适" : "紧凑"}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function DisplayRow({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="flex h-12 cursor-pointer items-center gap-3 border-b border-line px-4 last:border-b-0">
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        className="size-4 accent-[var(--c-accent)]"
      />
      <span className="text-[0.9em] text-ink">{label}</span>
    </label>
  );
}
