/** 统一导出 JSON：Tauri 里直接写到桌面；浏览器里退回普通下载。 */
import { invoke } from "@tauri-apps/api/core";

const inTauri = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

export async function exportJsonFile(filename: string, contents: string): Promise<string | null> {
  if (inTauri) {
    return await invoke<string>("export_json_to_desktop", {
      filename,
      contents,
    });
  }

  const url = URL.createObjectURL(new Blob([contents], { type: "application/json" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
  return null;
}
