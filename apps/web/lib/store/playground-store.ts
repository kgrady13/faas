import { create } from "zustand";
import type { Output } from "@/lib/types";
import type { DeploymentState } from "@/hooks/use-deployments";

export interface PlaygroundState {
  // Code editor
  code: string;
  setCode: (code: string) => void;

  // Output panel
  outputs: Output[];
  addOutput: (type: Output["type"], content: string) => void;
  clearOutputs: () => void;

  // Deploy config
  cronSchedule: string;
  setCronSchedule: (schedule: string) => void;
  regions: string[];
  setRegions: (regions: string[]) => void;

  // Mobile view toggle
  mobileView: "editor" | "output";
  setMobileView: (view: "editor" | "output") => void;

  // Deployment inspection
  inspectedDeployment: DeploymentState | null;
  inspectTab: "details" | "logs";
  setInspectedDeployment: (d: DeploymentState | null) => void;
  setInspectTab: (tab: "details" | "logs") => void;
}

export const usePlaygroundStore = create<PlaygroundState>()((set) => ({
  code: "",
  setCode: (code) => set({ code }),

  outputs: [],
  addOutput: (type, content) =>
    set((state) => ({
      outputs: [...state.outputs, { type, content, timestamp: new Date() }],
    })),
  clearOutputs: () => set({ outputs: [] }),

  cronSchedule: "* * * * *",
  setCronSchedule: (cronSchedule) => set({ cronSchedule }),

  regions: ["iad1"],
  setRegions: (regions) => set({ regions }),

  mobileView: "editor",
  setMobileView: (mobileView) => set({ mobileView }),

  inspectedDeployment: null,
  inspectTab: "details",
  setInspectedDeployment: (inspectedDeployment) =>
    set({ inspectedDeployment, inspectTab: "details" }),
  setInspectTab: (inspectTab) => set({ inspectTab }),
}));
