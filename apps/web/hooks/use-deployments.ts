"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import type { DeploymentStatus } from "@/lib/types";

export interface DeploymentState {
  id: string;
  url: string;
  functionName: string;
  functionUrl: string;
  status: DeploymentStatus;
  cronSchedule?: string;
  regions?: string[];
  createdAt: string;
  errorMessage?: string;
}

export interface UseDeploymentsReturn {
  deployments: DeploymentState[];
  fetchDeployments: () => Promise<void>;
  deleteDeployment: (id: string) => Promise<{ success: boolean; error?: string }>;
}

export function useDeployments(): UseDeploymentsReturn {
  const [deployments, setDeployments] = useState<DeploymentState[]>([]);
  const initialFetchDone = useRef(false);

  const fetchDeployments = useCallback(async () => {
    try {
      const res = await fetch("/api/deployments");
      const data = await res.json();
      if (data.success) {
        setDeployments(data.deployments);
      }
    } catch {
      // Ignore errors
    }
  }, []);

  const deleteDeployment = useCallback(async (id: string): Promise<{ success: boolean; error?: string }> => {
    try {
      const res = await fetch(`/api/deployments/${id}`, { method: "DELETE" });
      const data = await res.json();

      if (data.success) {
        await fetchDeployments();
        return { success: true };
      } else {
        return { success: false, error: data.error };
      }
    } catch (error) {
      return { success: false, error: String(error) };
    }
  }, [fetchDeployments]);

  // Fetch deployments on mount
  useEffect(() => {
    if (!initialFetchDone.current) {
      initialFetchDone.current = true;
      // Intentionally fetch on mount - data fetching is a valid use of useEffect
      // eslint-disable-next-line react-hooks/set-state-in-effect
      void fetchDeployments();
    }
  }, [fetchDeployments]);

  // Poll deployments for status updates when there are pending deployments
  useEffect(() => {
    const hasPendingDeployments = deployments.some(
      d => d.status === "building" || d.status === "queued"
    );

    if (!hasPendingDeployments) return;

    const interval = setInterval(() => void fetchDeployments(), 5000);
    return () => clearInterval(interval);
  }, [deployments, fetchDeployments]);

  return {
    deployments,
    fetchDeployments,
    deleteDeployment,
  };
}
