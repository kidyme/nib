/**
 * Atlas 的本地数据模型。
 *
 * 分类和文档只存在这一棵树里（nib:atlas），不碰 nib 的全局配置。
 * 结构上刻意保持平铺：分类只有一层，文档直接挂在分类下，数组顺序就是页面上
 * 的顺序——排序、跨分类移动都只改这个顺序，不需要额外的 order 字段。
 */
import { normalizeExternalUrl } from "../../shell/openExternal";

export type AtlasLink = {
  id: string;
  title: string;
  url: string;
};

export type AtlasCategory = {
  id: string;
  name: string;
  links: AtlasLink[];
};

export type AtlasSettings = {
  cardWidth: number;
};

export type AtlasData = {
  categories: AtlasCategory[];
  settings: AtlasSettings;
};

export const DEFAULT_CARD_WIDTH = 166;
export const MIN_CARD_WIDTH = 112;
export const MAX_CARD_WIDTH = 512;

export const ATLAS_STORAGE_KEY = "nib:atlas";
/**
 * 标记「应用至少带着内置默认跑过一次」。旧版本会把空数据写进存储，导致
 * 后加的内置默认永远轮不到出场；有这个标记就能把"旧版留下的空"和
 * "用户自己删光的空"区分开——前者补默认，后者尊重。
 */
export const ATLAS_INITIALIZED_KEY = "nib:atlas:initialized";

export function createId(prefix: string): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return `${prefix}_${crypto.randomUUID()}`;
  }
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * 内置的起始数据：只在本地完全没有存过数据时给一份像样的首页，
 * 之后完全以 localStorage 为准——删光了就是空的，不会被"复活"。
 */
export function createInitialAtlasData(): AtlasData {
  return {
    settings: { cardWidth: DEFAULT_CARD_WIDTH },
    categories: [
      {
        id: "builtin_frequent",
        name: "高频访问",
        links: [
          { id: "builtin_github", title: "GitHub", url: "https://github.com" },
          { id: "builtin_stackoverflow", title: "Stack Overflow", url: "https://stackoverflow.com" },
          { id: "builtin_mdn", title: "MDN", url: "https://developer.mozilla.org" },
          { id: "builtin_google", title: "Google", url: "https://www.google.com" },
        ],
      },
      {
        id: "builtin_docs",
        name: "常用文档",
        links: [
          { id: "builtin_react", title: "React 文档", url: "https://react.dev" },
          { id: "builtin_tailwind", title: "Tailwind CSS", url: "https://tailwindcss.com/docs" },
          { id: "builtin_typescript", title: "TypeScript", url: "https://www.typescriptlang.org/docs" },
          { id: "builtin_tauri", title: "Tauri 文档", url: "https://tauri.app" },
        ],
      },
      {
        id: "builtin_tools",
        name: "开发工具",
        links: [
          { id: "builtin_regex", title: "正则测试", url: "https://regex101.com" },
          { id: "builtin_json", title: "JSON 校验", url: "https://jsonlint.com" },
          { id: "builtin_cyberchef", title: "加解密工具", url: "https://gchq.github.io/CyberChef/" },
          { id: "builtin_can_i_use", title: "兼容性查询", url: "https://caniuse.com" },
        ],
      },
    ],
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object";
}

function readText(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

function readLinks(value: unknown): AtlasLink[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  return value.flatMap((item) => {
    if (!isRecord(item) || typeof item.id !== "string" || seen.has(item.id)) return [];
    const url = normalizeExternalUrl(readText(item.url));
    if (!url) return [];
    seen.add(item.id);
    return [{
      id: item.id,
      title: readText(item.title).trim() || new URL(url).hostname,
      url,
    }];
  });
}

function readSettings(value: unknown): AtlasSettings {
  const raw = isRecord(value) ? value.cardWidth : value;
  const width = typeof raw === "number" ? Math.round(raw) : DEFAULT_CARD_WIDTH;
  return {
    cardWidth: Number.isFinite(width)
      ? Math.max(MIN_CARD_WIDTH, Math.min(MAX_CARD_WIDTH, width))
      : DEFAULT_CARD_WIDTH,
  };
}

function readCategories(value: unknown): AtlasCategory[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  return value.flatMap((item) => {
    if (!isRecord(item) || typeof item.id !== "string" || seen.has(item.id)) return [];
    seen.add(item.id);
    return [{
      id: item.id,
      name: readText(item.name).trim() || "未命名分类",
      links: readLinks(item.links),
    }];
  });
}

/**
 * 旧版本（groups + 扁平的 docs）的数据迁移：分组原样变成分类，文档按 groupId
 * 归位，没有分组的文档收进一个额外的「未分组」。只读一次，写回就是新结构。
 */
function migrateLegacyData(value: Record<string, unknown>): AtlasData | null {
  if (!("groups" in value) && !("docs" in value)) return null;

  const groups = Array.isArray(value.groups) ? value.groups : [];
  const categories: AtlasCategory[] = [];
  const ids = new Set<string>();
  for (const item of groups) {
    if (!isRecord(item) || typeof item.id !== "string" || ids.has(item.id)) continue;
    ids.add(item.id);
    categories.push({
      id: item.id,
      name: readText(item.name).trim() || "未命名分组",
      links: [],
    });
  }

  const ungrouped: AtlasLink[] = [];
  for (const item of Array.isArray(value.docs) ? value.docs : []) {
    if (!isRecord(item)) continue;
    const [link] = readLinks([item]);
    if (!link) continue;
    const target = typeof item.groupId === "string"
      ? categories.find((category) => category.id === item.groupId)
      : undefined;
    if (target) target.links.push(link);
    else ungrouped.push(link);
  }
  if (ungrouped.length) {
    categories.push({ id: createId("category"), name: "未分组", links: ungrouped });
  }

  return { categories, settings: readSettings(value.settings) };
}

/** 把未知 JSON 收敛成一份完整数据；连对象都不是就返回 null。 */
export function normalizeAtlasData(value: unknown): AtlasData | null {
  if (!isRecord(value)) return null;
  if ("categories" in value) {
    return { categories: readCategories(value.categories), settings: readSettings(value.settings) };
  }
  return migrateLegacyData(value);
}

/** 从 localStorage 读；脏数据不抛异常，降级成一份内置默认。 */
export function readAtlasData(): AtlasData {
  let data: AtlasData | null = null;
  try {
    data = normalizeAtlasData(JSON.parse(localStorage.getItem(ATLAS_STORAGE_KEY) ?? "null"));
  } catch {
    data = null;
  }
  // 存储里是空的、又从来没初始化过：当作第一次使用，补内置默认。
  // 只要保存过一次，标记就立上了，之后再删光也不会被"复活"。
  if (!data || (data.categories.length === 0 && !localStorage.getItem(ATLAS_INITIALIZED_KEY))) {
    data = createInitialAtlasData();
  }
  return data;
}

export function saveAtlasData(data: AtlasData): void {
  localStorage.setItem(ATLAS_STORAGE_KEY, JSON.stringify(data));
  localStorage.setItem(ATLAS_INITIALIZED_KEY, "1");
}

export function findCategory(data: AtlasData, categoryId: string): AtlasCategory | undefined {
  return data.categories.find((category) => category.id === categoryId);
}

function insertAt(links: AtlasLink[], link: AtlasLink, index: number): AtlasLink[] {
  return [...links.slice(0, index), link, ...links.slice(index)];
}

/**
 * 把一条文档挪到目标分类的第 index 位（"插到第 index 个之前"，越界自动夹住）。
 *
 * 拖动过程中源项自己还占着一格，所以同分类内往后挪时要把这一格补掉；
 * 位置没变化时原样返回，调用方（React state）可以靠引用相等跳过渲染。
 */
export function moveLink(
  data: AtlasData,
  linkId: string,
  categoryId: string,
  index: number,
): AtlasData {
  const sourceCategory = data.categories.find((category) =>
    category.links.some((link) => link.id === linkId)
  );
  const targetCategory = data.categories.find((category) => category.id === categoryId);
  if (!sourceCategory || !targetCategory) return data;

  const sourceIndex = sourceCategory.links.findIndex((link) => link.id === linkId);
  const link = sourceCategory.links[sourceIndex];
  const sameCategory = sourceCategory.id === targetCategory.id;

  let insertIndex = Math.max(0, Math.min(index, targetCategory.links.length));
  if (sameCategory) {
    if (sourceIndex < insertIndex) insertIndex -= 1;
    if (insertIndex === sourceIndex) return data;
  }

  return {
    ...data,
    categories: data.categories.map((category) => {
      if (sameCategory && category.id === sourceCategory.id) {
        const rest = category.links.filter((_, at) => at !== sourceIndex);
        return { ...category, links: insertAt(rest, link, insertIndex) };
      }
      if (category.id === sourceCategory.id) {
        return { ...category, links: category.links.filter((_, at) => at !== sourceIndex) };
      }
      if (category.id === targetCategory.id) {
        return { ...category, links: insertAt(category.links, link, insertIndex) };
      }
      return category;
    }),
  };
}
