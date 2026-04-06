"use client";

import { useCallback, useEffect, useRef, useMemo } from "react";
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
    pauseSandbox,
    resumeSandbox,
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
    addOutput("system", "Starting sandbox...");

    const result = await createSession();
    if (result.success) {
      if (result.code) {
        setCode(result.code);
        addOutput("system", "Sandbox ready — code restored from saved state");
      } else {
        addOutput("system", "Sandbox ready (persistent environment)");
      }
    } else {
      addOutput("stderr", `Error: ${result.error}`);
    }
  }, [createSession, addOutput, clearOutputs, setCode]);

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
        onSnapshot: () => {
          // With persistent sandboxes, state auto-saves — no action needed
        },
      }
    );
  }, [session, code, cronSchedule, regions, deployCode, addOutput, fetchDeployments, setSession]);

  const handlePause = useCallback(async () => {
    addOutput("system", "Pausing sandbox...");
    const result = await pauseSandbox();
    if (result.success) {
      addOutput("system", "Sandbox paused. State saved automatically.");
      if (result.usage) {
        const cpuSec = (result.usage.activeCpuMs / 1000).toFixed(1);
        const transferMb = ((result.usage.egressBytes + result.usage.ingressBytes) / 1_048_576).toFixed(1);
        addOutput("system", `Session used ${cpuSec}s CPU, ${transferMb} MB transfer`);
      }
    } else {
      addOutput("stderr", `Error: ${result.error}`);
    }
  }, [pauseSandbox, addOutput]);

  const handleResume = useCallback(async () => {
    addOutput("system", "Resuming sandbox...");
    const result = await resumeSandbox();
    if (result.success) {
      if (result.code) {
        setCode(result.code);
        addOutput("system", "Sandbox resumed — code restored");
      } else {
        addOutput("system", "Sandbox resumed from saved state!");
      }
    } else {
      addOutput("stderr", `Error: ${result.error}`);
    }
  }, [resumeSandbox, addOutput, setCode]);

  const handleStop = useCallback(async () => {
    addOutput("system", "Stopping sandbox...");
    const result = await stopSandbox();
    if (result.success) {
      addOutput("system", "Sandbox stopped. Environment saved.");
      if (result.usage) {
        const cpuSec = (result.usage.activeCpuMs / 1000).toFixed(1);
        const transferMb = ((result.usage.egressBytes + result.usage.ingressBytes) / 1_048_576).toFixed(1);
        addOutput("system", `Session used ${cpuSec}s CPU, ${transferMb} MB transfer`);
      }
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

  // Debounced auto-save: write editor code to sandbox filesystem
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSavedCode = useRef<string>("");

  useEffect(() => {
    if (!session || session.status !== "running") return;
    if (code === lastSavedCode.current) return;

    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);

    saveTimerRef.current = setTimeout(async () => {
      try {
        await fetch("/api/save", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ code }),
        });
        lastSavedCode.current = code;
      } catch {
        // Silent fail — save is best-effort
      }
    }, 2000);

    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
  }, [code, session]);

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
