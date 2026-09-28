import { invoke, isTauri } from "@tauri-apps/api/core";

export type AgentDataset = "loop" | "atlas";
export type AgentWriteAction = "ui_save" | "import";

const pendingWrites = new Map<AgentDataset, Promise<void>>();

export async function readAgentData(dataset: AgentDataset): Promise<string | null> {
  // A focus event can arrive while the import/save IPC is still in flight. Wait for
  // the queued write so a stale SQLite read cannot replace the just-imported state.
  await pendingWrites.get(dataset);
  if (!isTauri()) return null;
  try {
    return await invoke<string | null>("read_agent_data", { dataset });
  } catch {
    return null;
  }
}

export function writeAgentData(
  dataset: AgentDataset,
  contents: string,
  action: AgentWriteAction = "ui_save",
): Promise<void> {
  const previous = pendingWrites.get(dataset) ?? Promise.resolve();
  const current = previous.then(async () => {
    if (!isTauri()) return;
    await invoke("write_agent_data", { dataset, contents, action });
  });
  pendingWrites.set(dataset, current.catch(() => undefined));
  return current;
}
