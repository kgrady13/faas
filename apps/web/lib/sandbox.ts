import { Sandbox } from "@vercel/sandbox";

// Store the active sandbox instance (may be lost across requests in dev mode)
let activeSandbox: Sandbox | null = null;

// Track if SDK has been installed in the current sandbox
const sdkInstalledSandboxes = new Set<string>();

// SDK bundle inlined at build time (avoids filesystem reads in serverless)
const SDK_BUNDLE = `// @faas/sdk
class Worker {
  capabilities = [];
  addCapability(capability) {
    this.capabilities.push(capability);
    return this;
  }
  getCapabilities() {
    return [...this.capabilities];
  }
  getCapability(name) {
    return this.capabilities.find((c) => c.name === name);
  }
  hasCapability(name) {
    return this.capabilities.some((c) => c.name === name);
  }
  async fetch(request) {
    const url = new URL(request.url, "http://localhost");
    const path = url.pathname;
    const method = request.method;
    if (method === "GET" && (path === "/" || path === "")) {
      return Response.json({
        capabilities: this.capabilities.map((c) => ({
          type: c.type,
          name: c.name,
          description: c.description
        }))
      });
    }
    const match = path.match(/^\\/(skill|sync|automation)\\/(.+)$/);
    if (!match) {
      return Response.json({ error: "Not found", path }, { status: 404 });
    }
    const [, type, name] = match;
    const capability = this.capabilities.find((c) => c.type === type && c.name === name);
    if (!capability) {
      return Response.json({ error: \`Capability not found: \${type}/\${name}\` }, { status: 404 });
    }
    try {
      if (capability.type === "skill") {
        const input = method === "POST" ? await request.json() : {};
        const result = await capability.execute(input);
        return Response.json({ success: true, result });
      }
      if (capability.type === "sync") {
        await capability.sync();
        return Response.json({ success: true });
      }
      if (capability.type === "automation") {
        const event = await request.json();
        await capability.run(event);
        return Response.json({ success: true });
      }
      return Response.json({ error: "Unknown capability type" }, { status: 400 });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      return Response.json({ error: message }, { status: 500 });
    }
  }
}
function createWorker() {
  return new Worker;
}
export {
  createWorker,
  Worker
};`;

const SDK_TYPES = `export interface Capability {
  name: string;
  description?: string;
}
export interface SyncCapability extends Capability {
  type: "sync";
  sync: () => Promise<void>;
}
export interface AutomationCapability extends Capability {
  type: "automation";
  trigger: "page_changed" | "database_changed";
  run: (event: AutomationEvent) => Promise<void>;
}
export interface SkillCapability<TInput = any, TOutput = any> extends Capability {
  type: "skill";
  execute: (input: TInput) => Promise<TOutput>;
}
export type WorkerCapability = SyncCapability | AutomationCapability | SkillCapability<any, any>;
export interface AutomationEvent {
  type: "page_changed" | "database_changed";
  targetId: string;
  timestamp: string;
  metadata?: Record<string, unknown>;
}
export declare class Worker {
  addCapability(capability: WorkerCapability): this;
  getCapabilities(): WorkerCapability[];
  getCapability(name: string): WorkerCapability | undefined;
  hasCapability(name: string): boolean;
  fetch(request: Request): Promise<Response>;
}
export declare function createWorker(): Worker;`;

const SDK_PACKAGE_JSON = JSON.stringify({
  name: "@faas/sdk",
  version: "0.0.1",
  type: "module",
  main: "dist/index.js",
  types: "dist/index.d.ts",
});

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
export async function getOrReconnectSandbox(
  sandboxId: string,
): Promise<Sandbox> {
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
  code: string,
): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  if (!activeSandbox) {
    throw new Error("No active sandbox");
  }

  const sandboxId = activeSandbox.sandboxId;

  // Ensure Bun is installed
  await installBun(sandboxId);

  // Ensure SDK is available
  await ensureSdk(sandboxId);

  // Create source directory
  await activeSandbox.runCommand("mkdir", ["-p", "/tmp/src"]);

  // Write code to /tmp/src/handler.ts
  await activeSandbox.writeFiles([
    {
      path: "/tmp/src/handler.ts",
      content: Buffer.from(code, "utf-8"),
    },
  ]);

  // Execute with Bun using dynamic import to prevent auto-server behavior
  const result = await activeSandbox.runCommand("sh", [
    "-c",
    `export PATH="$HOME/.bun/bin:$PATH" && cd /tmp && bun -e "await import('./src/handler.ts')"`,
  ]);

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
  sandboxId: string,
): AsyncGenerator<{ type: "stdout" | "stderr" | "exit"; data: string }> {
  // Reconnect to the sandbox if needed
  const sandbox = await getOrReconnectSandbox(sandboxId);

  // Ensure Bun is installed for running code
  const installResult = await installBun(sandboxId);
  if (!installResult.success) {
    yield { type: "stderr", data: "Failed to install Bun runtime" };
    yield { type: "exit", data: "1" };
    return;
  }

  // Ensure SDK is available in the sandbox
  await ensureSdk(sandboxId);

  // Create source directory
  await sandbox.runCommand("mkdir", ["-p", "/tmp/src"]);

  // Write code to /tmp/src/handler.ts (same location as build for consistency)
  await sandbox.writeFiles([
    {
      path: "/tmp/src/handler.ts",
      content: Buffer.from(code, "utf-8"),
    },
  ]);

  // Execute with Bun using --bun flag to prevent auto-server behavior
  // We import the module which runs top-level code but doesn't start a server
  const command = await sandbox.runCommand({
    cmd: "sh",
    args: [
      "-c",
      `export PATH="$HOME/.bun/bin:$PATH" && cd /tmp && bun -e "await import('./src/handler.ts')"`,
    ],
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

// SDK installation helpers

/**
 * Ensure the @faas/sdk is available in the sandbox's node_modules.
 * Uses inlined SDK content (no filesystem reads) for serverless compatibility.
 */
export async function ensureSdk(sandboxId: string): Promise<void> {
  // Skip if already installed in this sandbox
  if (sdkInstalledSandboxes.has(sandboxId)) {
    return;
  }

  const sandbox = await getOrReconnectSandbox(sandboxId);

  // Create node_modules structure in sandbox at /tmp
  await sandbox.runCommand("mkdir", [
    "-p",
    "/tmp/node_modules/@faas/sdk/dist",
  ]);

  // Write inlined SDK files to sandbox
  await sandbox.writeFiles([
    {
      path: "/tmp/node_modules/@faas/sdk/dist/index.js",
      content: Buffer.from(SDK_BUNDLE, "utf-8"),
    },
    {
      path: "/tmp/node_modules/@faas/sdk/dist/index.d.ts",
      content: Buffer.from(SDK_TYPES, "utf-8"),
    },
    {
      path: "/tmp/node_modules/@faas/sdk/package.json",
      content: Buffer.from(SDK_PACKAGE_JSON, "utf-8"),
    },
  ]);

  // Mark as installed
  sdkInstalledSandboxes.add(sandboxId);
}

// Build-related helpers for Bun bundling

/**
 * Install Bun in the sandbox if not already installed
 * Uses the official Bun install script via curl
 */
export async function installBun(
  sandboxId: string,
): Promise<{ success: boolean; logs: string[] }> {
  const sandbox = await getOrReconnectSandbox(sandboxId);
  const logs: string[] = [];

  // Check if Bun is already installed (check both common locations)
  logs.push("Checking for existing Bun installation...");

  const checkResult = await sandbox.runCommand("sh", [
    "-c",
    'export PATH="$HOME/.bun/bin:$PATH" && which bun',
  ]);

  if (checkResult.exitCode === 0) {
    const bunPath = await checkResult.stdout();
    logs.push(`Bun already installed at ${bunPath.trim()}`);
    return { success: true, logs };
  }

  // Install Bun using official install script
  logs.push("Bun not found, installing via curl (this may take a moment)...");

  const installResult = await sandbox.runCommand("sh", [
    "-c",
    'curl -fsSL https://bun.sh/install | bash',
  ]);

  const stdout = await installResult.stdout();
  const stderr = await installResult.stderr();

  if (stdout) logs.push(stdout);
  if (stderr) logs.push(stderr);

  if (installResult.exitCode !== 0) {
    logs.push(`Bun installation failed with exit code ${installResult.exitCode}`);
    return { success: false, logs };
  }

  // Verify installation
  logs.push("Verifying Bun installation...");
  const verifyResult = await sandbox.runCommand("sh", [
    "-c",
    'export PATH="$HOME/.bun/bin:$PATH" && bun --version',
  ]);

  if (verifyResult.exitCode === 0) {
    const version = await verifyResult.stdout();
    logs.push(`Bun ${version.trim()} installed successfully`);
  }

  return {
    success: installResult.exitCode === 0,
    logs,
  };
}

/**
 * Build/bundle user code using Bun in the sandbox
 * Bun handles TypeScript natively and produces ESM output for Bun runtime
 */
export async function* buildCode(
  code: string,
  sandboxId: string,
): AsyncGenerator<{ type: "log" | "error" | "done"; data: string }> {
  yield { type: "log", data: "Connecting to sandbox..." };
  const sandbox = await getOrReconnectSandbox(sandboxId);

  // Ensure build directories exist
  yield { type: "log", data: "Creating build directories..." };
  await sandbox.runCommand("mkdir", ["-p", "/tmp/src", "/tmp/dist"]);

  // Ensure SDK is available for bundling
  yield { type: "log", data: "Setting up @faas/sdk..." };
  await ensureSdk(sandboxId);
  yield { type: "log", data: "SDK ready" };

  // Write user code to source file
  yield { type: "log", data: "Writing source code..." };
  await sandbox.writeFiles([
    {
      path: "/tmp/src/handler.ts",
      content: Buffer.from(code, "utf-8"),
    },
  ]);

  yield { type: "log", data: "Source code written to /tmp/src/handler.ts" };

  // Install Bun if needed
  yield { type: "log", data: "Checking Bun runtime..." };
  const installResult = await installBun(sandboxId);
  for (const log of installResult.logs) {
    yield { type: "log", data: log };
  }

  if (!installResult.success) {
    yield { type: "error", data: "Failed to install Bun" };
    return;
  }

  // Run Bun build to bundle the code
  // --target=bun: Optimizes for Bun runtime (default ESM output)
  // Bun handles TypeScript natively - no transpilation step needed
  yield { type: "log", data: "Running bun build..." };

  // Use full path to bun since curl installs to ~/.bun/bin
  const buildCommand = await sandbox.runCommand({
    cmd: "sh",
    args: [
      "-c",
      'export PATH="$HOME/.bun/bin:$PATH" && bun build /tmp/src/handler.ts --outfile=/tmp/dist/index.js --target=bun',
    ],
    detached: true,
  });

  // Stream build logs
  for await (const log of buildCommand.logs()) {
    yield { type: log.stream === "stderr" ? "error" : "log", data: log.data };
  }

  const result = await buildCommand.wait();

  if (result.exitCode !== 0) {
    yield {
      type: "error",
      data: `Build failed with exit code ${result.exitCode}`,
    };
    return;
  }

  yield { type: "log", data: "Build completed successfully!" };
  yield { type: "done", data: "/tmp/dist/index.js" };
}

/**
 * Read the bundled code from the sandbox
 */
export async function readBundledCode(sandboxId: string): Promise<string> {
  const sandbox = await getOrReconnectSandbox(sandboxId);

  // Use cat to read the file content since readFile returns a stream
  const result = await sandbox.runCommand("cat", ["/tmp/dist/index.js"]);

  if (result.exitCode !== 0) {
    throw new Error("Bundled code not found. Run build first.");
  }

  const content = await result.stdout();
  return content;
}
