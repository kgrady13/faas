"use client";

import { useState, useCallback } from "react";

export type ExecutionLoadingState = "run" | "deploy" | null;

export interface SSEEventHandlers {
  onStdout?: (data: string) => void;
  onStderr?: (data: string) => void;
  onExit?: (code: number) => void;
  onError?: (error: string) => void;
  onDone?: () => void;
  onPhase?: (phase: string) => void;
  onLog?: (log: string) => void;
  onBuildDone?: (data: unknown) => void;
  onDeployDone?: (data: { id: string; url: string; functionName: string; status: string; cronSchedule?: string; functionUrl: string }) => void;
  onSnapshot?: (data: { id: string }) => void;
}

export interface UseCodeExecutionReturn {
  loading: ExecutionLoadingState;
  runCode: (code: string, handlers: SSEEventHandlers) => Promise<void>;
  deployCode: (
    code: string,
    options: { functionName?: string; cronSchedule?: string; regions?: string[] },
    handlers: SSEEventHandlers
  ) => Promise<void>;
}

/**
 * Parse SSE stream and call appropriate handlers
 */
async function parseSSEStream(
  response: Response,
  handlers: SSEEventHandlers
): Promise<void> {
  // Check if response is SSE stream or JSON error
  const contentType = response.headers.get("content-type");
  if (contentType?.includes("application/json")) {
    const data = await response.json();
    handlers.onError?.(data.error || "Unknown error");
    return;
  }

  const reader = response.body?.getReader();
  if (!reader) {
    handlers.onError?.("Failed to read response stream");
    return;
  }

  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });

    // Process complete SSE messages
    const lines = buffer.split("\n\n");
    buffer = lines.pop() || ""; // Keep incomplete message in buffer

    for (const line of lines) {
      if (line.startsWith("data: ")) {
        const jsonStr = line.slice(6);
        try {
          const event = JSON.parse(jsonStr);

          switch (event.type) {
            case "stdout":
              handlers.onStdout?.(event.data);
              break;
            case "stderr":
              handlers.onStderr?.(event.data);
              break;
            case "exit":
              handlers.onExit?.(event.data);
              break;
            case "error":
              handlers.onError?.(event.data);
              break;
            case "done":
              handlers.onDone?.();
              break;
            case "phase":
              handlers.onPhase?.(event.data);
              break;
            case "log":
              handlers.onLog?.(event.data);
              break;
            case "build_done":
              handlers.onBuildDone?.(event.data);
              break;
            case "deploy_done":
              handlers.onDeployDone?.(event.data);
              break;
            case "snapshot":
              handlers.onSnapshot?.(event.data);
              break;
          }
        } catch {
          // Ignore JSON parse errors
        }
      }
    }
  }
}

export function useCodeExecution(): UseCodeExecutionReturn {
  const [loading, setLoading] = useState<ExecutionLoadingState>(null);

  const runCode = useCallback(async (code: string, handlers: SSEEventHandlers): Promise<void> => {
    setLoading("run");

    try {
      const res = await fetch("/api/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code }),
      });

      await parseSSEStream(res, handlers);
    } catch (error) {
      handlers.onError?.(String(error));
    } finally {
      setLoading(null);
    }
  }, []);

  const deployCode = useCallback(async (
    code: string,
    options: { functionName?: string; cronSchedule?: string; regions?: string[] },
    handlers: SSEEventHandlers
  ): Promise<void> => {
    setLoading("deploy");

    try {
      const res = await fetch("/api/deploy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code,
          functionName: options.functionName || "handler",
          cronSchedule: options.cronSchedule || undefined,
          regions: options.regions?.length ? options.regions : undefined,
        }),
      });

      await parseSSEStream(res, handlers);
    } catch (error) {
      handlers.onError?.(String(error));
    } finally {
      setLoading(null);
    }
  }, []);

  return {
    loading,
    runCode,
    deployCode,
  };
}
