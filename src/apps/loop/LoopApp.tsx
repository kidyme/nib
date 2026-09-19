import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import {
  CheckSquareIcon,
  LinkIcon,
  PlusIcon,
  SlidersIcon,
} from "../../shell/icons";
import { openExternalUrl } from "../../shell/openExternal";
import { LoopCardDialog } from "./LoopCardDialog";
import { LoopSettingsDialog, type LoopSettingsTab } from "./LoopSettings";
import {
  cardsInList,
  createId,
  findListByRole,
  moveCard,
  readLoopData,
  saveLoopData,
  type LoopCard,
  type LoopData,
  type LoopList,
} from "./model";
import { Chip, ConfirmDialog, OptionPicker } from "./ui";

type DropTarget = { listId: string; index: number };

type CardDrag = {
  cardId: string;
  pointerId: number;
  startX: number;
  startY: number;
  x: number;
  y: number;
  offsetX: number;
  offsetY: number;
  width: number;
  active: boolean;
};

export function LoopApp() {
  const [data, setData] = useState<LoopData>(readLoopData);
  const [editingCardId, setEditingCardId] = useState<string | null>(null);
  const [statusCardId, setStatusCardId] = useState<string | null>(null);
  const [settingsTab, setSettingsTab] = useState<LoopSettingsTab | null>(null);
  const [draggedCardId, setDraggedCardId] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<DropTarget | null>(null);
  const [cardDrag, setCardDrag] = useState<CardDrag | null>(null);
  const [batchMode, setBatchMode] = useState(false);
  const [selectedCardIds, setSelectedCardIds] = useState<Set<string>>(new Set());
  const [batchConfirm, setBatchConfirm] = useState<null | "archive" | "trash">(null);
  const cardDragRef = useRef<CardDrag | null>(null);
  const dropTargetRef = useRef<DropTarget | null>(null);
  const suppressClickRef = useRef(false);
  const boardRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    saveLoopData(data);
  }, [data]);

  const editingCard = data.cards.find((card) => card.id === editingCardId);
  const statusCard = data.cards.find((card) => card.id === statusCardId);

  const patchCard = (cardId: string, patch: Partial<LoopCard>) => {
    setData((current) => {
      const { listId, ...fields } = patch;
      const currentCard = current.cards.find((card) => card.id === cardId);
      if (currentCard && fields.statusId !== undefined && fields.statusId !== currentCard.statusId) {
        fields.statusChangedAt = new Date().toISOString();
      }
      const next = Object.keys(fields).length
        ? {
            ...current,
            cards: current.cards.map((card) =>
              card.id === cardId ? { ...card, ...fields } : card
            ),
          }
        : current;
      const card = next.cards.find((item) => item.id === cardId);
      if (!listId || !card || card.listId === listId) return next;
      return moveCard(next, cardId, listId, cardsInList(next.cards, listId).length);
    });
  };

  const deleteCard = (cardId: string) => {
    setData((current) => ({
      ...current,
      cards: current.cards.filter((card) => card.id !== cardId),
    }));
    setEditingCardId(null);
  };

  const toggleBatchMode = () => {
    setBatchMode((v) => !v);
    setSelectedCardIds(new Set());
  };

  const toggleCardSelection = (cardId: string) => {
    setSelectedCardIds((prev) => {
      const next = new Set(prev);
      if (next.has(cardId)) next.delete(cardId);
      else next.add(cardId);
      return next;
    });
  };

  const toggleListSelection = (listId: string) => {
    const cardIds = cardsInList(data.cards, listId).map((card) => card.id);
    setSelectedCardIds((prev) => {
      const next = new Set(prev);
      const allSelected = cardIds.length > 0 && cardIds.every((id) => next.has(id));
      cardIds.forEach((id) => (allSelected ? next.delete(id) : next.add(id)));
      return next;
    });
  };

  const batchMoveToList = (targetListId: string) => {
    if (selectedCardIds.size === 0) return;
    setData((current) => current.cards
      .filter((card) => selectedCardIds.has(card.id))
      .reduce((next, card) => moveCard(
        next,
        card.id,
        targetListId,
        cardsInList(next.cards, targetListId).length,
      ), current));
    setSelectedCardIds(new Set());
    setBatchMode(false);
  };

  const batchArchiveOrTrash = (role: "archive" | "trash") => {
    const target = findListByRole(data.lists, role);
    if (!target || selectedCardIds.size === 0) return;
    setData((current) => current.cards
      .filter((card) => selectedCardIds.has(card.id))
      .reduce((next, card) => moveCard(
        next,
        card.id,
        target.id,
        cardsInList(next.cards, target.id).length,
      ), current));
    setSelectedCardIds(new Set());
    setBatchMode(false);
    setBatchConfirm(null);
  };

  const addCard = (listId: string, title: string) => {
    setData((current) => {
      const card: LoopCard = {
        id: createId("card"),
        listId,
        title,
        description: "",
        statusId: null,
        labelIds: [],
        links: [],
        order: cardsInList(current.cards, listId).length,
        createdAt: new Date().toISOString(),
        statusChangedAt: null,
        archivedAt: null,
        deletedAt: null,
      };
      return { ...current, cards: [...current.cards, card] };
    });
  };

  const dropCard = (cardId: string, listId: string, index: number) => {
    setData((current) => moveCard(current, cardId, listId, index));
    setDraggedCardId(null);
    setDropTarget(null);
    dropTargetRef.current = null;
  };

  const updateDropTarget = useCallback((target: DropTarget | null) => {
    const current = dropTargetRef.current;
    if (current?.listId === target?.listId && current?.index === target?.index) return;
    dropTargetRef.current = target;
    setDropTarget(target);
  }, []);

  const dropTargetAt = useCallback((x: number, y: number): DropTarget | null => {
    const element = document.elementFromPoint(x, y);
    const list = element?.closest<HTMLElement>("[data-loop-list-id]");
    const listId = list?.dataset.loopListId;
    if (!list || !listId) return null;

    const cardElements = Array.from(
      list.querySelectorAll<HTMLElement>("[data-loop-card-id]"),
    );
    const index = cardElements.findIndex((card) => {
      const rect = card.getBoundingClientRect();
      return y < rect.top + rect.height / 2;
    });
    return { listId, index: index === -1 ? cardElements.length : index };
  }, []);

  const beginCardDrag = (event: ReactPointerEvent<HTMLElement>, cardId: string) => {
    if (event.button !== 0) return;
    const rect = event.currentTarget.getBoundingClientRect();
    cardDragRef.current = {
      cardId,
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      x: event.clientX,
      y: event.clientY,
      offsetX: event.clientX - rect.left,
      offsetY: event.clientY - rect.top,
      width: rect.width,
      active: false,
    };
  };

  useEffect(() => {
    const finish = (event: globalThis.PointerEvent) => {
      const drag = cardDragRef.current;
      if (!drag || event.pointerId !== drag.pointerId) return;
      if (drag.active) {
        const target = dropTargetRef.current;
        if (target) dropCard(drag.cardId, target.listId, target.index);
        window.setTimeout(() => {
          suppressClickRef.current = false;
        });
      }
      cardDragRef.current = null;
      setCardDrag(null);
      setDraggedCardId(null);
      setDropTarget(null);
      dropTargetRef.current = null;
    };

    const move = (event: globalThis.PointerEvent) => {
      const drag = cardDragRef.current;
      if (!drag || event.pointerId !== drag.pointerId) return;
      const next = { ...drag, x: event.clientX, y: event.clientY };
      if (!drag.active) {
        if (Math.hypot(next.x - drag.startX, next.y - drag.startY) < 5) return;
        next.active = true;
        suppressClickRef.current = true;
        setDraggedCardId(drag.cardId);
      }
      cardDragRef.current = next;
      setCardDrag(next);
      updateDropTarget(dropTargetAt(next.x, next.y));
    };

    const cancel = (event: globalThis.PointerEvent) => {
      const drag = cardDragRef.current;
      if (!drag || event.pointerId !== drag.pointerId) return;
      cardDragRef.current = null;
      setCardDrag(null);
      setDraggedCardId(null);
      setDropTarget(null);
      dropTargetRef.current = null;
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && cardDragRef.current) {
        cardDragRef.current = null;
        setCardDrag(null);
        setDraggedCardId(null);
        setDropTarget(null);
        dropTargetRef.current = null;
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
  }, [dropTargetAt, updateDropTarget]);

  useEffect(() => {
    if (!draggedCardId) return;
    let frame = 0;
    const tick = () => {
      const drag = cardDragRef.current;
      if (!drag?.active) return;
      let moved = false;
      const board = boardRef.current;
      if (board) {
        const rect = board.getBoundingClientRect();
        if (drag.x < rect.left + 36) {
          board.scrollLeft -= 18;
          moved = true;
        } else if (drag.x > rect.right - 36) {
          board.scrollLeft += 18;
          moved = true;
        }
      }
      const scroller = document
        .elementFromPoint(drag.x, drag.y)
        ?.closest<HTMLElement>("[data-loop-card-scroll]");
      if (scroller) {
        const rect = scroller.getBoundingClientRect();
        if (drag.y < rect.top + 32) {
          scroller.scrollTop -= 18;
          moved = true;
        } else if (drag.y > rect.bottom - 32) {
          scroller.scrollTop += 18;
          moved = true;
        }
      }
      if (moved) updateDropTarget(dropTargetAt(drag.x, drag.y));
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [draggedCardId, dropTargetAt, updateDropTarget]);

  return (
    <div data-font="content" className="relative flex h-full min-h-0 flex-col overflow-hidden">
      <header className="flex h-10 shrink-0 items-center justify-between gap-3 px-4">
        <div className="flex min-w-0 items-baseline gap-2">
          <h1 className="truncate text-[0.86em] font-semibold text-ink">看板</h1>
          <span className="shrink-0 text-[0.76em] text-ink-subtle">
            {data.cards.length} 张卡片
          </span>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {batchMode && (
            <>
              <span className="text-[0.78em] text-ink-subtle">
                已选 {selectedCardIds.size} 张
              </span>
              <button
                type="button"
                disabled={selectedCardIds.size === 0}
                onClick={() => setBatchConfirm("archive")}
                className="h-7 rounded-md bg-control px-2.5 text-[0.8em] font-medium text-ink disabled:opacity-40"
              >
                归档
              </button>
              <button
                type="button"
                disabled={selectedCardIds.size === 0}
                onClick={() => setBatchConfirm("trash")}
                className="h-7 rounded-md bg-danger-soft px-2.5 text-[0.8em] font-medium text-danger disabled:opacity-40"
              >
                删除
              </button>
              {data.lists.filter((l) => l.role !== "archive" && l.role !== "trash").map((l) => (
                <button
                  key={l.id}
                  type="button"
                  disabled={selectedCardIds.size === 0}
                  onClick={() => batchMoveToList(l.id)}
                  className="h-7 rounded-md px-2 text-[0.78em] text-ink-muted transition-colors hover:bg-control hover:text-ink disabled:opacity-40"
                >
                  → {l.name}
                </button>
              ))}
            </>
          )}
          <button
            type="button"
            onClick={toggleBatchMode}
            className={`flex h-7 items-center gap-1.5 rounded-md px-2.5 text-[0.8em] font-medium leading-none transition-colors ${
              batchMode
                ? "bg-accent-soft text-accent"
                : "text-ink-muted hover:bg-control hover:text-ink"
            }`}
          >
            <CheckSquareIcon className="size-3.5" />
            {batchMode ? "退出批量" : "批量"}
          </button>
          <button
            type="button"
            onClick={() => setSettingsTab("board")}
            className="flex h-7 items-center gap-1.5 rounded-md px-2.5 text-[0.8em] font-medium leading-none text-ink-muted transition-colors hover:bg-control hover:text-ink"
          >
            <SlidersIcon className="size-3.5 translate-y-px" />
            Loop 设置
          </button>
        </div>
      </header>

      <div ref={boardRef} className="min-h-0 flex-1 overflow-x-auto overflow-y-hidden">
        <div className="flex h-full min-w-max items-start gap-3 px-4 pb-4 pt-2">
          {data.lists.map((list) => (
            <BoardList
              key={list.id}
              list={list}
              cards={cardsInList(data.cards, list.id)}
              columnWidth={data.settings.columnWidth}
              data={data}
              compact={data.settings.density === "compact"}
              draggedCardId={draggedCardId}
              dropTarget={dropTarget}
              onOpenCard={(cardId) => {
                if (suppressClickRef.current) {
                  suppressClickRef.current = false;
                  return;
                }
                setEditingCardId(cardId);
              }}
              onAddCard={(title) => addCard(list.id, title)}
              onCardPointerDown={beginCardDrag}
              onStatusClick={setStatusCardId}
              batchMode={batchMode}
              selectedCardIds={selectedCardIds}
              onToggleSelect={toggleCardSelection}
              onToggleList={() => toggleListSelection(list.id)}
            />
          ))}
        </div>
      </div>

      {cardDrag?.active && (() => {
        const card = data.cards.find((item) => item.id === cardDrag.cardId);
        if (!card) return null;
        return (
          <div
            style={{
              left: cardDrag.x - cardDrag.offsetX,
              top: cardDrag.y - cardDrag.offsetY,
              width: cardDrag.width,
            }}
            className={`pointer-events-none fixed z-[80] rotate-2 rounded-lg border border-line-strong bg-surface opacity-90 shadow-2xl ${
              data.settings.density === "compact" ? "px-2.5 py-2" : "px-3 py-2.5"
            }`}
          >
            <CardContents card={card} data={data} />
          </div>
        );
      })()}

      {statusCard && (
        <OptionPicker
          title="状态"
          mode="single"
          options={data.statuses}
          selectedIds={statusCard.statusId ? [statusCard.statusId] : []}
          onSelect={(id) => patchCard(statusCard.id, { statusId: id })}
          onClear={() => patchCard(statusCard.id, { statusId: null })}
          onManage={() => {
            setStatusCardId(null);
            setSettingsTab("statuses");
          }}
          onClose={() => setStatusCardId(null)}
        />
      )}

      {editingCard && (
        <LoopCardDialog
          data={data}
          card={editingCard}
          onPatch={(patch) => patchCard(editingCard.id, patch)}
          onDelete={() => deleteCard(editingCard.id)}
          onClose={() => setEditingCardId(null)}
          onOpenSettings={(tab) => setSettingsTab(tab)}
        />
      )}

      {batchConfirm && (
        <ConfirmDialog
          title={batchConfirm === "archive" ? "批量归档" : "批量移至回收站"}
          description={`将 ${selectedCardIds.size} 张卡片${batchConfirm === "archive" ? "归档" : "移至回收站"}？`}
          confirmLabel={batchConfirm === "archive" ? "归档" : "移至回收站"}
          danger={batchConfirm === "trash"}
          onClose={() => setBatchConfirm(null)}
          onConfirm={() => batchArchiveOrTrash(batchConfirm)}
        />
      )}

      {settingsTab && (
        <LoopSettingsDialog
          data={data}
          initialTab={settingsTab}
          onChange={setData}
          onClose={() => setSettingsTab(null)}
        />
      )}

    </div>
  );
}

function BoardList({
  list,
  cards,
  columnWidth,
  data,
  compact,
  draggedCardId,
  dropTarget,
  onOpenCard,
  onAddCard,
  onCardPointerDown,
  onStatusClick,
  batchMode,
  selectedCardIds,
  onToggleSelect,
  onToggleList,
}: {
  list: LoopList;
  cards: LoopCard[];
  columnWidth: number;
  data: LoopData;
  compact: boolean;
  draggedCardId: string | null;
  dropTarget: DropTarget | null;
  onOpenCard: (id: string) => void;
  onAddCard: (title: string) => void;
  onCardPointerDown: (event: ReactPointerEvent<HTMLElement>, cardId: string) => void;
  onStatusClick: (cardId: string) => void;
  batchMode: boolean;
  selectedCardIds: Set<string>;
  onToggleSelect: (cardId: string) => void;
  onToggleList: () => void;
}) {
  const dropHere = dropTarget?.listId === list.id;
  const selectedCount = cards.filter((card) => selectedCardIds.has(card.id)).length;
  const columnSelection: "none" | "all" | "partial" =
    cards.length === 0 || selectedCount === 0
      ? "none"
      : selectedCount === cards.length
      ? "all"
      : "partial";

  return (
    <section
      data-loop-list-id={list.id}
      style={{ width: columnWidth }}
      className={`flex max-h-full shrink-0 flex-col overflow-hidden rounded-xl border bg-sunken transition-colors ${
        dropHere ? "border-accent" : "border-line"
      }`}
    >
      <header className="flex h-11 shrink-0 items-center gap-2 px-3">
        {batchMode && (
          <SelectionCircle
            state={columnSelection}
            onClick={onToggleList}
          />
        )}
        <h2 className="min-w-0 flex-1 select-none truncate text-[0.9em] font-semibold text-ink">
          {list.name}
        </h2>
        <span className="text-[0.76em] text-ink-subtle">{cards.length}</span>
      </header>

      <div data-loop-card-scroll className="min-h-0 flex-1 space-y-2 overflow-y-auto px-2 pb-2">
        {cards.map((card, index) => (
          <div key={card.id}>
            {dropHere && dropTarget.index === index && <DropLine />}
            <CardTile
              card={card}
              data={data}
              compact={compact}
              dragging={draggedCardId === card.id}
              selected={batchMode && selectedCardIds.has(card.id)}
              selecting={batchMode}
              onToggle={() => onToggleSelect(card.id)}
              onOpen={() => {
                if (batchMode) onToggleSelect(card.id);
                else onOpenCard(card.id);
              }}
              onPointerDown={(event) => { if (!batchMode) onCardPointerDown(event, card.id); }}
              onStatusClick={batchMode ? undefined : onStatusClick}
            />
          </div>
        ))}
        {dropHere && dropTarget.index >= cards.length && <DropLine />}
      </div>

      <QuickAddCard onAdd={onAddCard} />
    </section>
  );
}

function DropLine() {
  return (
    <div className="mb-2 flex h-1 items-center gap-1 px-1">
      <span className="size-1.5 rounded-full bg-accent" />
      <span className="h-0.5 flex-1 rounded-full bg-accent" />
    </div>
  );
}

function CardTile({
  card,
  data,
  compact,
  dragging,
  selected,
  selecting,
  onToggle,
  onOpen,
  onPointerDown,
  onStatusClick,
}: {
  card: LoopCard;
  data: LoopData;
  compact: boolean;
  dragging: boolean;
  selected: boolean;
  selecting: boolean;
  onToggle: () => void;
  onOpen: () => void;
  onPointerDown: (event: ReactPointerEvent<HTMLElement>) => void;
  onStatusClick?: (cardId: string) => void;
}) {
  return (
    <div
      role="button"
      tabIndex={0}
      draggable={false}
      data-loop-card-id={card.id}
      onClick={onOpen}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onOpen();
        }
      }}
      onPointerDown={onPointerDown}
      className={`w-full touch-none select-none rounded-lg border text-left transition-[border-color,background-color,opacity,box-shadow] ${
        compact ? "px-2.5 py-2" : "px-3 py-2.5"
      } ${
        selected
          ? "border-accent bg-accent-soft shadow-sm"
          : dragging
          ? "cursor-grabbing border-dashed border-line-strong bg-sunken opacity-45 shadow-none"
          : "cursor-pointer border-line bg-surface shadow-sm hover:border-line-strong hover:shadow"
      }`}
    >
      <div className="flex items-start gap-2">
        {selecting && (
          <SelectionCircle
            state={selected ? "all" : "none"}
            onClick={() => {
              onToggle();
            }}
            onPointerDown={(event) => event.stopPropagation()}
          />
        )}
        <div className="min-w-0 flex-1">
          <CardContents
            card={card}
            data={data}
            onStatusClick={onStatusClick}
          />
        </div>
      </div>
    </div>
  );
}

function SelectionCircle({
  state,
  onClick,
  onPointerDown,
}: {
  state: "none" | "all" | "partial";
  onClick: () => void;
  onPointerDown?: (event: ReactPointerEvent<HTMLButtonElement>) => void;
}) {
  return (
    <button
      type="button"
      aria-label={state === "all" ? "取消选择" : "选择"}
      onClick={(event) => {
        event.stopPropagation();
        onClick();
      }}
      onPointerDown={onPointerDown}
      className={`mt-0.5 size-4 shrink-0 rounded-full border transition-colors ${
        state === "none"
          ? "border-line-strong bg-transparent hover:border-accent"
          : state === "partial"
          ? "border-accent bg-accent/50 hover:bg-accent"
          : "border-accent bg-accent hover:bg-accent-active"
      }`}
    />
  );
}

function CardContents({
  card,
  data,
  onStatusClick,
}: {
  card: LoopCard;
  data: LoopData;
  onStatusClick?: (cardId: string) => void;
}) {
  const status = data.statuses.find((item) => item.id === card.statusId);
  const labels = data.labels.filter((item) => card.labelIds.includes(item.id));
  const showStatus = data.settings.showStatus && status;
  const showLabels = data.settings.showLabels && labels.length > 0;
  const showLinks = data.settings.showLinks && card.links.length > 0;

  return (
    <>
      {showLabels && (
        <div className="mb-1.5 flex flex-wrap items-center gap-1">
          {labels.map((label) => (
            <Chip key={label.id} option={label} />
          ))}
        </div>
      )}
      <div className="flex items-start justify-end gap-2">
        <p className="min-w-0 flex-1 break-words text-[0.9em] font-medium leading-5 text-ink">
          {card.title || "未命名"}
        </p>
        {showStatus && (
          <button
            type="button"
            title="流转状态"
            aria-label={`流转状态：${status.name}`}
            onClick={(event) => {
              event.stopPropagation();
              onStatusClick?.(card.id);
            }}
            onPointerDown={(event) => event.stopPropagation()}
            className="flex h-5 max-w-[7.5rem] shrink-0 items-center rounded-[0.3125rem] transition-opacity hover:opacity-80"
          >
            <Chip option={status} />
          </button>
        )}
      </div>
      {card.description && (
        <p className="mt-1 line-clamp-2 break-words text-[0.78em] leading-4 text-ink-muted">
          {card.description}
        </p>
      )}
      {showLinks && (
        <div className="mt-1.5 flex flex-wrap items-center gap-1">
          {card.links.map((link) => (
            <button
              key={link.id}
              type="button"
              title={link.url}
              onClick={(event) => {
                event.stopPropagation();
                openExternalUrl(link.url);
              }}
              onPointerDown={(event) => event.stopPropagation()}
              className="flex h-6 max-w-[12rem] items-center gap-1.5 rounded-md border border-line bg-surface px-2 text-[0.78em] text-ink-muted transition-colors hover:border-line-strong hover:bg-control hover:text-ink"
            >
              <LinkIcon className="size-3.5 shrink-0" />
              <span className="truncate">{link.name}</span>
            </button>
          ))}
        </div>
      )}
    </>
  );
}

function QuickAddCard({ onAdd }: { onAdd: (title: string) => void }) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");

  const submit = () => {
    const value = title.trim();
    if (!value) return;
    onAdd(value);
    setTitle("");
  };

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="m-2 mt-0 flex h-9 shrink-0 items-center gap-2 rounded-lg px-2.5 text-left text-[0.84em] text-ink-muted transition-colors hover:bg-control hover:text-ink"
      >
        <PlusIcon className="size-3.5" />
        添加卡片
      </button>
    );
  }

  return (
    <form
      className="m-2 mt-0 shrink-0 rounded-lg border border-line bg-surface p-2"
      onSubmit={(event) => {
        event.preventDefault();
        submit();
      }}
    >
      <textarea
        autoFocus
        rows={2}
        value={title}
        onChange={(event) => setTitle(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter" && !event.shiftKey) {
            event.preventDefault();
            submit();
          }
          if (event.key === "Escape") {
            setOpen(false);
            setTitle("");
          }
        }}
        placeholder="输入卡片标题…"
        className="w-full resize-none bg-transparent text-[0.88em] leading-5 text-ink outline-none placeholder:text-ink-subtle"
      />
      <div className="flex items-center gap-2 pt-1">
        <button
          type="submit"
          disabled={!title.trim()}
          className="h-7 rounded-md bg-button px-2.5 text-[0.78em] font-medium text-ink-inverse transition-colors hover:bg-button-hover disabled:opacity-40"
        >
          添加
        </button>
        <button
          type="button"
          onClick={() => {
            setOpen(false);
            setTitle("");
          }}
          className="h-7 rounded-md px-2.5 text-[0.78em] text-ink-muted hover:bg-control hover:text-ink"
        >
          取消
        </button>
      </div>
    </form>
  );
}
