import { openUrl } from "@tauri-apps/plugin-opener";

/**
 * 全项目唯一的外部链接入口。只放行 http(s)，在桌面端始终交给系统默认浏览器。
 * 浏览器调试时没有 Tauri 注入，退回到新标签页，避免开发环境无法点击。
 */
export function normalizeExternalUrl(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const candidate = /^[a-z][a-z\d+.-]*:/i.test(trimmed) ? trimmed : `https://${trimmed}`;
  try {
    const url = new URL(candidate);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    return url.toString();
  } catch {
    return null;
  }
}

export async function openExternalUrl(value: string): Promise<boolean> {
  const url = normalizeExternalUrl(value);
  if (!url) return false;

  try {
    await openUrl(url);
  } catch {
    window.open(url, "_blank", "noopener,noreferrer");
  }
  return true;
}
