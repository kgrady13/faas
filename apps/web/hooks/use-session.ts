"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import type { SessionStatus } from "@/lib/types";

export interface SessionState {
  sandboxName: string;
  status: SessionStatus;
  timeout: number;
  remainingTime: number;
  isActive?: boolean;
}

export type SessionLoadingState = "create" | "stop" | null;

export interface UseSessionReturn {
  session: SessionState | null;
  remainingTime: number;
  loading: SessionLoadingState;
  fetchSession: () => Promise<void>;
  createSession: () => Promise<{ success: boolean; error?: string }>;
  stopSandbox: () => Promise<{ success: boolean; error?: string }>;
  pauseSandbox: () => Promise<{ success: boolean; error?: string }>;
  resumeSandbox: () => Promise<{ success: boolean; error?: string }>;
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
      if (data.success && data.session) {
        setSession(data.session);
        if (data.session?.remainingTime) {
          setRemainingTime(data.session.remainingTime);
        }
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

  const pauseSandbox = useCallback(async (): Promise<{ success: boolean; error?: string }> => {
    if (!session || session.status !== "running") {
      return { success: false, error: "No active session to pause." };
    }

    setLoading("stop");

    try {
      const res = await fetch("/api/snapshot", { method: "POST" });
      const data = await res.json();

      if (data.success) {
        setSession((s) => (s ? { ...s, status: "paused" } : null));
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

  const resumeSandbox = useCallback(async (): Promise<{ success: boolean; error?: string }> => {
    if (!session) {
      return { success: false, error: "No session to resume." };
    }

    setLoading("create");

    try {
      const res = await fetch("/api/restore", { method: "POST" });
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
  }, [session]);

  // Countdown timer effect
  useEffect(() => {
    if (!session || session.status !== "running") return;

    const interval = setInterval(() => {
      setRemainingTime((prev) => {
        const newTime = prev - 1000;
        if (newTime <= 0) {
          // VM auto-stopped, but state persists — mark as paused, not stopped
          setSession((s) => (s ? { ...s, status: "paused" } : null));
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
    pauseSandbox,
    resumeSandbox,
    setSession,
  };
}
