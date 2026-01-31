"use client";

import { useState, useCallback } from "react";
import {
  useSession,
  useCodeExecution,
  useDeployments,
  useKeyboardShortcuts,
  type DeploymentState,
} from "@/hooks";
import { DEFAULT_CODE } from "@/lib/constants";
import type { Output } from "@/lib/types";

import { PlaygroundHeader } from "./header";
import { CodeEditorPanel } from "./code-editor-panel";
import { OutputPanel } from "./output-panel";
import { DeploymentsPanel } from "./deployments-panel";
import { FooterActions } from "./footer-actions";
import { DeploymentInspectSheet } from "./deployment-inspect-sheet";

type InspectTab = "details" | "logs";
type MobilePanel = "editor" | "output";

export default function Playground() {
  // Core state from hooks
  const {
    session,
    remainingTime,
    loading: sessionLoading,
    fetchSession,
    createSession,
    stopSandbox,
    saveSnapshot,
    restoreSnapshot,
    setSession,
  } = useSession();

  const { loading: execLoading, runCode, deployCode } = useCodeExecution();
  const { deployments, fetchDeployments, deleteDeployment } = useDeployments();

  // Local UI state
  const [code, setCode] = useState(DEFAULT_CODE);
  const [outputs, setOutputs] = useState<Output[]>([]);
  const [cronSchedule, setCronSchedule] = useState("* * * * *");
  const [regions, setRegions] = useState<string[]>(["iad1"]);
  const [inspectedDeployment, setInspectedDeployment] = useState<DeploymentState | null>(
    null
  );
  const [inspectTab, setInspectTab] = useState<InspectTab>("details");
  const [mobilePanel, setMobilePanel] = useState<MobilePanel>("editor");

  // Combine loading states
  const loading = sessionLoading || execLoading;

  // Output helper
  const addOutput = useCallback((type: Output["type"], content: string) => {
    setOutputs((prev) => [...prev, { type, content, timestamp: new Date() }]);
  }, []);

  // Action handlers
  const handleCreateSession = useCallback(async () => {
    setOutputs([]);
    addOutput("system", "Creating new sandbox...");

    const result = await createSession();
    if (result.success) {
      addOutput("system", `Sandbox created`);
    } else {
      addOutput("stderr", `Error: ${result.error}`);
    }
  }, [createSession, addOutput]);

  const handleRunCode = useCallback(async () => {
    if (!session || session.status !== "running") {
      addOutput("stderr", "No active session. Click 'New Session' first.");
      return;
    }

    addOutput("system", "Executing code...");

    await runCode(code, {
      onStdout: (data) => addOutput("stdout", data),
      onStderr: (data) => addOutput("stderr", data),
      onExit: (exitCode) => addOutput("system", `Exit code: ${exitCode}`),
      onError: (error) => {
        addOutput("stderr", `Error: ${error}`);
        if (error?.includes("expired") || error?.includes("No active")) {
          setSession((s) => (s ? { ...s, status: "stopped" } : null));
        }
      },
      onDone: () => fetchSession(),
    });
  }, [session, code, runCode, addOutput, fetchSession, setSession]);

  const handleDeployCode = useCallback(async () => {
    if (!session || session.status !== "running") {
      addOutput("stderr", "No active session. Click 'New Session' first.");
      return;
    }

    addOutput("system", "Building and deploying to Vercel Fluid Compute...");

    await deployCode(
      code,
      {
        functionName: "handler",
        cronSchedule: cronSchedule || undefined,
        regions: regions.length > 0 ? regions : undefined,
      },
      {
        onPhase: (phase) => addOutput("system", `--- ${phase.toUpperCase()} PHASE ---`),
        onLog: (log) => addOutput("stdout", log),
        onError: (error) => addOutput("stderr", error),
        onBuildDone: () => addOutput("system", "Build successful!"),
        onDeployDone: (data) => {
          addOutput("system", `Function URL: ${data.functionUrl}`);
          fetchDeployments();
        },
        onSnapshot: (data) => {
          setSession((s) =>
            s ? { ...s, status: "paused", snapshotId: data.id } : null
          );
        },
      }
    );
  }, [
    session,
    code,
    cronSchedule,
    regions,
    deployCode,
    addOutput,
    fetchDeployments,
    setSession,
  ]);

  const handlePause = useCallback(async () => {
    addOutput("system", "Creating snapshot...");
    const result = await saveSnapshot();
    if (result.success) {
      addOutput("system", `Snapshot saved: ${result.snapshotId}`);
      addOutput("system", "Session paused. Click 'Resume' to continue.");
    } else {
      addOutput("stderr", `Error: ${result.error}`);
    }
  }, [saveSnapshot, addOutput]);

  const handleResume = useCallback(async () => {
    addOutput("system", `Restoring from snapshot...`);
    const result = await restoreSnapshot();
    if (result.success) {
      addOutput("system", "Sandbox restored successfully!");
    } else {
      addOutput("stderr", `Error: ${result.error}`);
    }
  }, [restoreSnapshot, addOutput]);

  const handleStop = useCallback(async () => {
    addOutput("system", "Stopping sandbox...");
    const result = await stopSandbox();
    if (result.success) {
      addOutput("system", "Sandbox stopped. Session cleared.");
    } else {
      addOutput("stderr", `Error: ${result.error}`);
    }
  }, [stopSandbox, addOutput]);

  const handleDeleteDeployment = useCallback(
    async (id: string) => {
      const result = await deleteDeployment(id);
      if (result.success) {
        addOutput("system", `Deployment ${id.slice(0, 8)}... deleted`);
      } else {
        addOutput("stderr", `Delete failed: ${result.error}`);
      }
    },
    [deleteDeployment, addOutput]
  );

  const handleCopyUrl = useCallback(
    async (text: string) => {
      try {
        await navigator.clipboard.writeText(text);
        addOutput("system", "URL copied to clipboard");
      } catch {
        addOutput("stderr", "Failed to copy to clipboard");
      }
    },
    [addOutput]
  );

  const handleFormatCode = useCallback(async () => {
    try {
      // Lazy load Prettier (~500KB) only when formatting is requested
      const [prettier, prettierPluginTypescript, prettierPluginEstree] =
        await Promise.all([
          import("prettier/standalone"),
          import("prettier/plugins/typescript"),
          import("prettier/plugins/estree"),
        ]);

      const formatted = await prettier.format(code, {
        parser: "typescript",
        plugins: [prettierPluginTypescript, prettierPluginEstree],
        semi: true,
        singleQuote: false,
        tabWidth: 2,
        trailingComma: "es5",
      });
      setCode(formatted);
    } catch {
      addOutput("stderr", "Failed to format code - check for syntax errors");
    }
  }, [code, addOutput]);

  // Keyboard shortcuts
  useKeyboardShortcuts(
    {
      onNewSession: handleCreateSession,
      onRun: handleRunCode,
      onDeploy: handleDeployCode,
    },
    {
      disabled: loading !== null,
      sessionRunning: session?.status === "running",
    }
  );

  // Inspection sheet handlers
  const handleInspect = (deployment: DeploymentState) => {
    setInspectedDeployment(deployment);
    setInspectTab("details");
  };

  const handleCloseInspect = () => {
    setInspectedDeployment(null);
  };

  return (
    <div className="h-screen flex flex-col overflow-hidden bg-background text-foreground">
      <PlaygroundHeader
        session={session}
        remainingTime={remainingTime}
        loading={sessionLoading}
        onPause={handlePause}
        onResume={handleResume}
        onStop={handleStop}
        onRestart={handleCreateSession}
      />

      {/* Mobile Panel Tabs - visible only on mobile */}
      <div className="md:hidden shrink-0 flex border-b border-border">
        <button
          onClick={() => setMobilePanel("editor")}
          className={`flex-1 px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
            mobilePanel === "editor"
              ? "border-primary text-foreground"
              : "border-transparent text-muted-foreground"
          }`}
        >
          Editor
        </button>
        <button
          onClick={() => setMobilePanel("output")}
          className={`flex-1 px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
            mobilePanel === "output"
              ? "border-primary text-foreground"
              : "border-transparent text-muted-foreground"
          }`}
        >
          Output
        </button>
      </div>

      <main className="flex-1 flex flex-col md:flex-row min-h-0">
        {/* Code Editor - hidden on mobile when output tab is active */}
        <div className={`${mobilePanel === "editor" ? "flex" : "hidden"} md:flex w-full md:w-1/2 flex-col min-h-0`}>
          <CodeEditorPanel code={code} onChange={setCode} onFormat={handleFormatCode} />
        </div>

        {/* Output & Deployments - hidden on mobile when editor tab is active */}
        <div className={`${mobilePanel === "output" ? "flex" : "hidden"} md:flex w-full md:w-1/2 flex-col min-h-0`}>
          <OutputPanel outputs={outputs} onClear={() => setOutputs([])} />

          <DeploymentsPanel
            deployments={deployments}
            onRefresh={fetchDeployments}
            onCopyUrl={handleCopyUrl}
            onInspect={handleInspect}
            onDelete={handleDeleteDeployment}
          />
        </div>
      </main>

      <FooterActions
        loading={loading}
        sessionRunning={session?.status === "running"}
        remainingTime={remainingTime}
        cronSchedule={cronSchedule}
        regions={regions}
        onCronScheduleChange={setCronSchedule}
        onRegionsChange={setRegions}
        onNewSession={handleCreateSession}
        onRun={handleRunCode}
        onDeploy={handleDeployCode}
      />

      <DeploymentInspectSheet
        deployment={inspectedDeployment}
        activeTab={inspectTab}
        onTabChange={setInspectTab}
        onClose={handleCloseInspect}
        onCopyUrl={handleCopyUrl}
      />
    </div>
  );
}
