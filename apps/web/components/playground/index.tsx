"use client";

import { useCallback, useEffect, useRef } from "react";
import {
  useSession,
  useCodeExecution,
  useDeployments,
  useKeyboardShortcuts,
  useUsage,
} from "@/hooks";
import { DEFAULT_CODE } from "@/lib/constants";
import { usePlaygroundStore } from "@/lib/store/playground-store";

import { PlaygroundHeader } from "./header";
import { CodeEditorPanel } from "./code-editor-panel";
import { OutputPanel } from "./output-panel";
import { DeploymentsPanel } from "./deployments-panel";
import { FooterActions } from "./footer-actions";
import { DeploymentInspectSheet } from "./deployment-inspect-sheet";

export default function Playground() {
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
  const { usage, loading: usageLoading, fetchUsage } = useUsage();

  // Store
  const code = usePlaygroundStore((s) => s.code);
  const setCode = usePlaygroundStore((s) => s.setCode);
  const addOutput = usePlaygroundStore((s) => s.addOutput);
  const clearOutputs = usePlaygroundStore((s) => s.clearOutputs);
  const cronSchedule = usePlaygroundStore((s) => s.cronSchedule);
  const regions = usePlaygroundStore((s) => s.regions);
  const mobileView = usePlaygroundStore((s) => s.mobileView);
  const inspectedDeployment = usePlaygroundStore((s) => s.inspectedDeployment);
  const inspectTab = usePlaygroundStore((s) => s.inspectTab);
  const setInspectedDeployment = usePlaygroundStore((s) => s.setInspectedDeployment);
  const setInspectTab = usePlaygroundStore((s) => s.setInspectTab);

  // Initialize default code once
  const initialized = useRef(false);
  useEffect(() => {
    if (!initialized.current) {
      initialized.current = true;
      setCode(DEFAULT_CODE);
      fetchUsage();
    }
  }, [setCode, fetchUsage]);

  // Combine loading states
  const loading = sessionLoading || execLoading;

  // Action handlers
  const handleCreateSession = useCallback(async () => {
    clearOutputs();
    addOutput("system", "Creating new sandbox...");

    const result = await createSession();
    if (result.success) {
      addOutput("system", "Sandbox created");
    } else {
      addOutput("stderr", `Error: ${result.error}`);
    }
  }, [createSession, addOutput, clearOutputs]);

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
  }, [session, code, cronSchedule, regions, deployCode, addOutput, fetchDeployments, setSession]);

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
    addOutput("system", "Restoring from snapshot...");
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
  }, [code, addOutput, setCode]);

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

      <main className="flex-1 flex flex-col md:flex-row min-h-0">
        <CodeEditorPanel onFormat={handleFormatCode} />

        <div className={`w-full md:w-1/2 flex flex-col min-h-0 flex-1 md:flex-initial ${mobileView === "editor" ? "hidden md:flex" : "flex"}`}>
          <OutputPanel />

          <DeploymentsPanel
            deployments={deployments}
            onRefresh={fetchDeployments}
            onCopyUrl={handleCopyUrl}
            onDelete={handleDeleteDeployment}
            usage={usage}
            usageLoading={usageLoading}
            onRefreshUsage={() => fetchUsage()}
          />
        </div>
      </main>

      <FooterActions
        loading={loading}
        sessionRunning={session?.status === "running"}
        remainingTime={remainingTime}
        onNewSession={handleCreateSession}
        onRun={handleRunCode}
        onDeploy={handleDeployCode}
      />

      <DeploymentInspectSheet
        deployment={inspectedDeployment}
        activeTab={inspectTab}
        onTabChange={setInspectTab}
        onClose={() => setInspectedDeployment(null)}
        onCopyUrl={handleCopyUrl}
      />
    </div>
  );
}
