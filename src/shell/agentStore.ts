import { invoke } from "@tauri-apps/api/core";

export type AgentDataset = "loop" | "atlas";

export async function readAgentData(dataset: AgentDataset): Promise<string | null> {
  try {
    return await invoke<string | null>("read_agent_data", { dataset });
  } catch {
    // Browser/Vite mode has no Tauri command; localStorage remains the fallback.
    return null;
  }
}

export async function writeAgentData(dataset: AgentDataset, contents: string): Promise<void> {
  try {
    await invoke("write_agent_data", { dataset, contents });
  } catch {
    // Browser/Vite mode has no shared store.
  }
}
