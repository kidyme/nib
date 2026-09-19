/**
 * Atlas 的本地数据模型。
 *
 * 分组、文档和收藏都只存在这一棵树里（nib:atlas），不碰 nib 的全局配置。
 * 第一次使用是空的；写入时整棵树自动落盘。
 */
import { normalizeExternalUrl } from "../../shell/openExternal";

export type AtlasGroup = {
  id: string;
  name: string;
};

export type AtlasDoc = {
  id: string;
  /** null 表示未分组。删掉分组只会把文档退回这里，不会删文档。 */
  groupId: string | null;
  title: string;
  url: string;
  note: string;
  favorite: boolean;
};

export type AtlasData = {
  groups: AtlasGroup[];
  docs: AtlasDoc[];
};

export const ATLAS_STORAGE_KEY = "nib:atlas";

export function createId(prefix: string): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return `${prefix}_${crypto.randomUUID()}`;
  }
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export function createInitialAtlasData(): AtlasData {
  return { groups: [], docs: [] };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object";
}

function readText(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

function readGroups(value: unknown): AtlasGroup[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  return value.flatMap((item) => {
    if (!isRecord(item) || typeof item.id !== "string" || seen.has(item.id)) return [];
    seen.add(item.id);
    return [{ id: item.id, name: readText(item.name, "未命名分组").trim() || "未命名分组" }];
  });
}

function readDocs(value: unknown, groups: AtlasGroup[]): AtlasDoc[] {
  if (!Array.isArray(value)) return [];
  const groupIds = new Set(groups.map((group) => group.id));
  const seen = new Set<string>();
  return value.flatMap((item) => {
    if (!isRecord(item) || typeof item.id !== "string" || seen.has(item.id)) return [];
    const url = normalizeExternalUrl(readText(item.url));
    if (!url) return [];
    seen.add(item.id);
    return [{
      id: item.id,
      groupId: typeof item.groupId === "string" && groupIds.has(item.groupId) ? item.groupId : null,
      title: readText(item.title).trim() || new URL(url).hostname,
      url,
      note: readText(item.note),
      favorite: item.favorite === true,
    }];
  });
}

/** 把未知 JSON 收敛成一份完整数据；连对象都不是就返回 null。 */
export function normalizeAtlasData(value: unknown): AtlasData | null {
  if (!isRecord(value)) return null;
  const groups = readGroups(value.groups);
  return { groups, docs: readDocs(value.docs, groups) };
}

/** 从 localStorage 读；脏数据不抛异常，降级成空数据。 */
export function readAtlasData(): AtlasData {
  try {
    return normalizeAtlasData(
      JSON.parse(localStorage.getItem(ATLAS_STORAGE_KEY) ?? "null"),
    ) ?? createInitialAtlasData();
  } catch {
    return createInitialAtlasData();
  }
}

export function saveAtlasData(data: AtlasData): void {
  localStorage.setItem(ATLAS_STORAGE_KEY, JSON.stringify(data));
}

export function docsInGroup(docs: AtlasDoc[], groupId: string | null): AtlasDoc[] {
  return docs.filter((doc) => doc.groupId === groupId);
}
