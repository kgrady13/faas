import { Sandbox } from "@vercel/sandbox";

// Store the active sandbox instance (may be lost across requests in dev mode)
let activeSandbox: Sandbox | null = null;

export async function createSandbox(snapshotId?: string): Promise<Sandbox> {
  // Stop existing sandbox if running
  if (activeSandbox) {
    try {
      await activeSandbox.stop();
    } catch {
      // Ignore errors when stopping
    }
    activeSandbox = null;
  }

  // Create new sandbox
  if (snapshotId) {
    activeSandbox = await Sandbox.create({
      source: { type: "snapshot", snapshotId },
    });
  } else {
    activeSandbox = await Sandbox.create({
      runtime: "node24",
    });
  }

  return activeSandbox;
}

// Get sandbox - reconnect using sandboxId if needed
export async function getOrReconnectSandbox(sandboxId: string): Promise<Sandbox> {
  // If we have an active sandbox with matching ID, use it
  if (activeSandbox && activeSandbox.sandboxId === sandboxId) {
    return activeSandbox;
  }

  // Otherwise reconnect to the sandbox using the ID
  activeSandbox = await Sandbox.get({ sandboxId });
  return activeSandbox;
}

export function getActiveSandbox(): Sandbox | null {
  return activeSandbox;
}

export async function stopSandbox(sandboxId?: string): Promise<void> {
  if (sandboxId) {
    // Reconnect and stop
    const sandbox = await getOrReconnectSandbox(sandboxId);
    await sandbox.stop();
    activeSandbox = null;
  } else if (activeSandbox) {
    await activeSandbox.stop();
    activeSandbox = null;
  }
}

export async function executeCode(
  code: string
): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  if (!activeSandbox) {
    throw new Error("No active sandbox");
  }

  // Write code to file using writeFiles
  await activeSandbox.writeFiles([
    {
      path: "/vercel/sandbox/script.js",
      content: Buffer.from(code, "utf-8"),
    },
  ]);

  // Execute the code using runCommand
  const result = await activeSandbox.runCommand("node", ["/vercel/sandbox/script.js"]);

  // stdout and stderr are async methods, not properties
  const [stdout, stderr] = await Promise.all([
    result.stdout(),
    result.stderr(),
  ]);

  return {
    stdout,
    stderr,
    exitCode: result.exitCode,
  };
}

// Streaming execution - returns an async generator of log events
export async function* executeCodeStreaming(
  code: string,
  sandboxId: string
): AsyncGenerator<{ type: "stdout" | "stderr" | "exit"; data: string }> {
  // Reconnect to the sandbox if needed
  const sandbox = await getOrReconnectSandbox(sandboxId);

  // Write code to file using writeFiles
  await sandbox.writeFiles([
    {
      path: "/vercel/sandbox/script.js",
      content: Buffer.from(code, "utf-8"),
    },
  ]);

  // Execute in detached mode to get streaming logs
  const command = await sandbox.runCommand({
    cmd: "node",
    args: ["/vercel/sandbox/script.js"],
    detached: true,
  });

  // Stream logs as they arrive
  for await (const log of command.logs()) {
    yield {
      type: log.stream,
      data: log.data,
    };
  }

  // Wait for command to finish and yield exit code
  const finished = await command.wait();
  yield {
    type: "exit",
    data: String(finished.exitCode),
  };
}

export async function createSnapshot(sandboxId: string): Promise<string> {
  // Reconnect to sandbox if needed
  const sandbox = await getOrReconnectSandbox(sandboxId);

  const snapshot = await sandbox.snapshot();
  // Sandbox stops after snapshot
  activeSandbox = null;
  return snapshot.snapshotId;
}

export function setActiveSandbox(sandbox: Sandbox | null): void {
  activeSandbox = sandbox;
}
