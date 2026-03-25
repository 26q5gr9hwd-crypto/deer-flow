import { getBackendBaseURL } from "../config";

import type { MemoryGraphData } from "./types";

export async function fetchMemoryGraph(): Promise<MemoryGraphData> {
  const res = await fetch(`${getBackendBaseURL()}/api/memory/graph`);
  if (!res.ok) {
    throw new Error(`Memory graph fetch failed: ${res.status} ${res.statusText}`);
  }
  return res.json() as Promise<MemoryGraphData>;
}
