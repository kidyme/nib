import {
  useEffect,
  useId,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { openExternalUrl, normalizeExternalUrl } from "../../shell/openExternal";
import {
  BookIcon,
  ChevronDownIcon,
  MoreHorizontalIcon,
  PencilIcon,
  PlusIcon,
  SearchIcon,
  TrashIcon,
} from "../../shell/icons";
import {
  createId,
  docsInGroup,
  readAtlasData,
  saveAtlasData,
  type AtlasData,
  type AtlasDoc,
  type AtlasGroup,
} from "./model";

type Filter =
  | { kind: "all" }
  | { kind: "favorite" }
  | { kind: "ungrouped" }
  | { kind: "group"; id: string };

type Editor = { mode: "new" } | { mode: "edit"; docId: string };

const NAV_ITEM =
  "flex h-8 w-full items-center gap-2 rounded-lg px-2.5 text-left text-[0.82em] transition-colors";
const NAV_IDLE = "text-ink-muted hover:bg-control hover:text-ink";
const NAV_ACTIVE = "bg-control font-medium text-ink";

export function AtlasApp() {
  const [data, setData] = useState<AtlasData>(readAtlasData);
  const [filter, setFilter] = useState<Filter>({ kind: "all" });
  const [query, setQuery] = useState("");
  const [editor, setEditor] = useState<Editor | null>(null);
  const [editingGroupId, setEditingGroupId] = useState<string | null>(null);

  useEffect(() => {
    saveAtlasData(data);
  }, [data]);

  const editingDoc =
    editor?.mode === "edit" ? data.docs.find((doc) => doc.id === editor.docId) : undefined;
  const editingGroup = data.groups.find((group) => group.id === editingGroupId);

  const addDoc = (doc: Omit<AtlasDoc, "id">) => {
    setData((current) => ({ ...current, docs: [...current.docs, { ...doc, id: createId("doc") }] }));
  };

  const patchDoc = (docId: string, patch: Partial<AtlasDoc>) => {
    setData((current) => ({
      ...current,
      docs: current.docs.map((doc) => (doc.id === docId ? { ...doc, ...patch } : doc)),
    }));
  };

  const deleteDoc = (docId: string) => {
    setData((current) => ({ ...current, docs: current.docs.filter((doc) => doc.id !== docId) }));
    setEditor(null);
  };

  const saveGroup = (name: string, groupId?: string) => {
    setData((current) => groupId
      ? {
          ...current,
          groups: current.groups.map((group) =>
            group.id === groupId ? { ...group, name } : group
          ),
        }
      : {
          ...current,
          groups: [...current.groups, { id: createId("group"), name }],
        });
  };

  const deleteGroup = (groupId: string) => {
    setData((current) => ({
      ...current,
      groups: current.groups.filter((group) => group.id !== groupId),
      docs: current.docs.map((doc) =>
        doc.groupId === groupId ? { ...doc, groupId: null } : doc
      ),
    }));
    setEditingGroupId(null);
    setFilter({ kind: "all" });
  };

  const defaultGroupId = filter.kind === "group" ? filter.id : null;
  const title =
    filter.kind === "all" ? "全部文档"
      : filter.kind === "favorite" ? "收藏"
        : filter.kind === "ungrouped" ? "未分组"
          : editingGroupName(data.groups, filter.id);

  const filtered = filterDocs(data, filter, query);
  const hasAnyDoc = data.docs.length > 0;

  return (
    <div data-font="content" className="flex h-full min-h-0 overflow-hidden">
      <aside className="flex w-[12.5rem] shrink-0 flex-col border-r border-line bg-sunken">
        <nav className="min-h-0 flex-1 overflow-y-auto p-2">
          <NavItem active={filter.kind === "all"} label="全部" count={data.docs.length}
            onClick={() => setFilter({ kind: "all" })} />
          <NavItem active={filter.kind === "favorite"} label="收藏"
            count={data.docs.filter((doc) => doc.favorite).length}
            onClick={() => setFilter({ kind: "favorite" })} />
          <NavItem active={filter.kind === "ungrouped"} label="未分组"
            count={docsInGroup(data.docs, null).length}
            onClick={() => setFilter({ kind: "ungrouped" })} />

          <div className="mt-4 flex h-8 items-center gap-2 px-2.5">
            <span className="min-w-0 flex-1 text-[0.74em] font-semibold text-ink-subtle">分组</span>
            <button
              type="button"
              title="新建分组"
              aria-label="新建分组"
              onClick={() => setEditingGroupId("")}
              className="flex size-6 items-center justify-center rounded-md text-ink-subtle transition-colors hover:bg-control hover:text-ink"
            >
              <PlusIcon className="size-3.5" />
            </button>
          </div>

          {data.groups.map((group) => {
            const active = filter.kind === "group" && filter.id === group.id;
            return (
              <div key={group.id} className="group flex items-center gap-1">
                <div className="min-w-0 flex-1">
                  <NavItem active={active} label={group.name}
                    count={docsInGroup(data.docs, group.id).length}
                    onClick={() => setFilter({ kind: "group", id: group.id })} />
                </div>
                <button
                  type="button"
                  title="管理分组"
                  aria-label={`管理分组 ${group.name}`}
                  onClick={() => setEditingGroupId(group.id)}
                  className="flex size-6 shrink-0 items-center justify-center rounded-md text-ink-subtle opacity-0 transition-opacity hover:bg-control hover:text-ink group-hover:opacity-100"
                >
                  <MoreHorizontalIcon className="size-3.5" />
                </button>
              </div>
            );
          })}
        </nav>
      </aside>

      <section className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-11 shrink-0 items-center gap-3 px-4">
          <div className="flex min-w-0 flex-1 items-baseline gap-2">
            <h1 className="truncate text-[0.86em] font-semibold text-ink">{title}</h1>
            <span className="shrink-0 text-[0.76em] text-ink-subtle">{filtered.length} 篇</span>
          </div>
          <label className="flex h-8 w-[13rem] shrink-0 items-center gap-2 rounded-lg border border-line bg-canvas px-2.5 text-ink-muted transition-colors focus-within:border-focus">
            <SearchIcon className="size-3.5 shrink-0" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="搜索文档"
              className="min-w-0 flex-1 bg-transparent text-[0.82em] text-ink outline-none placeholder:text-ink-subtle"
            />
          </label>
          <button
            type="button"
            onClick={() => setEditor({ mode: "new" })}
            className="flex h-8 shrink-0 items-center gap-1.5 rounded-lg bg-button px-3 text-[0.82em] font-medium text-ink-inverse transition-colors hover:bg-button-hover"
          >
            <PlusIcon className="size-3.5" />
            新建文档
          </button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-5 pt-1">
          {filtered.length > 0 ? (
            <div className="space-y-2">
              {filtered.map((doc) => (
                <DocRow
                  key={doc.id}
                  doc={doc}
                  group={data.groups.find((group) => group.id === doc.groupId)}
                  onToggleFavorite={() => patchDoc(doc.id, { favorite: !doc.favorite })}
                  onEdit={() => setEditor({ mode: "edit", docId: doc.id })}
                />
              ))}
            </div>
          ) : (
            <EmptyState
              showAction={!hasAnyDoc || filter.kind !== "all"}
              actionLabel={hasAnyDoc ? "新建文档" : "收录第一篇文档"}
              hint={query
                ? "没有匹配的文档，换个关键词试试。"
                : filter.kind === "favorite"
                  ? "还没有收藏。点文档左侧的星标就会收在这里。"
                  : "把常看的文档和链接收进来，分组、搜索，点一下用默认浏览器打开。"}
              onAction={() => setEditor({ mode: "new" })}
            />
          )}
        </div>
      </section>

      {(editor?.mode === "new" || editingDoc) && (
        <DocDialog
          doc={editingDoc}
          groups={data.groups}
          defaultGroupId={defaultGroupId}
          onSubmit={(doc) => {
            if (editingDoc) {
              patchDoc(editingDoc.id, doc);
            } else {
              addDoc(doc);
              // 新建后跳到它落下的分组，避免在「收藏」或搜索里刚保存就消失。
              setQuery("");
              setFilter(doc.groupId ? { kind: "group", id: doc.groupId } : { kind: "ungrouped" });
            }
            setEditor(null);
          }}
          onDelete={editingDoc ? () => deleteDoc(editingDoc.id) : undefined}
          onClose={() => setEditor(null)}
        />
      )}

      {editingGroupId !== null && (
        <GroupDialog
          group={editingGroup}
          onSubmit={(name) => {
            saveGroup(name, editingGroup?.id);
            setEditingGroupId(null);
          }}
          onDelete={editingGroup ? () => deleteGroup(editingGroup.id) : undefined}
          onClose={() => setEditingGroupId(null)}
        />
      )}
    </div>
  );
}

function editingGroupName(groups: AtlasGroup[], id: string): string {
  return groups.find((group) => group.id === id)?.name ?? "全部文档";
}

function filterDocs(data: AtlasData, filter: Filter, query: string): AtlasDoc[] {
  const keyword = query.trim().toLowerCase();
  return data.docs.filter((doc) => {
    if (filter.kind === "favorite" && !doc.favorite) return false;
    if (filter.kind === "ungrouped" && doc.groupId !== null) return false;
    if (filter.kind === "group" && doc.groupId !== filter.id) return false;
    if (!keyword) return true;
    return [doc.title, doc.url, doc.note].some((value) => value.toLowerCase().includes(keyword));
  });
}

function NavItem({
  active,
  label,
  count,
  onClick,
}: {
  active: boolean;
  label: string;
  count: number;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      title={label}
      onClick={onClick}
      className={`${NAV_ITEM} ${active ? NAV_ACTIVE : NAV_IDLE}`}
    >
      <span className="min-w-0 flex-1 truncate">{label}</span>
      <span className="shrink-0 text-[0.86em] tabular-nums text-ink-subtle">{count}</span>
    </button>
  );
}

function DocRow({
  doc,
  group,
  onToggleFavorite,
  onEdit,
}: {
  doc: AtlasDoc;
  group?: AtlasGroup;
  onToggleFavorite: () => void;
  onEdit: () => void;
}) {
  const host = hostOf(doc.url);
  const meta = [host, group?.name, doc.note].filter(Boolean).join("  ·  ");

  return (
    <div className="group flex items-center gap-1 rounded-xl border border-line bg-surface px-2 py-1.5 transition-colors hover:border-line-strong">
      <button
        type="button"
        title={doc.favorite ? "取消收藏" : "收藏"}
        aria-label={doc.favorite ? "取消收藏" : "收藏"}
        aria-pressed={doc.favorite}
        onClick={onToggleFavorite}
        className={`flex size-8 shrink-0 items-center justify-center rounded-lg transition-colors ${
          doc.favorite ? "text-warning" : "text-ink-subtle hover:bg-control hover:text-ink"
        }`}
      >
        <StarIcon className="size-4" filled={doc.favorite} />
      </button>

      <button
        type="button"
        title={`在默认浏览器打开 ${doc.url}`}
        onClick={() => { void openExternalUrl(doc.url); }}
        className="min-w-0 flex-1 rounded-lg px-2 py-1.5 text-left transition-colors hover:bg-control"
      >
        <p className="truncate text-[0.88em] font-medium leading-5 text-ink">{doc.title}</p>
        <p className="truncate text-[0.76em] leading-4 text-ink-muted">{meta}</p>
      </button>

      <button
        type="button"
        title="编辑文档"
        aria-label={`编辑 ${doc.title}`}
        onClick={onEdit}
        className="flex size-8 shrink-0 items-center justify-center rounded-lg text-ink-subtle opacity-0 transition-[background-color,opacity] hover:bg-control hover:text-ink group-hover:opacity-100"
      >
        <PencilIcon className="size-3.5" />
      </button>
    </div>
  );
}

function EmptyState({
  showAction,
  actionLabel,
  hint,
  onAction,
}: {
  showAction: boolean;
  actionLabel: string;
  hint: string;
  onAction: () => void;
}) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-4 px-10 pb-10 text-center">
      <div className="flex size-11 items-center justify-center rounded-xl border border-line bg-surface">
        <BookIcon className="size-5 text-ink-subtle" />
      </div>
      <p className="max-w-xs text-[0.9em] leading-6 text-ink-muted">{hint}</p>
      {showAction && (
        <button
          type="button"
          onClick={onAction}
          className="flex h-8 items-center gap-1.5 rounded-lg bg-button px-3 text-[0.82em] font-medium text-ink-inverse transition-colors hover:bg-button-hover"
        >
          <PlusIcon className="size-3.5" />
          {actionLabel}
        </button>
      )}
    </div>
  );
}

function DocDialog({
  doc,
  groups,
  defaultGroupId,
  onSubmit,
  onDelete,
  onClose,
}: {
  doc?: AtlasDoc;
  groups: AtlasGroup[];
  defaultGroupId: string | null;
  onSubmit: (doc: Omit<AtlasDoc, "id">) => void;
  onDelete?: () => void;
  onClose: () => void;
}) {
  const [title, setTitle] = useState(doc?.title ?? "");
  const [url, setUrl] = useState(doc?.url ?? "");
  const [groupId, setGroupId] = useState(doc?.groupId ?? defaultGroupId);
  const [note, setNote] = useState(doc?.note ?? "");
  const [error, setError] = useState("");

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const normalizedUrl = normalizeExternalUrl(url);
    if (!normalizedUrl) {
      setError("请填一个 http(s) 链接。");
      return;
    }
    onSubmit({
      title: title.trim() || hostOf(normalizedUrl),
      url: normalizedUrl,
      groupId,
      note: note.trim(),
      favorite: doc?.favorite ?? false,
    });
  };

  return (
    <Modal title={doc ? "编辑文档" : "新建文档"} onClose={onClose}>
      <form onSubmit={submit} className="p-5">
        <Field label="标题">
          <input
            autoFocus
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder={url ? undefined : "留空的话用网址域名"}
            className={CONTROL}
          />
        </Field>
        <Field label="链接">
          <input
            value={url}
            onChange={(event) => { setUrl(event.target.value); setError(""); }}
            placeholder="https://"
            className={CONTROL}
          />
          {error && <p className="mt-1.5 text-[0.78em] text-danger">{error}</p>}
        </Field>
        <Field label="分组">
          <Select value={groupId ?? ""} onChange={(value) => setGroupId(value || null)}>
            <option value="">未分组</option>
            {groups.map((group) => (
              <option key={group.id} value={group.id}>{group.name}</option>
            ))}
          </Select>
        </Field>
        <Field label="备注">
          <textarea
            value={note}
            onChange={(event) => setNote(event.target.value)}
            rows={3}
            placeholder="为什么收它、看到哪了……"
            className={`${CONTROL} h-auto resize-none py-2 leading-5`}
          />
        </Field>

        <div className="mt-6 flex items-center gap-2">
          {onDelete && (
            <button
              type="button"
              onClick={() => {
                if (window.confirm(`删除「${doc?.title}」？`)) onDelete();
              }}
              className="flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-[0.84em] font-medium text-danger transition-colors hover:bg-danger-soft"
            >
              <TrashIcon className="size-3.5" />
              删除
            </button>
          )}
          <button type="button" onClick={onClose}
            className="ml-auto h-8 rounded-lg px-3 text-[0.84em] text-ink-muted transition-colors hover:bg-control hover:text-ink">
            取消
          </button>
          <button type="submit"
            className="h-8 rounded-lg bg-button px-3.5 text-[0.84em] font-medium text-ink-inverse transition-colors hover:bg-button-hover">
            保存
          </button>
        </div>
      </form>
    </Modal>
  );
}

function GroupDialog({
  group,
  onSubmit,
  onDelete,
  onClose,
}: {
  group?: AtlasGroup;
  onSubmit: (name: string) => void;
  onDelete?: () => void;
  onClose: () => void;
}) {
  const [name, setName] = useState(group?.name ?? "");
  const trimmed = name.trim();

  return (
    <Modal title={group ? "管理分组" : "新建分组"} size="sm" onClose={onClose}>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          if (trimmed) onSubmit(trimmed);
        }}
        className="p-5"
      >
        <Field label="名称">
          <input
            autoFocus
            value={name}
            onChange={(event) => setName(event.target.value)}
            className={CONTROL}
          />
        </Field>
        <div className="mt-6 flex items-center gap-2">
          {onDelete && (
            <button
              type="button"
              onClick={() => {
                if (window.confirm(`删除分组「${group?.name}」？组里的文档会退回未分组。`)) onDelete();
              }}
              className="flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-[0.84em] font-medium text-danger transition-colors hover:bg-danger-soft"
            >
              <TrashIcon className="size-3.5" />
              删除
            </button>
          )}
          <button type="button" onClick={onClose}
            className="ml-auto h-8 rounded-lg px-3 text-[0.84em] text-ink-muted transition-colors hover:bg-control hover:text-ink">
            取消
          </button>
          <button type="submit" disabled={!trimmed}
            className="h-8 rounded-lg bg-button px-3.5 text-[0.84em] font-medium text-ink-inverse transition-colors hover:bg-button-hover disabled:opacity-40">
            保存
          </button>
        </div>
      </form>
    </Modal>
  );
}

const CONTROL =
  "h-8 w-full rounded-lg border border-line bg-canvas px-2.5 text-[0.86em] text-ink outline-none transition-colors placeholder:text-ink-subtle hover:border-line-strong focus:border-focus";

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="mb-4 block text-[0.84em] font-medium text-ink-muted last:mb-0">
      <span className="mb-1.5 block">{label}</span>
      {children}
    </label>
  );
}

/** 自绘下拉：macOS 原生 select 的样式跟主题不搭，箭头也去不掉。 */
function Select({
  value,
  onChange,
  children,
}: {
  value: string;
  onChange: (value: string) => void;
  children: ReactNode;
}) {
  return (
    <span className="relative block">
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className={`${CONTROL} appearance-none pr-8`}
      >
        {children}
      </select>
      <ChevronDownIcon className="pointer-events-none absolute right-2.5 top-1/2 size-3.5 -translate-y-1/2 text-ink-subtle" />
    </span>
  );
}

function Modal({
  title,
  size = "md",
  onClose,
  children,
}: {
  title: string;
  size?: "sm" | "md";
  onClose: () => void;
  children: ReactNode;
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
        className={`w-full ${size === "sm" ? "max-w-[26.875rem]" : "max-w-[34rem]"} overflow-hidden rounded-xl border border-line bg-surface shadow-2xl`}
      >
        <header className="border-b border-line px-5 py-4">
          <h2 id={titleId} className="text-[1.05em] font-semibold text-ink">{title}</h2>
        </header>
        {children}
      </section>
    </div>,
    document.body,
  );
}

function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

function StarIcon({ className, filled }: { className?: string; filled?: boolean }) {
  return (
    <svg
      viewBox="0 0 16 16"
      fill={filled ? "currentColor" : "none"}
      stroke="currentColor"
      strokeWidth="1.4"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <path d="M8 2.1l1.77 3.58 3.95.58-2.86 2.79.68 3.94L8 11.13l-3.54 1.86.68-3.94L2.28 6.26l3.95-.58L8 2.1z" />
    </svg>
  );
}
