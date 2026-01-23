"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import type { RuntimeLog } from "@/lib/types";

export interface UseRuntimeLogsReturn {
  logs: RuntimeLog[];
  loading: boolean;
  error: string | null;
  clearLogs: () => void;
  startStreaming: (deploymentId: string) => void;
  stopStreaming: () => void;
}

/**
 * Hook to stream runtime logs from a deployment.
 * Handles SSE connection lifecycle and automatic cleanup.
 */
export function useRuntimeLogs(): UseRuntimeLogsReturn {
  const [logs, setLogs] = useState<RuntimeLog[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  const stopStreaming = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
  }, []);

  const clearLogs = useCallback(() => {
    setLogs([]);
  }, []);

  const startStreaming = useCallback(async (deploymentId: string) => {
    // Abort any previous stream
    stopStreaming();

    const abortController = new AbortController();
    abortControllerRef.current = abortController;

    setLoading(true);
    setLogs([]);
    setError(null);

    try {
      const res = await fetch(`/api/deployments/${deploymentId}/logs`, {
        signal: abortController.signal,
      });

      const contentType = res.headers.get("content-type");
      if (contentType?.includes("application/json")) {
        const data = await res.json();
        if (!data.success) {
          setError(data.error || "Failed to fetch logs");
        }
        setLoading(false);
        return;
      }

      const reader = res.body?.getReader();
      if (!reader) {
        setError("Failed to read response stream");
        setLoading(false);
        return;
      }

      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (line.startsWith("data: ")) {
            const jsonStr = line.slice(6);
            try {
              const event = JSON.parse(jsonStr);
              if (event.type === "log" && event.data) {
                setLogs((prev) => [...prev, event.data as RuntimeLog]);
              } else if (event.type === "connected") {
                setLoading(false);
              } else if (event.type === "error") {
                setError(event.data || "Unknown error");
                setLoading(false);
              }
            } catch {
              // Ignore parse errors
            }
          }
        }
      }
    } catch (err) {
      if (err instanceof Error && err.name !== "AbortError") {
        setError(err.message);
      }
    } finally {
      setLoading(false);
    }
  }, [stopStreaming]);

  // Cleanup on unmount
  useEffect(() => {
    return () => stopStreaming();
  }, [stopStreaming]);

  return {
    logs,
    loading,
    error,
    clearLogs,
    startStreaming,
    stopStreaming,
  };
}
