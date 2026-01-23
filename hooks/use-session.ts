"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import type { SessionStatus } from "@/lib/types";

export interface SessionState {
  sandboxId: string;
  status: SessionStatus;
  timeout: number;
  snapshotId?: string;
  remainingTime: number;
  isActive?: boolean;
}

export type SessionLoadingState = "create" | "snapshot" | "restore" | "stop" | null;

export interface UseSessionReturn {
  session: SessionState | null;
  remainingTime: number;
  loading: SessionLoadingState;
  fetchSession: () => Promise<void>;
  createSession: () => Promise<{ success: boolean; error?: string }>;
  stopSandbox: () => Promise<{ success: boolean; error?: string }>;
  saveSnapshot: () => Promise<{ success: boolean; snapshotId?: string; error?: string }>;
  restoreSnapshot: () => Promise<{ success: boolean; error?: string }>;
  setSession: React.Dispatch<React.SetStateAction<SessionState | null>>;
}

export function useSession(): UseSessionReturn {
  const [session, setSession] = useState<SessionState | null>(null);
  const [remainingTime, setRemainingTime] = useState<number>(0);
  const [loading, setLoading] = useState<SessionLoadingState>(null);

  const fetchSession = useCallback(async () => {
    try {
      const res = await fetch("/api/session");
      const data = await res.json();
      setSession(data.session);
      if (data.session?.remainingTime) {
        setRemainingTime(data.session.remainingTime);
      }
    } catch {
      // Ignore errors on initial fetch
    }
  }, []);

  const createSession = useCallback(async (): Promise<{ success: boolean; error?: string }> => {
    setLoading("create");

    try {
      const res = await fetch("/api/session", { method: "POST" });
      const data = await res.json();

      if (data.success) {
        setSession(data.session);
        setRemainingTime(data.session.remainingTime);
        return { success: true };
      } else {
        return { success: false, error: data.error };
      }
    } catch (error) {
      return { success: false, error: String(error) };
    } finally {
      setLoading(null);
    }
  }, []);

  const stopSandbox = useCallback(async (): Promise<{ success: boolean; error?: string }> => {
    if (!session) {
      return { success: false, error: "No active session to stop." };
    }

    setLoading("stop");

    try {
      const res = await fetch("/api/stop", { method: "POST" });
      const data = await res.json();

      if (data.success) {
        setSession(null);
        setRemainingTime(0);
        return { success: true };
      } else {
        return { success: false, error: data.error };
      }
    } catch (error) {
      return { success: false, error: String(error) };
    } finally {
      setLoading(null);
    }
  }, [session]);

  const saveSnapshot = useCallback(async (): Promise<{ success: boolean; snapshotId?: string; error?: string }> => {
    if (!session || session.status !== "running") {
      return { success: false, error: "No active session to snapshot." };
    }

    setLoading("snapshot");

    try {
      const res = await fetch("/api/snapshot", { method: "POST" });
      const data = await res.json();

      if (data.success) {
        setSession((s) =>
          s ? { ...s, status: "paused", snapshotId: data.snapshotId } : null
        );
        return { success: true, snapshotId: data.snapshotId };
      } else {
        return { success: false, error: data.error };
      }
    } catch (error) {
      return { success: false, error: String(error) };
    } finally {
      setLoading(null);
    }
  }, [session]);

  const restoreSnapshot = useCallback(async (): Promise<{ success: boolean; error?: string }> => {
    if (!session?.snapshotId) {
      return { success: false, error: "No snapshot available to restore." };
    }

    setLoading("restore");

    try {
      const res = await fetch("/api/restore", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ snapshotId: session.snapshotId }),
      });
      const data = await res.json();

      if (data.success) {
        setSession(data.session);
        setRemainingTime(data.session.remainingTime);
        return { success: true };
      } else {
        return { success: false, error: data.error };
      }
    } catch (error) {
      return { success: false, error: String(error) };
    } finally {
      setLoading(null);
    }
  }, [session?.snapshotId]);

  // Countdown timer effect
  useEffect(() => {
    if (!session || session.status !== "running") return;

    const interval = setInterval(() => {
      setRemainingTime((prev) => {
        const newTime = prev - 1000;
        if (newTime <= 0) {
          setSession((s) => (s ? { ...s, status: "stopped" } : null));
          return 0;
        }
        return newTime;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [session]);

  // Fetch session on mount
  const initialFetchDone = useRef(false);
  useEffect(() => {
    if (!initialFetchDone.current) {
      initialFetchDone.current = true;
      void fetchSession();
    }
  }, [fetchSession]);

  return {
    session,
    remainingTime,
    loading,
    fetchSession,
    createSession,
    stopSandbox,
    saveSnapshot,
    restoreSnapshot,
    setSession,
  };
}
