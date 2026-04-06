"use client";

import { useState, useCallback } from "react";
import type { UsageSummary } from "@/lib/types";

export interface UseUsageReturn {
  usage: UsageSummary | null;
  loading: boolean;
  error: string | null;
  fetchUsage: (from?: string, to?: string) => Promise<void>;
}

export function useUsage(): UseUsageReturn {
  const [usage, setUsage] = useState<UsageSummary | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchUsage = useCallback(async (from?: string, to?: string) => {
    setLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams();
      if (from) params.set("from", from);
      if (to) params.set("to", to);

      const res = await fetch(`/api/usage?${params}`);
      const data = await res.json();

      if (data.success) {
        setUsage(data.usage);
      } else {
        setError(data.error || "Failed to fetch usage");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fetch usage");
    } finally {
      setLoading(false);
    }
  }, []);

  return { usage, loading, error, fetchUsage };
}
