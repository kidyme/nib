/**
 * Loop 的本地数据模型。
 *
 * 列、状态、标签、卡片和 Loop 自己的显示配置都只存在这一棵树里，不碰
 * nib 的字体与主题。第一次使用时给出可用的默认结构，之后整棵树自动落盘。
 */
export type LoopOption = {
  id: string;
  name: string;
  color: string;
};

export type LoopList = {
  id: string;
  name: string;
  /** 系统动作使用的语义，和显示名称解耦；普通列没有这个字段。 */
  role?: "archive" | "trash";
};

export type LoopLink = {
  id: string;
  name: string;
  url: string;
};

export type LoopCard = {
  id: string;
  listId: string;
  title: string;
  description: string;
  statusId: string | null;
  labelIds: string[];
  links: LoopLink[];
  order: number;
  createdAt: string;
  /** 最近一次状态流转时间；没流转过就是 null。 */
  statusChangedAt: string | null;
  archivedAt: string | null;
  deletedAt: string | null;
};

export type LoopDensity = "comfortable" | "compact";

export type LoopSettings = {
  showStatus: boolean;
  showLabels: boolean;
  showLinks: boolean;
  density: LoopDensity;
  /** 列宽（px）。窄了卡片标题就得折行，所以给一个能自己调的档位。 */
  columnWidth: number;
};

export type LoopData = {
  lists: LoopList[];
  statuses: LoopOption[];
  labels: LoopOption[];
  cards: LoopCard[];
  settings: LoopSettings;
};

export const LOOP_STORAGE_KEY = "nib:loop";

export const DEFAULT_COLUMN_WIDTH = 340;
export const MIN_COLUMN_WIDTH = 220;
export const MAX_COLUMN_WIDTH = 640;

export const LOOP_COLORS = [
  "#a7c080",
  "#7fbbb3",
  "#d699b6",
  "#dbbc7f",
  "#e67e80",
  "#e69875",
  "#b8bb82",
  "#83a598",
] as const;

export function createId(prefix: string): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return `${prefix}_${crypto.randomUUID()}`;
  }
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export function createInitialLoopData(): LoopData {
  return {
    lists: [
      { id: "list_todo", name: "Todo" },
      { id: "list_active", name: "Active" },
      { id: "list_focus", name: "Focus" },
      { id: "list_done", name: "Done" },
      { id: "list_archive", name: "Archive", role: "archive" },
      { id: "list_trash", name: "Trash", role: "trash" },
    ],
    // 内置状态按流程排序，颜色跟着阶段走：蓝（开发）→ 黄（待测试）
    // → 粉（测试中）→ 橙（待上线）→ 绿（已上线）。
    statuses: [
      { id: "status_developing", name: "开发中", color: "#7fbbb3" },
      { id: "status_pending_test", name: "待测试", color: "#dbbc7f" },
      { id: "status_testing", name: "测试中", color: "#d699b6" },
      { id: "status_release", name: "待上线", color: "#e69875" },
      { id: "status_online", name: "已上线", color: "#a7c080" },
    ],
    // 标签不强加预设，需要什么自己加。
    labels: [],
    // 内置几张示例卡片：第一次打开就有东西可看、可拖，不至于对着空板发呆。
    // 不想要了在 Loop 设置的「数据」里点「恢复默认数据」就能回到这一份。
    cards: [
      {
        id: "card_try_loop",
        listId: "list_todo",
        title: "把 Loop 试一遍",
        description: "拖动卡片换列、点状态改流转、点标题改内容，右上角设置里能改列、状态和显示。",
        statusId: null,
        labelIds: [],
        links: [],
        order: 0,
        createdAt: "2026-09-18T01:20:00.000Z",
        statusChangedAt: null,
        archivedAt: null,
        deletedAt: null,
      },
      {
        id: "card_read_readme",
        listId: "list_todo",
        title: "看一眼 README",
        description: "外壳、设置、配色怎么组织的都写在里面，加新应用也照着改一处就行。",
        statusId: null,
        labelIds: [],
        links: [
          {
            id: "link_readme",
            name: "README",
            url: "https://github.com/kidyme/nib#readme",
          },
        ],
        order: 1,
        createdAt: "2026-09-18T01:24:00.000Z",
        statusChangedAt: null,
        archivedAt: null,
        deletedAt: null,
      },
      {
        id: "card_release_1_0",
        listId: "list_active",
        title: "nib v1.0 收尾",
        description: "打上 v1.0 的标签、写更新说明、把装好的 .dmg 挂到仓库上。",
        statusId: "status_testing",
        labelIds: [],
        links: [
          {
            id: "link_repo",
            name: "仓库",
            url: "https://github.com/kidyme/nib",
          },
        ],
        order: 0,
        createdAt: "2026-09-16T02:10:00.000Z",
        statusChangedAt: "2026-09-19T03:40:00.000Z",
        archivedAt: null,
        deletedAt: null,
      },
      {
        id: "card_loop_samples",
        listId: "list_active",
        title: "内置示例卡片",
        description: "让第一次打开的人有东西可拖，先看清楚 Loop 是怎么用的。",
        statusId: "status_developing",
        labelIds: [],
        links: [],
        order: 1,
        createdAt: "2026-09-17T06:05:00.000Z",
        statusChangedAt: "2026-09-19T02:15:00.000Z",
        archivedAt: null,
        deletedAt: null,
      },
      {
        id: "card_atlas_wip",
        listId: "list_focus",
        title: "Atlas 文档中心",
        description: "还在开发中，先从侧边栏撤下来，等能用了再挂回去。",
        statusId: "status_developing",
        labelIds: [],
        links: [],
        order: 0,
        createdAt: "2026-09-15T07:30:00.000Z",
        statusChangedAt: "2026-09-19T05:00:00.000Z",
        archivedAt: null,
        deletedAt: null,
      },
      {
        id: "card_theme_fonts",
        listId: "list_done",
        title: "内置配色与字体",
        description: "Everforest 深色预设，界面字体和内容字体都能自己挑，改完即时预览。",
        statusId: "status_online",
        labelIds: [],
        links: [],
        order: 0,
        createdAt: "2026-09-12T03:00:00.000Z",
        statusChangedAt: "2026-09-19T08:45:00.000Z",
        archivedAt: null,
        deletedAt: null,
      },
    ],
    settings: {
      showStatus: true,
      showLabels: true,
      showLinks: true,
      density: "comfortable",
      columnWidth: DEFAULT_COLUMN_WIDTH,
    },
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object";
}

function readText(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

function readColor(value: unknown, index: number): string {
  return typeof value === "string" && /^#[0-9a-f]{6}$/i.test(value)
    ? value
    : LOOP_COLORS[index % LOOP_COLORS.length];
}

function readTime(value: unknown): string | null {
  if (typeof value !== "string") return null;
  return Number.isFinite(new Date(value).getTime()) ? value : null;
}

function readColumnWidth(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return DEFAULT_COLUMN_WIDTH;
  return Math.min(MAX_COLUMN_WIDTH, Math.max(MIN_COLUMN_WIDTH, Math.round(value)));
}

function readOptions(value: unknown): LoopOption[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item, index) => {
    if (!isRecord(item) || typeof item.id !== "string") return [];
    return [{
      id: item.id,
      name: readText(item.name, "未命名"),
      color: readColor(item.color, index),
    }];
  });
}

function readLists(value: unknown): LoopList[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!isRecord(item) || typeof item.id !== "string") return [];
    const role = item.role === "archive" || item.role === "trash" ? item.role : undefined;
    return [{ id: item.id, name: readText(item.name, "未命名列表"), role }];
  });
}

/** 兼容没有 role 的旧数据；显式 role 永远优先于名称。 */
function assignLegacyListRoles(lists: LoopList[]): LoopList[] {
  const roles = new Set(lists.flatMap((list) => list.role ? [list.role] : []));
  return lists.map((list) => {
    if (list.role) return list;
    const name = list.name.trim().toLowerCase();
    const role = ["trash", "回收站", "垃圾箱"].includes(name)
      ? "trash"
      : ["archive", "归档"].includes(name)
        ? "archive"
        : null;
    if (!role || roles.has(role)) return list;
    roles.add(role);
    return { ...list, role };
  });
}

export function findListByRole(lists: LoopList[], role: LoopList["role"]): LoopList | undefined {
  return lists.find((list) => list.role === role);
}

function readLinks(value: unknown): LoopLink[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!isRecord(item) || typeof item.id !== "string") return [];
    const url = readText(item.url);
    if (!url) return [];
    return [{ id: item.id, name: readText(item.name, url), url }];
  });
}

function readCards(value: unknown, fallbackListId: string): LoopCard[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!isRecord(item) || typeof item.id !== "string") return [];
    return [{
      id: item.id,
      listId: readText(item.listId, fallbackListId),
      title: readText(item.title, "未命名"),
      description: readText(item.description),
      statusId: typeof item.statusId === "string" ? item.statusId : null,
      labelIds: Array.isArray(item.labelIds)
        ? item.labelIds.filter((id): id is string => typeof id === "string")
        : [],
      links: readLinks(item.links),
      order: typeof item.order === "number" && Number.isFinite(item.order) ? item.order : 0,
      createdAt: readTime(item.createdAt) ?? new Date().toISOString(),
      statusChangedAt: readTime(item.statusChangedAt),
      archivedAt: readTime(item.archivedAt),
      deletedAt: readTime(item.deletedAt),
    }];
  });
}

/** 把未知 JSON 收敛成一份完整数据；版本或必要结构不对时返回 null。 */
export function normalizeLoopData(value: unknown): LoopData | null {
  if (!isRecord(value)) return null;

  const lists = assignLegacyListRoles(readLists(value.lists));
  if (lists.length === 0) return null;

  const statuses = readOptions(value.statuses);
  // 不再内置标签；旧数据里的标签都是历史遗留，清空。
  const labels: LoopOption[] = [];
  const statusesForData = statuses;
  const now = new Date().toISOString();
  const cards = readCards(value.cards, lists[0].id).map((card) => {
    const listId = lists.some((list) => list.id === card.listId) ? card.listId : lists[0].id;
    const role = lists.find((list) => list.id === listId)?.role;
    return {
      ...card,
      listId,
      statusId: statusesForData.some((status) => status.id === card.statusId) ? card.statusId : null,
      labelIds: card.labelIds.filter((id) => labels.some((label) => label.id === id)),
      archivedAt: card.archivedAt ?? (role === "archive" ? now : null),
      deletedAt: card.deletedAt ?? (role === "trash" ? now : null),
    };
  });
  const settings = isRecord(value.settings) ? value.settings : {};

  return {
    lists,
    statuses: statusesForData,
    labels,
    cards,
    settings: {
      showStatus: settings.showStatus !== false,
      showLabels: settings.showLabels !== false,
      showLinks: settings.showLinks !== false,
      density: settings.density === "compact" ? "compact" : "comfortable",
      columnWidth: readColumnWidth(settings.columnWidth),
    },
  };
}

/** 从 localStorage 读；脏数据不抛异常，尽量降级成一份可用看板。 */
export function readLoopData(): LoopData {
  try {
    return normalizeLoopData(
      JSON.parse(localStorage.getItem(LOOP_STORAGE_KEY) ?? "null"),
    ) ?? createInitialLoopData();
  } catch {
    return createInitialLoopData();
  }
}

export function saveLoopData(data: LoopData): void {
  localStorage.setItem(LOOP_STORAGE_KEY, JSON.stringify(data));
}

export function cardsInList(cards: LoopCard[], listId: string): LoopCard[] {
  return cards.filter((card) => card.listId === listId).sort((a, b) => a.order - b.order);
}

/**
 * 把卡片插入目标位置。toIndex 是在目标列表当前可见顺序里的插入点；
 * 同列向下移动时先移除自己，所以索引要减一。
 */
export function moveCard(
  data: LoopData,
  cardId: string,
  toListId: string,
  toIndex: number,
): LoopData {
  const card = data.cards.find((item) => item.id === cardId);
  if (!card) return data;

  const fromCards = cardsInList(data.cards, card.listId);
  const fromIndex = fromCards.findIndex((item) => item.id === cardId);
  const target = card.listId === toListId
    ? fromCards
    : cardsInList(data.cards, toListId);
  let index = Math.max(0, Math.min(toIndex, target.length));
  if (card.listId === toListId && fromIndex !== -1 && fromIndex < index) index -= 1;

  const nextCards = target.filter((item) => item.id !== cardId);
  nextCards.splice(Math.max(0, Math.min(index, nextCards.length)), 0, card);

  const positions = new Map(nextCards.map((item, position) => [item.id, position]));
  const changedList = card.listId !== toListId;
  const toList = data.lists.find((item) => item.id === toListId);
  const moved = changedList
    ? {
        ...card,
        listId: toListId,
        order: positions.get(cardId) ?? 0,
        archivedAt: toList?.role === "archive" ? new Date().toISOString() : null,
        deletedAt: toList?.role === "trash" ? new Date().toISOString() : null,
      }
    : { ...card, order: positions.get(cardId) ?? 0 };
  return {
    ...data,
    cards: data.cards.map((item) => {
      if (item.id === cardId) return moved;
      const order = positions.get(item.id);
      return order === undefined ? item : { ...item, order };
    }),
  };
}
