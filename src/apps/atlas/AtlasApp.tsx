import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { PencilIcon, SlidersIcon } from "../../shell/icons";
import { normalizeExternalUrl, openExternalUrl } from "../../shell/openExternal";
import { exportJsonFile } from "../../shell/exportFile";
import {
  createId,
  findCategory,
  moveLink,
  normalizeAtlasData,
  readAtlasData,
  saveAtlasData,
  type AtlasCategory,
  type AtlasData,
  type AtlasLink,
  MAX_CARD_WIDTH,
  MIN_CARD_WIDTH,
} from "./model";

/* ---------------------------------------------------------------------------
   共用样式片段
   --------------------------------------------------------------------------- */
const TEXT_BUTTON =
  "inline-flex h-7.5 shrink-0 items-center justify-center rounded-lg px-2 text-ui-sm font-semibold text-ink-subtle transition-colors duration-150 hover:bg-raised hover:text-ink";
const DANGER_BUTTON = `${TEXT_BUTTON} hover:bg-danger-soft hover:text-danger`;
const OUTLINE_BUTTON =
  "flex h-9.5 w-full items-center justify-center rounded-[0.5625rem] border border-dashed border-line/50 bg-surface/20 text-ui-sm font-semibold text-ink-subtle transition-colors duration-150 hover:border-line hover:bg-raised/50 hover:text-ink";
const HEADER_BUTTON =
  "inline-flex h-7 shrink-0 items-center justify-center gap-1.5 rounded-md px-2 text-[0.8em] font-medium leading-none text-ink-muted transition-colors duration-150 hover:bg-control hover:text-ink";
const HEADER_ICON_BUTTON = `${HEADER_BUTTON} w-7 px-0`;
const HEADER_BUTTON_ACTIVE = "bg-accent-soft text-accent hover:bg-accent-soft hover:text-accent";
const FIELD_LABEL = "grid gap-1.5 text-ui-xs font-semibold text-ink-muted";
const FIELD_INPUT =
  "h-9 w-full rounded-lg border border-line bg-sunken px-2.5 text-ui text-ink outline-none transition-colors placeholder:text-ink-subtle focus:border-accent";

/* ---------------------------------------------------------------------------
   拖动：命中探测
   --------------------------------------------------------------------------- */
type DropTarget = {
  categoryId: string;
  /** 插到目标分类的第几个之前；越界由 moveLink 夹住 */
  index: number;
  /** 指针压在"拖到这里"上 */
  tail: boolean;
};

type DropProbe =
  /** 指针就在占位块自己身上：保持当前槽位，别抖 */
  | { kind: "self" }
  /** 落在某个分类的格子里 */
  | { kind: "inside"; target: DropTarget }
  /** 落在所有分类之外：松手就当取消 */
  | { kind: "outside" };

function dropProbeAt(x: number, y: number, linkId: string): DropProbe {
  const hit = document.elementFromPoint(x, y);
  if (!hit) return { kind: "outside" };

  const linkElement = hit.closest<HTMLElement>("[data-atlas-link]");
  if (linkElement) {
    if (linkElement.dataset.atlasLink === linkId) return { kind: "self" };
    const section = linkElement.closest<HTMLElement>("[data-atlas-category]");
    const categoryId = section?.dataset.atlasCategory;
    if (!categoryId) return { kind: "outside" };
    const grid = linkElement.parentElement;
    const siblings = grid
      ? Array.from(grid.children).filter((child) => child.hasAttribute("data-atlas-link"))
      : [];
    const rect = linkElement.getBoundingClientRect();
    const after = x >= rect.left + rect.width / 2;
    return {
      kind: "inside",
      target: {
        categoryId,
        index: Math.max(0, siblings.indexOf(linkElement) + (after ? 1 : 0)),
        tail: false,
      },
    };
  }

  const tailElement = hit.closest<HTMLElement>("[data-atlas-tail]");
  const tailCategoryId = tailElement?.dataset.atlasTail;
  if (tailCategoryId) {
    return {
      kind: "inside",
      target: { categoryId: tailCategoryId, index: Number.MAX_SAFE_INTEGER, tail: true },
    };
  }

  // 分类的标题行、格子的空隙：都算"放到这个分类末尾"
  const section = hit.closest<HTMLElement>("[data-atlas-category]");
  const sectionCategoryId = section?.dataset.atlasCategory;
  if (sectionCategoryId) {
    return {
      kind: "inside",
      target: { categoryId: sectionCategoryId, index: Number.MAX_SAFE_INTEGER, tail: false },
    };
  }

  return { kind: "outside" };
}

/* ---------------------------------------------------------------------------
   拖动：状态
   --------------------------------------------------------------------------- */
type DragState = {
  linkId: string;
  title: string;
  pointerId: number;
  x: number;
  y: number;
  /** 源项的宽度，浮层跟着它 */
  width: number;
  /** 指针真的动过：没动过就当普通点击，什么都不做 */
  moved: boolean;
  /** 最近一次算出来的落点；null = 松手会取消 */
  target: DropTarget | null;
  /** 拖动开始时的整棵树，取消时原样放回去 */
  snapshot: AtlasData;
};

/** 浮层高度 = 行高，用来做贴边翻转 */
const GHOST_HEIGHT = 52;
const GHOST_GAP = 14;

function ghostOffset(drag: DragState) {
  let left = drag.x + GHOST_GAP;
  let top = drag.y + GHOST_GAP;
  if (left + drag.width > window.innerWidth - 8) left = drag.x - drag.width - GHOST_GAP;
  if (top + GHOST_HEIGHT > window.innerHeight - 8) top = drag.y - GHOST_HEIGHT - GHOST_GAP;
  return { left, top };
}

/* ---------------------------------------------------------------------------
   文档弹窗
   --------------------------------------------------------------------------- */
type DocDraft = { mode: "add" } | { mode: "edit"; link: AtlasLink };

function DocDialog({
  draft,
  categoryId,
  onClose,
  onSubmit,
}: {
  draft: DocDraft;
  /** 弹窗从哪个分类的点进来，文档就归哪个分类；换分类去主页面拖。 */
  categoryId: string;
  onClose: () => void;
  /** 返回错误文案表示没通过，返回 null 表示已保存 */
  onSubmit: (values: { title: string; url: string; categoryId: string }) => string | null;
}) {
  const [error, setError] = useState("");

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const message = onSubmit({
      title: String(form.get("title") ?? ""),
      url: String(form.get("url") ?? ""),
      categoryId,
    });
    setError(message ?? "");
  };

  const link = draft.mode === "edit" ? draft.link : null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-overlay p-6"
      onPointerDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <form
        onSubmit={submit}
        className="w-full max-w-[27.5rem] overflow-hidden rounded-xl border border-line bg-surface shadow-2xl"
      >
        <header className="flex h-12 items-center justify-between border-b border-line/60 px-4">
          <h3 className="text-ui font-semibold text-ink">
            {draft.mode === "edit" ? "编辑文档" : "添加文档"}
          </h3>
          <button type="button" className={TEXT_BUTTON} onClick={onClose}>
            关闭
          </button>
        </header>

        <div className="grid gap-3.5 p-4">
          <label className={FIELD_LABEL}>
            标题
            <input
              name="title"
              defaultValue={link?.title ?? ""}
              placeholder="文档标题"
              autoComplete="off"
              autoFocus
              required
              className={FIELD_INPUT}
            />
          </label>
          <label className={FIELD_LABEL}>
            URL
            {/* 用 text 而不是 url：浏览器的 url 校验会挡掉没写协议的输入，
                而这里恰恰要收下 "example.com" 再自己补 https。 */}
            <input
              name="url"
              type="text"
              inputMode="url"
              defaultValue={link?.url ?? ""}
              placeholder="https:// 或直接写域名"
              autoComplete="off"
              required
              className={FIELD_INPUT}
            />
          </label>
          {error && <p className="text-ui-sm text-danger">{error}</p>}
        </div>

        <footer className="flex justify-end gap-2 px-4 pb-4">
          <button type="button" className={TEXT_BUTTON} onClick={onClose}>
            取消
          </button>
          <button
            type="submit"
            className="inline-flex h-7.5 items-center justify-center rounded-lg border border-accent bg-accent px-3.5 text-ui-sm font-semibold text-accent-fg transition-colors hover:bg-accent-hover"
          >
            保存
          </button>
        </footer>
      </form>
    </div>
  );
}

/* ---------------------------------------------------------------------------
   配置页：分类名（就地改名）
   --------------------------------------------------------------------------- */
function CategoryNameInput({
  category,
  focus,
  onRename,
}: {
  category: AtlasCategory;
  focus: boolean;
  onRename: (name: string) => void;
}) {
  const [value, setValue] = useState(category.name);

  useEffect(() => {
    setValue(category.name);
  }, [category.name]);

  const commit = () => {
    const next = value.trim();
    if (!next || next === category.name) {
      setValue(category.name);
      return;
    }
    onRename(next);
  };

  return (
    <input
      value={value}
      autoFocus={focus}
      onFocus={(event) => {
        if (focus) event.currentTarget.select();
      }}
      onChange={(event) => setValue(event.target.value)}
      onBlur={commit}
      onKeyDown={(event) => {
        if (event.key === "Enter") event.currentTarget.blur();
        if (event.key === "Escape") {
          setValue(category.name);
          event.currentTarget.blur();
        }
      }}
      aria-label={`分类名称：${category.name}`}
      className="h-8.5 w-full min-w-0 rounded-lg border border-transparent bg-transparent px-2.5 text-ui font-semibold tracking-[0.03em] text-ink-muted outline-none transition-colors duration-150 hover:border-line/60 hover:bg-surface/50 hover:text-ink focus:border-line/60 focus:bg-surface/50 focus:text-ink"
    />
  );
}

/* ---------------------------------------------------------------------------
   Atlas
   --------------------------------------------------------------------------- */
export function AtlasApp() {
  const [data, setData] = useState<AtlasData>(readAtlasData);
  const [view, setView] = useState<"home" | "settings">("home");
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<{ state: DocDraft; categoryId: string } | null>(null);
  const [focusCategoryId, setFocusCategoryId] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const toastTimer = useRef(0);
  const importRef = useRef<HTMLInputElement>(null);

  // 拖动期间要读最新的一棵树（弹窗、取消、提示文案都要），但不希望它进依赖数组。
  const dataRef = useRef(data);
  useEffect(() => {
    dataRef.current = data;
  }, [data]);

  const [drag, setDrag] = useState<DragState | null>(null);
  const dragRef = useRef<DragState | null>(null);
  const [dropCategoryId, setDropCategoryId] = useState<string | null>(null);
  const [tailCategoryId, setTailCategoryId] = useState<string | null>(null);
  const homeScrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    saveAtlasData(data);
  }, [data]);

  const showToast = useCallback((message: string) => {
    setToast(message);
    window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(null), 2200);
  }, []);

  useEffect(() => () => window.clearTimeout(toastTimer.current), []);

  // 配置页里按 Esc 返回 Atlas；弹窗打开时先让弹窗自己吃掉 Esc。
  useEffect(() => {
    if (view !== "settings" || draft) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setView("home");
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [view, draft]);

  const exportData = async () => {
    try {
      const path = await exportJsonFile("nib-atlas.json", JSON.stringify(data, null, 2));
      showToast(path ? "已导出到桌面" : "已导出 nib-atlas.json");
    } catch {
      showToast("导出失败");
    }
  };

  const importData = async (file: File) => {
    try {
      const next = normalizeAtlasData(JSON.parse(await file.text()));
      if (!next) throw new Error("invalid atlas data");
      setData(next);
      showToast("已导入 Atlas 数据");
    } catch {
      showToast("导入失败：请选择由 Atlas 导出的 JSON");
    } finally {
      if (importRef.current) importRef.current.value = "";
    }
  };

  /* ---------------------------------------------------------------- 拖动 */

  const endDrag = useCallback(
    ({ restore = false, silent = false }: { restore?: boolean; silent?: boolean } = {}) => {
      const current = dragRef.current;
      if (!current) return;
      dragRef.current = null;
      setDrag(null);
      setDropCategoryId(null);
      setTailCategoryId(null);

      if (restore) {
        setData(current.snapshot);
        if (!silent) showToast("已取消移动");
        return;
      }
      const category = current.target
        ? findCategory(dataRef.current, current.target.categoryId)
        : undefined;
      if (category) showToast(`已移动到「${category.name}」`);
    },
    [showToast],
  );

  /** 把指针位置换算成落点：直接改数据，后面的项立刻顺延。 */
  const probeDropPoint = useCallback((x: number, y: number) => {
    const current = dragRef.current;
    if (!current) return;
    const probe = dropProbeAt(x, y, current.linkId);

    if (probe.kind === "self") return;
    if (probe.kind === "outside") {
      dragRef.current = { ...current, target: null };
      setDropCategoryId(null);
      setTailCategoryId(null);
      return;
    }

    const { target } = probe;
    dragRef.current = { ...current, target };
    setData((tree) => moveLink(tree, current.linkId, target.categoryId, target.index));
    setDropCategoryId((prev) => (prev === target.categoryId ? prev : target.categoryId));
    const tailId = target.tail ? target.categoryId : null;
    setTailCategoryId((prev) => (prev === tailId ? prev : tailId));
  }, []);

  /** 拖到上下边缘时自己滚，不然长列表够不着。 */
  const autoScroll = useCallback((clientY: number) => {
    const scroller = homeScrollRef.current;
    if (!scroller) return;
    const rect = scroller.getBoundingClientRect();
    if (clientY < rect.top + 54) scroller.scrollBy({ top: -12 });
    else if (clientY > rect.bottom - 64) scroller.scrollBy({ top: 12 });
  }, []);

  useEffect(() => {
    const move = (event: globalThis.PointerEvent) => {
      const current = dragRef.current;
      if (!current || event.pointerId !== current.pointerId) return;
      event.preventDefault();
      const next: DragState = { ...current, x: event.clientX, y: event.clientY, moved: true };
      dragRef.current = next;
      setDrag(next);
      probeDropPoint(event.clientX, event.clientY);
      autoScroll(event.clientY);
    };

    const finish = (event: globalThis.PointerEvent) => {
      const current = dragRef.current;
      if (!current || event.pointerId !== current.pointerId) return;
      if (!current.moved) {
        endDrag();
        return;
      }
      if (dropProbeAt(event.clientX, event.clientY, current.linkId).kind === "outside") {
        endDrag({ restore: true });
        return;
      }
      endDrag();
    };

    const cancel = (event: globalThis.PointerEvent) => {
      const current = dragRef.current;
      if (!current || event.pointerId !== current.pointerId) return;
      endDrag({ restore: true, silent: true });
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && dragRef.current) {
        event.preventDefault();
        endDrag({ restore: true });
      }
    };

    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", finish);
    window.addEventListener("pointercancel", cancel);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", finish);
      window.removeEventListener("pointercancel", cancel);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [autoScroll, endDrag, probeDropPoint]);

  const startDrag = (
    event: ReactPointerEvent<HTMLButtonElement>,
    link: AtlasLink,
    categoryId: string,
  ) => {
    if (!editing || event.button !== 0 || dragRef.current) return;
    event.preventDefault();
    const rect = event.currentTarget.getBoundingClientRect();
    const next: DragState = {
      linkId: link.id,
      title: link.title,
      pointerId: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      width: rect.width,
      moved: false,
      target: null,
      snapshot: data,
    };
    dragRef.current = next;
    setDrag(next);
    setDropCategoryId(categoryId);
    // 跨分类时源节点会被重建，capture 会丢；window 上的监听是兜底。
    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {
      /* 忽略 */
    }
  };

  /* ------------------------------------------------------- 分类 / 文档的增删改 */

  const addCategory = () => {
    const category: AtlasCategory = { id: createId("category"), name: "新分类", links: [] };
    setData((current) => ({ ...current, categories: [...current.categories, category] }));
    setFocusCategoryId(category.id);
    showToast("已新建分类");
  };

  const renameCategory = (categoryId: string, name: string) => {
    setData((current) => ({
      ...current,
      categories: current.categories.map((category) =>
        category.id === categoryId ? { ...category, name } : category
      ),
    }));
    showToast("分类已更新");
  };

  const deleteCategory = (category: AtlasCategory) => {
    setData((current) => ({
      ...current,
      categories: current.categories.filter((item) => item.id !== category.id),
    }));
    showToast(
      category.links.length > 0
        ? `已删除「${category.name}」及其 ${category.links.length} 个文档`
        : `已删除分类「${category.name}」`,
    );
  };

  const deleteLink = (link: AtlasLink) => {
    setData((current) => ({
      ...current,
      categories: current.categories.map((category) => ({
        ...category,
        links: category.links.filter((item) => item.id !== link.id),
      })),
    }));
    showToast(`已删除「${link.title}」`);
  };

  const saveDraft = (
    values: { title: string; url: string; categoryId: string },
  ): string | null => {
    if (!draft) return null;
    const title = values.title.trim();
    if (!title) return "标题不能为空";
    const url = normalizeExternalUrl(values.url);
    if (!url) return "URL 不合法，请填 http(s) 链接";
    const target = findCategory(dataRef.current, values.categoryId);
    if (!target) return "目标分类不存在";

    if (draft.state.mode === "add") {
      const link: AtlasLink = { id: createId("link"), title, url };
      setData((current) => ({
        ...current,
        categories: current.categories.map((category) =>
          category.id === values.categoryId
            ? { ...category, links: [...category.links, link] }
            : category
        ),
      }));
      showToast(`已添加「${title}」`);
    } else {
      const linkId = draft.state.link.id;
      setData((current) => {
        const patched: AtlasData = {
          ...current,
          categories: current.categories.map((category) => ({
            ...category,
            links: category.links.map((link) =>
              link.id === linkId ? { ...link, title, url } : link
            ),
          })),
        };
        const from = current.categories.find((category) =>
          category.links.some((link) => link.id === linkId)
        );
        if (!from || from.id === values.categoryId) return patched;
        return moveLink(patched, linkId, values.categoryId, Number.MAX_SAFE_INTEGER);
      });
      showToast(`已更新「${title}」`);
    }

    setDraft(null);
    return null;
  };

  /* ---------------------------------------------------------------- 渲染 */

  const toggleEditing = () => {
    if (editing) {
      endDrag({ restore: true, silent: true });
      setEditing(false);
      showToast("排列已保存");
      return;
    }
    setEditing(true);
  };

  const openSettings = () => {
    endDrag({ restore: true, silent: true });
    setEditing(false);
    setView("settings");
  };

  const setCardWidth = (cardWidth: number) => {
    setData((current) => ({
      ...current,
      settings: { ...current.settings, cardWidth },
    }));
  };

  const isEmpty = data.categories.length === 0;

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden bg-canvas">
      {view === "home" ? (
        <>
          <div className="flex h-10 shrink-0 items-center justify-end gap-2 px-4">
            <button
              type="button"
              aria-label={editing ? "完成排列" : "编辑位置"}
              title={editing ? "完成排列" : "编辑位置"}
              aria-pressed={editing}
              onClick={toggleEditing}
              className={`${HEADER_ICON_BUTTON} ${editing ? HEADER_BUTTON_ACTIVE : ""}`}
            >
              <PencilIcon className="size-3.5" />
            </button>
            <button type="button" onClick={openSettings} className={HEADER_BUTTON}>
              <SlidersIcon className="size-3.5 translate-y-px" />
              Atlas 配置
            </button>
          </div>

          <div ref={homeScrollRef} className="min-h-0 flex-1 overflow-y-auto px-4 pt-2 pb-4">
            <div className="w-full">
              {isEmpty && (
                <p className="pt-24 text-center text-ui-sm text-ink-subtle">
                  还没有内容 · 去「Atlas 配置」新建分类和文档
                </p>
              )}

              {data.categories.map((category) => (
                <section
                  key={category.id}
                  data-atlas-category={category.id}
                  className="mt-10 first:mt-0"
                >
                  <div className="mb-4 flex items-center gap-2 px-0.5">
                    <span className="h-px w-4 shrink-0 rounded-full bg-line/80" />
                    <span className="shrink-0 text-ui-sm font-semibold tracking-[0.055em] whitespace-nowrap text-ink-muted">
                      {category.name}
                    </span>
                    <span className="h-px min-w-0 flex-1 rounded-full bg-linear-to-r from-line/80 to-transparent" />
                  </div>

                  <div
                    className={`flex flex-wrap gap-x-2.5 gap-y-3.5 rounded-[0.625rem] transition-colors duration-150 ${
                      dropCategoryId === category.id ? "bg-accent/5" : ""
                    }`}
                  >
                    {category.links.map((link) => {
                      const isDragged = drag?.linkId === link.id;
                      return (
                        <button
                          key={link.id}
                          type="button"
                          style={{ width: `min(${data.settings.cardWidth}px, 100%)` }}
                          data-atlas-link={link.id}
                          aria-label={editing ? link.title : `打开 ${link.title}`}
                          aria-grabbed={isDragged || undefined}
                          onPointerDown={
                            editing
                              ? (event) => startDrag(event, link, category.id)
                              : undefined
                          }
                          onClick={
                            editing ? undefined : () => void openExternalUrl(link.url)
                          }
                          className={[
                            "relative flex h-13 min-w-0 items-center rounded-[0.5625rem] border px-3.5 text-left transition-[background-color,border-color,box-shadow,transform,opacity] duration-75",
                            isDragged
                              ? "border-dashed border-accent/50 bg-accent/[0.07] shadow-[inset_3px_0_0_var(--c-accent),-7px_0_18px_var(--c-accent-soft)]"
                              : editing
                                ? "cursor-grab touch-none select-none border-line/40 bg-surface/30 hover:border-line-strong hover:bg-control-hover active:cursor-grabbing"
                                : "border-transparent hover:border-line-strong hover:bg-control-hover active:translate-y-px",
                          ].join(" ")}
                        >
                          <span
                            className={`block min-w-0 flex-1 truncate text-ui font-medium text-ink transition-opacity duration-150 ${
                              isDragged ? "opacity-20" : ""
                            }`}
                          >
                            {link.title}
                          </span>
                        </button>
                      );
                    })}
                  </div>

                  {/* 编辑模式下的末尾投放区：平时只是一段留白，拖到上面才亮 */}
                  {editing && (
                    <div
                      data-atlas-tail={category.id}
                      className={`mt-2 rounded-[0.5625rem] transition-all duration-150 ${
                        tailCategoryId === category.id
                          ? "min-h-12 border border-accent/50 bg-accent-soft shadow-[inset_3px_0_0_var(--c-accent),-7px_0_18px_var(--c-accent-soft)]"
                          : "min-h-6"
                      }`}
                    />
                  )}
                </section>
              ))}
            </div>
          </div>
        </>
      ) : (
        <div className="min-h-0 flex-1 overflow-y-auto">
          <div className="mx-auto w-full max-w-[66rem] px-4 pt-2 pb-4">
            <header className="mb-8 flex items-start justify-between gap-5">
              <div>
                <h2 className="text-ui-xl font-semibold text-ink">Atlas 配置</h2>
                <p className="mt-1 text-ui-sm text-ink-subtle">
                  这里只维护分类和文档；排序与跨分类移动请在主页面完成。
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <button type="button" className={HEADER_BUTTON} onClick={() => void exportData()}>
                  导出
                </button>
                <button
                  type="button"
                  className={HEADER_BUTTON}
                  onClick={() => importRef.current?.click()}
                >
                  导入
                </button>
                <input
                  ref={importRef}
                  type="file"
                  accept=".json,application/json"
                  className="hidden"
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    event.target.value = "";
                    if (file) void importData(file);
                  }}
                />
                <button type="button" onClick={() => setView("home")} className={HEADER_BUTTON}>
                  返回 Atlas
                </button>
              </div>
            </header>

            <div className="mb-8.5 flex items-center justify-between rounded-xl border border-line/60 bg-surface/60 px-3.5 py-3">
              <span className="text-ui-sm font-semibold text-ink">卡片宽度</span>
              <div className="flex items-center gap-2.5">
                <input
                  type="range"
                  min={MIN_CARD_WIDTH / 16}
                  max={MAX_CARD_WIDTH / 16}
                  step={0.25}
                  value={data.settings.cardWidth / 16}
                  onChange={(event) => setCardWidth(Number(event.target.value) * 16)}
                  className="w-40 accent-accent"
                  aria-label="卡片宽度"
                />
                <span className="w-16 text-right font-mono text-ui-xs text-ink-muted">
                  {(data.settings.cardWidth / 16).toFixed(2).replace(/\.?0+$/, "")}rem
                </span>
              </div>
            </div>

            {data.categories.map((category) => (
              <section key={category.id} className="mt-8.5 first:mt-0">
                <div className="mb-2.5 grid grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-2">
                  <CategoryNameInput
                    category={category}
                    focus={focusCategoryId === category.id}
                    onRename={(name) => renameCategory(category.id, name)}
                  />
                  <span className="text-ui-xs whitespace-nowrap text-ink-subtle">
                    {category.links.length} 个文档
                  </span>
                  <button
                    type="button"
                    className={DANGER_BUTTON}
                    onClick={() => deleteCategory(category)}
                  >
                    删除
                  </button>
                </div>

                <div className="grid gap-2">
                  {category.links.map((link) => (
                    <div
                      key={link.id}
                      className="grid min-h-15 grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-1 rounded-[0.5625rem] border border-line/60 bg-surface/60 py-1.5 pr-1.5 pl-3 transition-colors duration-150 hover:border-line hover:bg-surface"
                    >
                      <div className="grid min-w-0 gap-0.5 py-0.5">
                        <span className="truncate text-ui font-medium text-ink">
                          {link.title}
                        </span>
                        <span className="truncate font-mono text-ui-xs text-ink-subtle">
                          {link.url}
                        </span>
                      </div>
                      <button
                        type="button"
                        className={TEXT_BUTTON}
                        onClick={() =>
                          setDraft({
                            state: { mode: "edit", link },
                            categoryId: category.id,
                          })
                        }
                      >
                        编辑
                      </button>
                      <button
                        type="button"
                        className={DANGER_BUTTON}
                        onClick={() => deleteLink(link)}
                      >
                        删除
                      </button>
                    </div>
                  ))}
                </div>

                <button
                  type="button"
                  className={`${OUTLINE_BUTTON} mt-2.5`}
                  onClick={() =>
                    setDraft({ state: { mode: "add" }, categoryId: category.id })
                  }
                >
                  添加文档
                </button>
              </section>
            ))}

            {isEmpty && (
              <p className="text-ui-sm text-ink-subtle">
                还没有分类，先建一个——分类里再添加文档。
              </p>
            )}

            <button type="button" className={`${OUTLINE_BUTTON} mt-9.5 h-11`} onClick={addCategory}>
              新建分类
            </button>
          </div>
        </div>
      )}

      {drag && (
        <div
          style={{
            ...ghostOffset(drag),
            width: drag.width,
          }}
          className="pointer-events-none fixed z-50 flex h-13 items-center justify-between gap-3 rounded-[0.625rem] border border-accent bg-raised px-3.5 opacity-[0.97] shadow-[0_20px_50px_rgba(0,0,0,0.46)]"
        >
          <span className="min-w-0 flex-1 truncate text-ui font-medium text-ink">
            {drag.title}
          </span>
          <span className="shrink-0 text-ui-xs font-bold tracking-[0.06em] text-accent">
            移动中
          </span>
        </div>
      )}

      {drag && (
        <div className="pointer-events-none fixed bottom-6 left-1/2 z-40 inline-flex h-8.5 -translate-x-1/2 items-center rounded-full border border-accent/30 bg-sunken/95 px-3.5 text-ui-xs font-semibold whitespace-nowrap text-ink-muted shadow-[0_14px_34px_rgba(0,0,0,0.35)]">
          正在移动「{drag.title}」 · 松开放置
        </div>
      )}

      {toast && (
        <div
          role="status"
          aria-live="polite"
          className="pointer-events-none fixed bottom-6 left-1/2 z-[60] inline-flex h-8.5 -translate-x-1/2 items-center rounded-full border border-line bg-sunken/95 px-3.5 text-ui-xs font-semibold whitespace-nowrap text-ink shadow-[0_14px_34px_rgba(0,0,0,0.35)]"
        >
          {toast}
        </div>
      )}

      {draft && (
        <DocDialog
          draft={draft.state}
          categoryId={draft.categoryId}
          onClose={() => setDraft(null)}
          onSubmit={saveDraft}
        />
      )}
    </div>
  );
}
