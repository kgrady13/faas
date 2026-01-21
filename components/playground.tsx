"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";

interface Session {
  sandboxId: string;
  status: "pending" | "running" | "stopping" | "stopped" | "failed";
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

const DEFAULT_CODE = `// Sandbox FaaS Demo - Run Node.js code in isolated microVMs

async function countdown(from = 5) {
  console.log(\`Starting countdown from \${from}...\`);

  for (let i = from; i > 0; i--) {
    console.log(\`  \${i}...\`);
    await new Promise(r => setTimeout(r, 200));
  }

  console.log('Liftoff!');
  return { counted: from, message: 'Countdown complete!' };
}

async function fetchData(url = 'https://jsonplaceholder.typicode.com/posts/1') {
  console.log(\`Fetching: \${url}\`);
  const response = await fetch(url);
  const data = await response.json();
  console.log('Response:', JSON.stringify(data, null, 2));
  return { status: response.status, data };
}

// Run the demos
await countdown(5);
await fetchData();
`;

export default function Playground() {
  const [code, setCode] = useState(DEFAULT_CODE);
  const [outputs, setOutputs] = useState<Output[]>([]);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState<string | null>(null);
  const [remainingTime, setRemainingTime] = useState<number>(0);
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

  useEffect(() => {
    fetchSession();
  }, [fetchSession]);

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
  }, [session?.status]);

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
          s ? { ...s, status: "stopped", snapshotId: data.snapshotId } : null
        );
        addOutput("system", `Snapshot saved: ${data.snapshotId}`);
        addOutput("system", "Sandbox stopped. Click 'Restore' to resume.");
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
      failed: "destructive",
    };

    return (
      <Badge variant={variants[session.status]}>
        {session.status.charAt(0).toUpperCase() + session.status.slice(1)}
        {session.status === "running" && remainingTime > 0 && (
          <span className="ml-1.5 tabular-nums">{formatTime(remainingTime)}</span>
        )}
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
              Snapshot: {session.snapshotId.slice(0, 12)}...
            </span>
          )}
          {getStatusBadge()}
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 flex min-h-0">
        {/* Code Editor */}
        <div className="w-1/2 border-r border-border flex flex-col min-h-0">
          <div className="shrink-0 px-3 py-2 border-b border-border text-sm text-muted-foreground">
            Code Editor
          </div>
          <Textarea
            value={code}
            onChange={(e) => setCode(e.target.value)}
            className="flex-1 rounded-none border-0 shadow-none resize-none focus-visible:ring-0 font-mono text-sm min-h-0 overflow-auto"
            placeholder="Write your Node.js code here..."
            spellCheck={false}
          />
        </div>

        {/* Output Panel */}
        <div className="w-1/2 flex flex-col min-h-0">
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
                  className={`whitespace-pre-wrap ${
                    output.type === "stderr"
                      ? "text-destructive"
                      : output.type === "system"
                      ? "text-primary"
                      : "text-foreground"
                  }`}
                >
                  {output.type === "system" ? `> ${output.content}` : output.content}
                </div>
              ))
            )}
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

        <Button
          variant="secondary"
          onClick={saveSnapshot}
          disabled={loading !== null || session?.status !== "running"}
        >
          {loading === "snapshot" ? "Saving..." : "Save Environment"}
        </Button>

        <Button
          variant="secondary"
          onClick={restoreSnapshot}
          disabled={loading !== null || !session?.snapshotId}
        >
          {loading === "restore" ? "Restoring..." : "Restore"}
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
