import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";

import { fetchMemoryGraph } from "./api";
import type { MemoryGraphData } from "./types";

const QUERY_KEY = ["memory-graph"] as const;

export function useMemoryGraphData() {
  const { data, isLoading, error, isFetching } = useQuery<MemoryGraphData>({
    queryKey: QUERY_KEY,
    queryFn: fetchMemoryGraph,
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });
  return { data: data ?? null, isLoading, error, isFetching };
}

export function useRefreshMemoryGraph() {
  const qc = useQueryClient();
  return useCallback(() => {
    qc.invalidateQueries({ queryKey: QUERY_KEY });
  }, [qc]);
}
