import { useState, type ReactNode } from "react";
import {
  ArchiveIcon,
  ArrowLeftIcon,
  CheckIcon,
  CopyIcon,
  LinkIcon,
  PlusIcon,
  TrashIcon,
} from "../../shell/icons";
import { normalizeExternalUrl, openExternalUrl } from "../../shell/openExternal";
import type { LoopCard, LoopData, LoopLink } from "./model";
import { createId, findListByRole } from "./model";
import type { LoopSettingsTab } from "./LoopSettings";
import {
  Chip,
  ConfirmDialog,
  CONTROL,
  ICON_BUTTON,
  Modal,
  OptionPicker,
} from "./ui";

export function LoopCardDialog({
  data,
  card,
  onPatch,
  onDelete,
  onClose,
  onOpenSettings,
}: {
  data: LoopData;
  card: LoopCard;
  onPatch: (patch: Partial<LoopCard>) => void;
  onDelete: () => void;
  onClose: () => void;
  onOpenSettings: (tab: LoopSettingsTab) => void;
}) {
  const [picker, setPicker] = useState<"status" | "labels" | null>(null);
  const [linkName, setLinkName] = useState("");
  const [linkUrl, setLinkUrl] = useState("");
  const [linkError, setLinkError] = useState("");
  const [copiedLinkId, setCopiedLinkId] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const list = data.lists.find((item) => item.id === card.listId);
  const status = data.statuses.find((item) => item.id === card.statusId);
  const labels = data.labels.filter((item) => card.labelIds.includes(item.id));
  const trash = findListByRole(data.lists, "trash");
  const archive = findListByRole(data.lists, "archive");
  const isTrashed = trash?.id === card.listId;
  const restoreList = data.lists.find(
    (item) => item.id !== trash?.id && item.id !== archive?.id,
  ) ?? data.lists.find((item) => item.id !== trash?.id);

  const copyLink = async (link: LoopLink) => {
    try {
      await navigator.clipboard.writeText(link.url);
      setCopiedLinkId(link.id);
      window.setTimeout(() => {
        setCopiedLinkId((current) => (current === link.id ? null : current));
      }, 1200);
    } catch {
      // 系统剪贴板不可用时保持静默，链接本身仍可正常打开。
    }
  };

  const addLink = () => {
    const url = normalizeExternalUrl(linkUrl);
    if (!url) {
      setLinkError("请输入有效的 http 或 https 链接");
      return;
    }
    let host = url;
    try {
      host = new URL(url).hostname;
    } catch {
      // normalizeExternalUrl 已经校验过，这里只是保持类型完整。
    }
    const link: LoopLink = {
      id: createId("link"),
      name: linkName.trim() || host,
      url,
    };
    onPatch({ links: [...card.links, link] });
    setLinkName("");
    setLinkUrl("");
    setLinkError("");
  };

  return (
    <>
      <Modal
        title={list?.name ?? "卡片"}
        size="2xl"
        onClose={onClose}
        footer={
          <div className="flex items-center gap-2">
            {archive && card.listId !== archive.id && (
              <button
                type="button"
                onClick={() => onPatch({ listId: archive.id })}
                className="flex h-8 items-center gap-1.5 rounded-lg px-3 text-[0.84em] text-ink-muted transition-colors hover:bg-control hover:text-ink"
              >
                <ArchiveIcon className="size-3.5" />
                归档
              </button>
            )}
            {isTrashed && restoreList && (
              <button
                type="button"
                onClick={() => onPatch({ listId: restoreList.id })}
                className="flex h-8 items-center gap-1.5 rounded-lg px-3 text-[0.84em] text-ink-muted transition-colors hover:bg-control hover:text-ink"
              >
                <ArrowLeftIcon className="size-3.5" />
                恢复
              </button>
            )}
            {trash && !isTrashed && (
              <button
                type="button"
                onClick={() => onPatch({ listId: trash.id })}
                className="flex h-8 items-center gap-1.5 rounded-lg px-3 text-[0.84em] text-ink-muted transition-colors hover:bg-danger-soft hover:text-danger"
              >
                <TrashIcon className="size-3.5" />
                移至回收站
              </button>
            )}
            {isTrashed && (
              <button
                type="button"
                onClick={() => setConfirmDelete(true)}
                className="flex h-8 items-center gap-1.5 rounded-lg px-3 text-[0.84em] text-danger transition-colors hover:bg-danger-soft"
              >
                <TrashIcon className="size-3.5" />
                彻底删除
              </button>
            )}
          </div>
        }
      >
        <div className="p-6">
          <div className="space-y-4">
            <Property label="标题">
              <input
                autoFocus
                value={card.title}
                onChange={(event) => onPatch({ title: event.target.value })}
                onBlur={() => {
                  if (!card.title.trim()) onPatch({ title: "未命名" });
                }}
                className={`${CONTROL} w-full`}
                placeholder="卡片标题"
              />
            </Property>

            <Property label="状态">
              <button
                type="button"
                onClick={() => setPicker("status")}
                className="rounded-[0.3125rem] transition-opacity hover:opacity-80"
                title="切换状态"
                aria-label="切换状态"
              >
                {status ? (
                  <Chip option={status} />
                ) : (
                  <span className="flex h-6 items-center rounded-[0.3125rem] bg-control px-2 text-[0.78em] text-ink-subtle">
                    设置状态
                  </span>
                )}
              </button>
            </Property>

            <Property label="标签">
              <div className="flex min-h-8 flex-wrap items-center gap-1.5">
                {labels.map((label) => <Chip key={label.id} option={label} />)}
                <button
                  type="button"
                  onClick={() => setPicker("labels")}
                  className={`${ICON_BUTTON} size-7 ${labels.length ? "" : "bg-control"}`}
                  title="添加标签"
                  aria-label="添加标签"
                >
                  <PlusIcon className="size-3.5" />
                </button>
              </div>
            </Property>

            <Property label="描述">
              <textarea
                rows={5}
                value={card.description}
                onChange={(event) => onPatch({ description: event.target.value })}
                placeholder="补充说明……"
                className={`${CONTROL} min-h-32 w-full resize-y py-2 leading-5`}
              />
            </Property>

            <Property label="记录">
              <div className="space-y-1.5 text-[0.82em]">
                <RecordRow label="创建时间" value={card.createdAt} />
                {card.statusChangedAt && (
                  <RecordRow label="流转时间" value={card.statusChangedAt} />
                )}
                {archive?.id === card.listId && card.archivedAt && (
                  <RecordRow label="归档时间" value={card.archivedAt} />
                )}
                {trash?.id === card.listId && card.deletedAt && (
                  <RecordRow label="删除时间" value={card.deletedAt} />
                )}
              </div>
            </Property>

            <Property label="链接">
              <div className="space-y-2">
                {card.links.map((link) => (
                  <div
                    key={link.id}
                    role="button"
                    tabIndex={0}
                    onClick={() => void openExternalUrl(link.url)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        void openExternalUrl(link.url);
                      }
                    }}
                    className="flex cursor-pointer items-center gap-2 rounded-lg border border-line bg-raised px-2.5 py-2 transition-colors hover:border-line-strong"
                  >
                    <LinkIcon className="size-4 shrink-0 text-ink-subtle" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[0.88em] font-medium text-ink">
                        {link.name}
                      </span>
                      <span className="block truncate text-[0.76em] text-ink-subtle">
                        {link.url}
                      </span>
                    </span>
                    <button
                      type="button"
                      title={copiedLinkId === link.id ? "已复制" : "复制链接"}
                      aria-label={copiedLinkId === link.id ? "已复制" : "复制链接"}
                      onClick={(event) => { event.stopPropagation(); void copyLink(link); }}
                      className={ICON_BUTTON}
                    >
                      {copiedLinkId === link.id ? (
                        <CheckIcon className="size-3.5 text-success" />
                      ) : (
                        <CopyIcon className="size-3.5" />
                      )}
                    </button>
                    <button
                      type="button"
                      title="移除链接"
                      aria-label="移除链接"
                      onClick={(event) => { event.stopPropagation(); onPatch({ links: card.links.filter((item) => item.id !== link.id) }); }}
                      className={`${ICON_BUTTON} hover:text-danger`}
                    >
                      <TrashIcon className="size-3.5" />
                    </button>
                  </div>
                ))}

                <div className="grid grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)_auto] gap-2">
                  <input
                    value={linkName}
                    onChange={(event) => setLinkName(event.target.value)}
                    placeholder="名称（可选）"
                    className={CONTROL}
                  />
                  <input
                    value={linkUrl}
                    onChange={(event) => {
                      setLinkUrl(event.target.value);
                      setLinkError("");
                    }}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") {
                        event.preventDefault();
                        addLink();
                      }
                    }}
                    placeholder="https://…"
                    className={CONTROL}
                  />
                  <button
                    type="button"
                    onClick={addLink}
                    disabled={!linkUrl.trim()}
                    className="flex h-8 items-center gap-1 rounded-lg bg-control px-3 text-[0.82em] font-medium text-ink transition-colors hover:bg-control-hover disabled:opacity-40"
                  >
                    <PlusIcon className="size-3.5" />
                    添加
                  </button>
                </div>
                {linkError && <p className="text-[0.78em] text-danger">{linkError}</p>}
              </div>
            </Property>
          </div>
        </div>
      </Modal>

      {picker === "status" && (
        <OptionPicker
          title="状态"
          mode="single"
          options={data.statuses}
          selectedIds={card.statusId ? [card.statusId] : []}
          onSelect={(id) => onPatch({ statusId: id })}
          onClear={() => onPatch({ statusId: null })}
          onManage={() => {
            setPicker(null);
            onClose();
            onOpenSettings("statuses");
          }}
          onClose={() => setPicker(null)}
        />
      )}

      {picker === "labels" && (
        <OptionPicker
          title="标签"
          mode="multiple"
          options={data.labels}
          selectedIds={card.labelIds}
          onSelect={(id) =>
            onPatch({
              labelIds: card.labelIds.includes(id)
                ? card.labelIds.filter((labelId) => labelId !== id)
                : [...card.labelIds, id],
            })
          }
          onManage={() => {
            setPicker(null);
            onClose();
            onOpenSettings("labels");
          }}
          onClose={() => setPicker(null)}
        />
      )}

      {confirmDelete && (
        <ConfirmDialog
          title="彻底删除卡片？"
          description="这次删除无法撤销。"
          confirmLabel="彻底删除"
          danger
          onClose={() => setConfirmDelete(false)}
          onConfirm={() => {
            setConfirmDelete(false);
            onDelete();
          }}
        />
      )}
    </>
  );
}

function RecordRow({ label, value }: { label: string; value: string }) {
  const time = new Date(value);
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span className="text-ink-muted">{label}</span>
      <span className="text-ink-subtle">
        {time.toLocaleString("zh-CN", { hour12: false })}
      </span>
    </div>
  );
}

function Property({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <section className="grid grid-cols-[5.875rem_minmax(0,1fr)] gap-3">
      <h3 className="pt-1.5 text-[0.84em] font-medium text-ink-muted">{label}</h3>
      <div className="min-w-0">{children}</div>
    </section>
  );
}
