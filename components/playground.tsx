"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import Ansi from "ansi-to-react";
import * as prettier from "prettier/standalone";
import * as prettierPluginTypescript from "prettier/plugins/typescript";
import * as prettierPluginEstree from "prettier/plugins/estree";
import Editor from "@monaco-editor/react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Combobox,
  ComboboxInput,
  ComboboxContent,
  ComboboxList,
  ComboboxItem,
  ComboboxEmpty,
} from "@/components/ui/combobox";

interface Session {
  sandboxId: string;
  status: "pending" | "running" | "stopping" | "stopped" | "paused" | "failed";
  timeout: number;
  snapshotId?: string;
  remainingTime: number;
  isActive?: boolean;
}

interface Output {
  type: "stdout" | "stderr" | "system";
  content: string;
  timestamp: Date;
}

interface Deployment {
  id: string;
  url: string;
  functionName: string;
  functionUrl: string;
  status: "building" | "queued" | "ready" | "error" | "canceled";
  cronSchedule?: string;
  createdAt: string;
  errorMessage?: string;
}

const CRON_PRESETS = [
  { value: "", label: "No schedule" },
  { value: "* * * * *", label: "1 minute" },
  { value: "*/5 * * * *", label: "5 minutes" },
  { value: "*/15 * * * *", label: "15 minutes" },
  { value: "0 * * * *", label: "Hourly" },
  { value: "0 */6 * * *", label: "6 hours" },
  { value: "0 0 * * *", label: "Daily (midnight)" },
  { value: "0 9 * * *", label: "Daily (9am)" },
  { value: "0 0 * * 0", label: "Weekly (Sunday)" },
  { value: "0 0 1 * *", label: "Monthly (1st)" },
];

const DEFAULT_CODE = `// Web Standard Function Handler
// Click "Run" to test, "Deploy" for Vercel Fluid Compute

console.log("Hello World");

export default async function handler(req: Request): Promise<Response> {
  // Use base URL for relative paths (Vercel passes relative URLs)
  const url = new URL(req.url, "http://localhost");

  console.log("Hello From Handler");

  if (req.method === "GET") {
    return new Response(JSON.stringify({
      message: "Hello from Vercel Fluid Compute!",
      timestamp: new Date().toISOString(),
      path: url.pathname,
    }), {
      headers: { "Content-Type": "application/json" }
    });
  }

  if (req.method === "POST") {
    const body = await req.json();
    return new Response(JSON.stringify({
      received: body,
      processed: true,
    }), {
      headers: { "Content-Type": "application/json" }
    });
  }

  return new Response("Method not allowed", { status: 405 });
}
`;

export default function Playground() {
  const [code, setCode] = useState(DEFAULT_CODE);
  const [outputs, setOutputs] = useState<Output[]>([]);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState<string | null>(null);
  const [remainingTime, setRemainingTime] = useState<number>(0);
  const [deployments, setDeployments] = useState<Deployment[]>([]);
  const [cronSchedule, setCronSchedule] = useState("");
  const outputRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom when new output arrives
  useEffect(() => {
    if (outputRef.current) {
      outputRef.current.scrollTop = outputRef.current.scrollHeight;
    }
  }, [outputs]);

  const addOutput = (type: Output["type"], content: string) => {
    setOutputs((prev) => [...prev, { type, content, timestamp: new Date() }]);
  };

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

  useEffect(() => {
    fetchSession();
    fetchDeployments();
  }, [fetchSession, fetchDeployments]);

  // Poll deployments for status updates
  useEffect(() => {
    const hasPendingDeployments = deployments.some(
      d => d.status === "building" || d.status === "queued"
    );

    if (!hasPendingDeployments) return;

    const interval = setInterval(fetchDeployments, 5000);
    return () => clearInterval(interval);
  }, [deployments, fetchDeployments]);

  // Update remaining time countdown
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

  const createSession = async () => {
    setLoading("create");
    setOutputs([]);
    addOutput("system", "Creating new sandbox...");

    try {
      const res = await fetch("/api/session", { method: "POST" });
      const data = await res.json();

      if (data.success) {
        setSession(data.session);
        setRemainingTime(data.session.remainingTime);
        addOutput("system", `Sandbox created: ${data.session.sandboxId}`);
      } else {
        addOutput("stderr", `Error: ${data.error}`);
      }
    } catch (error) {
      addOutput("stderr", `Failed to create session: ${error}`);
    } finally {
      setLoading(null);
    }
  };

  const runCode = async () => {
    if (!session || session.status !== "running") {
      addOutput("stderr", "No active session. Click 'New Session' first.");
      return;
    }

    setLoading("run");
    addOutput("system", "Executing code...");

    try {
      const res = await fetch("/api/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code }),
      });

      // Check if response is SSE stream or JSON error
      const contentType = res.headers.get("content-type");
      if (contentType?.includes("application/json")) {
        // Error response
        const data = await res.json();
        addOutput("stderr", `Error: ${data.error}`);
        if (data.error?.includes("expired") || data.error?.includes("No active")) {
          setSession((s) => (s ? { ...s, status: "stopped" } : null));
        }
        return;
      }

      // Read SSE stream
      const reader = res.body?.getReader();
      if (!reader) {
        addOutput("stderr", "Failed to read response stream");
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

              if (event.type === "stdout") {
                addOutput("stdout", event.data);
              } else if (event.type === "stderr") {
                addOutput("stderr", event.data);
              } else if (event.type === "exit") {
                addOutput("system", `Exit code: ${event.data}`);
              } else if (event.type === "error") {
                addOutput("stderr", `Error: ${event.data}`);
              } else if (event.type === "done") {
                // Refresh session to get updated timeout
                await fetchSession();
              }
            } catch {
              // Ignore JSON parse errors
            }
          }
        }
      }
    } catch (error) {
      addOutput("stderr", `Execution failed: ${error}`);
    } finally {
      setLoading(null);
    }
  };

  const deployCode = async () => {
    if (!session || session.status !== "running") {
      addOutput("stderr", "No active session. Click 'New Session' first.");
      return;
    }

    setLoading("deploy");
    addOutput("system", "Building and deploying to Vercel Fluid Compute...");

    try {
      const res = await fetch("/api/deploy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code,
          functionName: "handler",
          cronSchedule: cronSchedule || undefined,
        }),
      });

      // Check if response is SSE stream or JSON error
      const contentType = res.headers.get("content-type");
      if (contentType?.includes("application/json")) {
        const data = await res.json();
        addOutput("stderr", `Error: ${data.error}`);
        return;
      }

      // Read SSE stream
      const reader = res.body?.getReader();
      if (!reader) {
        addOutput("stderr", "Failed to read response stream");
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

              if (event.type === "phase") {
                addOutput("system", `--- ${event.data.toUpperCase()} PHASE ---`);
              } else if (event.type === "log") {
                addOutput("stdout", event.data);
              } else if (event.type === "error") {
                addOutput("stderr", event.data);
              } else if (event.type === "build_done") {
                addOutput("system", "Build successful!");
              } else if (event.type === "deploy_done") {
                addOutput("system", `Function URL: ${event.data.functionUrl}`);
                await fetchDeployments();
              } else if (event.type === "snapshot") {
                setSession((s) =>
                  s ? { ...s, status: "paused", snapshotId: event.data.id } : null
                );
              }
            } catch {
              // Ignore JSON parse errors
            }
          }
        }
      }
    } catch (error) {
      addOutput("stderr", `Deployment failed: ${error}`);
    } finally {
      setLoading(null);
    }
  };

  const deleteDeployment = async (id: string) => {
    try {
      const res = await fetch(`/api/deployments/${id}`, { method: "DELETE" });
      const data = await res.json();

      if (data.success) {
        addOutput("system", `Deployment ${id.slice(0, 8)}... deleted`);
        await fetchDeployments();
      } else {
        addOutput("stderr", `Delete failed: ${data.error}`);
      }
    } catch (error) {
      addOutput("stderr", `Delete failed: ${error}`);
    }
  };

  const copyToClipboard = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      addOutput("system", "URL copied to clipboard");
    } catch {
      addOutput("stderr", "Failed to copy to clipboard");
    }
  };

  const saveSnapshot = async () => {
    if (!session || session.status !== "running") {
      addOutput("stderr", "No active session to snapshot.");
      return;
    }

    setLoading("snapshot");
    addOutput("system", "Creating snapshot...");

    try {
      const res = await fetch("/api/snapshot", { method: "POST" });
      const data = await res.json();

      if (data.success) {
        setSession((s) =>
          s ? { ...s, status: "paused", snapshotId: data.snapshotId } : null
        );
        addOutput("system", `Snapshot saved: ${data.snapshotId}`);
        addOutput("system", "Session paused. Click 'Resume' to continue.");
      } else {
        addOutput("stderr", `Error: ${data.error}`);
      }
    } catch (error) {
      addOutput("stderr", `Snapshot failed: ${error}`);
    } finally {
      setLoading(null);
    }
  };

  const restoreSnapshot = async () => {
    if (!session?.snapshotId) {
      addOutput("stderr", "No snapshot available to restore.");
      return;
    }

    setLoading("restore");
    addOutput("system", `Restoring from snapshot: ${session.snapshotId}...`);

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
        addOutput("system", "Sandbox restored successfully!");
      } else {
        addOutput("stderr", `Error: ${data.error}`);
      }
    } catch (error) {
      addOutput("stderr", `Restore failed: ${error}`);
    } finally {
      setLoading(null);
    }
  };

  const stopSandbox = async () => {
    if (!session) {
      addOutput("stderr", "No active session to stop.");
      return;
    }

    setLoading("stop");
    addOutput("system", "Stopping sandbox...");

    try {
      const res = await fetch("/api/stop", { method: "POST" });
      const data = await res.json();

      if (data.success) {
        setSession(null);
        setRemainingTime(0);
        addOutput("system", "Sandbox stopped. Session cleared.");
      } else {
        addOutput("stderr", `Error: ${data.error}`);
      }
    } catch (error) {
      addOutput("stderr", `Stop failed: ${error}`);
    } finally {
      setLoading(null);
    }
  };

  const formatCode = async () => {
    try {
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
  };

  const formatTime = (ms: number) => {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${minutes}:${secs.toString().padStart(2, "0")}`;
  };

  const getStatusBadge = () => {
    if (!session) {
      return <Badge variant="outline">No Session</Badge>;
    }

    const variants: Record<Session["status"], "default" | "secondary" | "destructive" | "outline"> = {
      pending: "secondary",
      running: "default",
      stopping: "secondary",
      stopped: "destructive",
      paused: "outline",
      failed: "destructive",
    };

    // Special styling for paused state (yellow/warning)
    if (session.status === "paused") {
      return (
        <Badge variant="outline" className="border-yellow-500 text-yellow-600 dark:text-yellow-400">
          Paused
        </Badge>
      );
    }

    return (
      <Badge variant={variants[session.status]}>
        {session.status.charAt(0).toUpperCase() + session.status.slice(1)}
        {session.status === "running" && remainingTime > 0 && (
          <span className="ml-1.5 tabular-nums">{formatTime(remainingTime)}</span>
        )}
      </Badge>
    );
  };

  const getDeploymentStatusBadge = (status: Deployment["status"]) => {
    const variants: Record<Deployment["status"], "default" | "secondary" | "destructive" | "outline"> = {
      ready: "default",
      building: "secondary",
      queued: "secondary",
      error: "destructive",
      canceled: "outline",
    };

    return (
      <Badge variant={variants[status]} className="text-xs">
        {status}
      </Badge>
    );
  };

  return (
    <div className="h-screen flex flex-col overflow-hidden bg-background text-foreground">
      {/* Header */}
      <header className="shrink-0 border-b border-border px-4 py-3 flex items-center justify-between">
        <h1 className="text-lg font-semibold">Sandbox FaaS</h1>
        <div className="flex items-center gap-3">
          {session?.snapshotId && (
            <span className="text-xs text-muted-foreground">
              {session.snapshotId.slice(0, 12)}...
            </span>
          )}
          {session?.status === "running" && (
            <>
              <Button
                variant="outline"
                size="sm"
                onClick={saveSnapshot}
                disabled={loading !== null}
              >
                {loading === "snapshot" ? "Pausing..." : "Pause"}
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={stopSandbox}
                disabled={loading !== null}
                className="text-destructive hover:text-destructive"
              >
                {loading === "stop" ? "Stopping..." : "Stop"}
              </Button>
            </>
          )}
          {session?.status === "paused" && (
            <>
              <Button
                variant="outline"
                size="sm"
                onClick={restoreSnapshot}
                disabled={loading !== null}
              >
                {loading === "restore" ? "Resuming..." : "Resume"}
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={stopSandbox}
                disabled={loading !== null}
                className="text-destructive hover:text-destructive"
              >
                {loading === "stop" ? "Stopping..." : "Stop"}
              </Button>
            </>
          )}
          {getStatusBadge()}
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 flex min-h-0">
        {/* Code Editor */}
        <div className="w-1/2 border-r border-border flex flex-col min-h-0">
          <div className="shrink-0 px-3 py-2 border-b border-border text-sm text-muted-foreground flex items-center justify-between">
            <span>Code Editor</span>
            <Button
              variant="ghost"
              size="xs"
              onClick={formatCode}
            >
              Format
            </Button>
          </div>
          <Editor
            height="100%"
            defaultLanguage="typescript"
            value={code}
            onChange={(value) => setCode(value || "")}
            theme="light"
            options={{
              minimap: { enabled: false },
              fontSize: 14,
              lineNumbers: "on",
              scrollBeyondLastLine: false,
              automaticLayout: true,
              tabSize: 2,
              wordWrap: "on",
              padding: { top: 16 },
            }}
          />
        </div>

        {/* Output and Deployments Panel */}
        <div className="w-1/2 flex flex-col min-h-0">
          {/* Output Panel */}
          <div className="flex-1 flex flex-col min-h-0 border-b border-border">
            <div className="shrink-0 px-3 py-2 border-b border-border text-sm text-muted-foreground flex items-center justify-between">
              <span>Output</span>
              <Button
                variant="ghost"
                size="xs"
                onClick={() => setOutputs([])}
              >
                Clear
              </Button>
            </div>
            <div ref={outputRef} className="flex-1 min-h-0 p-4 font-mono text-sm overflow-auto bg-muted/30">
              {outputs.length === 0 ? (
                <span className="text-muted-foreground">
                  Output will appear here...
                </span>
              ) : (
                outputs.map((output, i) => (
                  <div
                    key={i}
                    className={`whitespace-pre-wrap ${output.type === "stderr"
                      ? "text-destructive"
                      : output.type === "system"
                        ? "text-primary"
                        : "text-foreground"
                      }`}
                  >
                    {output.type === "system" ? (
                      `> ${output.content}`
                    ) : (
                      <Ansi useClasses>{output.content}</Ansi>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Deployments Panel */}
          <div className="h-48 shrink-0 flex flex-col">
            <div className="shrink-0 px-3 py-2 border-b border-border text-sm text-muted-foreground flex items-center justify-between">
              <span>Deployed Functions ({deployments.length})</span>
              <Button
                variant="ghost"
                size="xs"
                onClick={fetchDeployments}
              >
                Refresh
              </Button>
            </div>
            <div className="flex-1 overflow-auto">
              {deployments.length === 0 ? (
                <div className="p-4 text-sm text-muted-foreground">
                  No deployments yet. Build and deploy your code to see them here.
                </div>
              ) : (
                <div className="divide-y divide-border">
                  {deployments.map((deployment) => (
                    <div key={deployment.id} className="p-3 flex items-center gap-3 text-sm">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-medium truncate">
                            {deployment.functionName}
                          </span>
                          {getDeploymentStatusBadge(deployment.status)}
                          {deployment.cronSchedule && (
                            <span className="text-xs text-muted-foreground">
                              cron: {deployment.cronSchedule}
                            </span>
                          )}
                        </div>
                        {deployment.status === "ready" && (
                          <div className="text-xs text-muted-foreground truncate mt-0.5">
                            {deployment.functionUrl}
                          </div>
                        )}
                        {deployment.errorMessage && (
                          <div className="text-xs text-destructive mt-0.5">
                            {deployment.errorMessage}
                          </div>
                        )}
                      </div>
                      <div className="flex items-center gap-1">
                        {deployment.status === "ready" && (
                          <Button
                            variant="ghost"
                            size="xs"
                            onClick={() => copyToClipboard(deployment.functionUrl)}
                          >
                            Copy
                          </Button>
                        )}
                        <Button
                          variant="ghost"
                          size="xs"
                          onClick={() => deleteDeployment(deployment.id)}
                        >
                          Delete
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </main>

      {/* Footer Actions */}
      <footer className="shrink-0 border-t border-border px-4 py-3 flex items-center gap-2">
        <Button
          variant="outline"
          onClick={createSession}
          disabled={loading !== null}
        >
          {loading === "create" ? "Creating..." : "New Session"}
        </Button>

        <Button
          onClick={runCode}
          disabled={loading !== null || session?.status !== "running"}
        >
          {loading === "run" ? "Running..." : "Run"}
        </Button>

        <div className="w-px h-6 bg-border mx-1" />

        <Button
          onClick={deployCode}
          disabled={loading !== null || session?.status !== "running"}
        >
          {loading === "deploy" ? "Deploying..." : "Deploy"}
        </Button>

        <Combobox value={cronSchedule} onValueChange={(value) => setCronSchedule(value ?? "")}>
          <ComboboxInput
            placeholder="Cron schedule"
            className="w-44 h-8 text-sm"
          />
          <ComboboxContent side="top" className="text-xs">
            <ComboboxList>
              <ComboboxEmpty className="justify-start pl-2">Custom expression</ComboboxEmpty>
              {CRON_PRESETS.map((preset) => (
                <ComboboxItem
                  key={preset.value || "none"}
                  value={preset.value}
                  className="whitespace-nowrap pr-2 text-xs aria-selected:bg-foreground aria-selected:text-background **:data-[slot=combobox-item-indicator]:hidden"
                >
                  {preset.label}
                </ComboboxItem>
              ))}
            </ComboboxList>
          </ComboboxContent>
        </Combobox>

        <div className="w-px h-6 bg-border mx-1" />

        <Button
          variant="secondary"
          onClick={saveSnapshot}
          disabled={loading !== null || session?.status !== "running"}
        >
          {loading === "snapshot" ? "Saving..." : "Pause"}
        </Button>

        <Button
          variant="secondary"
          onClick={restoreSnapshot}
          disabled={loading !== null || !session?.snapshotId}
        >
          {loading === "restore" ? "Resuming..." : "Resume"}
        </Button>

        <Button
          variant="destructive"
          onClick={stopSandbox}
          disabled={loading !== null || !session || session.status === "stopped"}
        >
          {loading === "stop" ? "Stopping..." : "Stop"}
        </Button>

        {remainingTime > 0 && remainingTime < 60000 && session?.status === "running" && (
          <span className="ml-auto text-sm text-destructive">
            Warning: Session expires soon!
          </span>
        )}
      </footer>
    </div>
  );
}
