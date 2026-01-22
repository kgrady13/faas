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

  // Write code to .ts file - Node 24 supports TypeScript natively
  await activeSandbox.writeFiles([
    {
      path: "/vercel/sandbox/script.ts",
      content: Buffer.from(code, "utf-8"),
    },
  ]);

  // Execute with --experimental-strip-types for TypeScript support
  const result = await activeSandbox.runCommand("node", [
    "--experimental-strip-types",
    "/vercel/sandbox/script.ts"
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
  sandboxId: string
): AsyncGenerator<{ type: "stdout" | "stderr" | "exit"; data: string }> {
  // Reconnect to the sandbox if needed
  const sandbox = await getOrReconnectSandbox(sandboxId);

  // Write code to .ts file - Node 24 supports TypeScript natively
  await sandbox.writeFiles([
    {
      path: "/vercel/sandbox/script.ts",
      content: Buffer.from(code, "utf-8"),
    },
  ]);

  // Execute in detached mode with TypeScript support
  const command = await sandbox.runCommand({
    cmd: "node",
    args: ["--experimental-strip-types", "/vercel/sandbox/script.ts"],
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

// Build-related helpers for esbuild bundling

/**
 * Install esbuild in the sandbox if not already installed
 * Uses /tmp/build-tools to avoid polluting user's working directory
 */
export async function installEsbuild(sandboxId: string): Promise<{ success: boolean; logs: string[] }> {
  const sandbox = await getOrReconnectSandbox(sandboxId);
  const logs: string[] = [];

  // Use /tmp/build-tools to keep build tools separate from user code
  const buildToolsDir = '/tmp/build-tools';

  // Check if esbuild is already installed
  const checkResult = await sandbox.runCommand('ls', [`${buildToolsDir}/node_modules/esbuild`]);

  if (checkResult.exitCode === 0) {
    logs.push('esbuild already installed');
    return { success: true, logs };
  }

  // Create build tools directory
  await sandbox.runCommand('mkdir', ['-p', buildToolsDir]);

  // Initialize npm in the build tools directory
  const initResult = await sandbox.runCommand('sh', ['-c', `cd ${buildToolsDir} && npm init -y`]);

  if (initResult.exitCode !== 0) {
    const stderr = await initResult.stderr();
    logs.push(`npm init failed: ${stderr}`);
  }

  // Install esbuild in the build tools directory
  logs.push('Installing esbuild...');
  const installResult = await sandbox.runCommand('sh', ['-c', `cd ${buildToolsDir} && npm install esbuild`]);

  const stdout = await installResult.stdout();
  const stderr = await installResult.stderr();

  if (stdout) logs.push(stdout);
  if (stderr) logs.push(stderr);

  return {
    success: installResult.exitCode === 0,
    logs,
  };
}

/**
 * Build/bundle user code using esbuild in the sandbox
 */
export async function* buildCode(
  code: string,
  sandboxId: string
): AsyncGenerator<{ type: 'log' | 'error' | 'done'; data: string }> {
  const sandbox = await getOrReconnectSandbox(sandboxId);

  // Ensure build directories exist
  await sandbox.runCommand('mkdir', ['-p', '/tmp/src', '/tmp/dist']);

  // Write user code to source file
  await sandbox.writeFiles([
    {
      path: '/tmp/src/handler.ts',
      content: Buffer.from(code, 'utf-8'),
    },
  ]);

  yield { type: 'log', data: 'Source code written to /tmp/src/handler.ts' };

  // Install esbuild if needed
  yield { type: 'log', data: 'Checking esbuild installation...' };
  const installResult = await installEsbuild(sandboxId);
  for (const log of installResult.logs) {
    yield { type: 'log', data: log };
  }

  if (!installResult.success) {
    yield { type: 'error', data: 'Failed to install esbuild' };
    return;
  }

  // Run esbuild to bundle the code (using esbuild from /tmp/build-tools)
  yield { type: 'log', data: 'Running esbuild...' };

  const buildCommand = await sandbox.runCommand({
    cmd: 'sh',
    args: [
      '-c',
      '/tmp/build-tools/node_modules/.bin/esbuild /tmp/src/handler.ts --bundle --platform=node --target=node22 --format=cjs --outfile=/tmp/dist/index.js',
    ],
    detached: true,
  });

  // Stream build logs
  for await (const log of buildCommand.logs()) {
    yield { type: log.stream === 'stderr' ? 'error' : 'log', data: log.data };
  }

  const result = await buildCommand.wait();

  if (result.exitCode !== 0) {
    yield { type: 'error', data: `Build failed with exit code ${result.exitCode}` };
    return;
  }

  yield { type: 'log', data: 'Build completed successfully!' };
  yield { type: 'done', data: '/tmp/dist/index.js' };
}

/**
 * Read the bundled code from the sandbox
 */
export async function readBundledCode(sandboxId: string): Promise<string> {
  const sandbox = await getOrReconnectSandbox(sandboxId);

  // Use cat to read the file content since readFile returns a stream
  const result = await sandbox.runCommand('cat', ['/tmp/dist/index.js']);

  if (result.exitCode !== 0) {
    throw new Error('Bundled code not found. Run build first.');
  }

  const content = await result.stdout();
  return content;
}
