import { Sandbox } from "@vercel/sandbox";
import { createHash } from "crypto";

/**
 * Generate a deterministic sandbox name for a user.
 * Mirrors the project naming pattern in vercel-deploy.ts.
 */
export function generateSandboxName(userId: string): string {
  const hash = createHash("sha256").update(userId).digest("hex").slice(0, 12);
  return `faas-sbx-${hash}`;
}

/**
 * Get an existing persistent sandbox or create a new one.
 * With the beta SDK, sandboxes persist by name — filesystem state
 * is automatically saved on stop and restored on resume.
 */
export async function getOrCreateSandbox(sandboxName: string): Promise<Sandbox> {
  try {
    return await Sandbox.get({ name: sandboxName });
  } catch {
    return await Sandbox.create({
      name: sandboxName,
      runtime: "node24",
      snapshotExpiration: 7 * 24 * 60 * 60 * 1000, // 7 days
    });
  }
}

/**
 * Get a sandbox by name. Auto-resumes if stopped (beta SDK behavior).
 */
export async function getSandbox(sandboxName: string): Promise<Sandbox> {
  return Sandbox.get({ name: sandboxName });
}

/**
 * Stop a sandbox session. State persists automatically via snapshot.
 */
export async function stopSandbox(sandboxName: string): Promise<void> {
  try {
    const sandbox = await Sandbox.get({ name: sandboxName });
    await sandbox.stop();
  } catch {
    // Sandbox doesn't exist or already stopped
  }
}

/**
 * Delete a sandbox and all its snapshots permanently.
 */
export async function deleteSandbox(sandboxName: string): Promise<void> {
  try {
    const sandbox = await Sandbox.get({ name: sandboxName });
    await sandbox.delete();
  } catch {
    // Sandbox doesn't exist
  }
}

/**
 * Streaming code execution. The beta SDK auto-resumes stopped sandboxes
 * when commands are run, so no manual resume logic is needed.
 */
export async function* executeCodeStreaming(
  code: string,
  sandboxName: string
): AsyncGenerator<{ type: "stdout" | "stderr" | "exit"; data: string }> {
  const sandbox = await Sandbox.get({ name: sandboxName });

  await sandbox.writeFiles([
    {
      path: "/vercel/sandbox/script.ts",
      content: Buffer.from(code, "utf-8"),
    },
  ]);

  const command = await sandbox.runCommand({
    cmd: "node",
    args: ["--experimental-strip-types", "/vercel/sandbox/script.ts"],
    detached: true,
  });

  for await (const log of command.logs()) {
    yield {
      type: log.stream,
      data: log.data,
    };
  }

  const finished = await command.wait();
  yield {
    type: "exit",
    data: String(finished.exitCode),
  };
}

/**
 * Install Bun in the sandbox if not already installed.
 * With persistent sandboxes, Bun survives across sessions —
 * this only runs once per sandbox lifetime.
 */
export async function installBun(sandboxName: string): Promise<{ success: boolean; logs: string[] }> {
  const sandbox = await Sandbox.get({ name: sandboxName });
  const logs: string[] = [];

  const checkResult = await sandbox.runCommand("which", ["bun"]);
  if (checkResult.exitCode === 0) {
    const bunPath = await checkResult.stdout();
    logs.push(`Bun already installed at ${bunPath.trim()}`);
    return { success: true, logs };
  }

  logs.push("Installing Bun (first time only — persists across sessions)...");
  const installResult = await sandbox.runCommand("sh", [
    "-c",
    'curl -fsSL https://bun.sh/install | bash && export BUN_INSTALL="$HOME/.bun" && export PATH="$BUN_INSTALL/bin:$PATH"',
  ]);

  const stdout = await installResult.stdout();
  const stderr = await installResult.stderr();
  if (stdout) logs.push(stdout);
  if (stderr) logs.push(stderr);

  return { success: installResult.exitCode === 0, logs };
}

/**
 * Build/bundle user code using Bun in the sandbox.
 */
export async function* buildCode(
  code: string,
  sandboxName: string
): AsyncGenerator<{ type: "log" | "error" | "done"; data: string }> {
  const sandbox = await Sandbox.get({ name: sandboxName });

  await sandbox.runCommand("mkdir", ["-p", "/tmp/src", "/tmp/dist"]);

  await sandbox.writeFiles([
    {
      path: "/tmp/src/handler.ts",
      content: Buffer.from(code, "utf-8"),
    },
  ]);

  yield { type: "log", data: "Source code written to /tmp/src/handler.ts" };

  yield { type: "log", data: "Checking Bun installation..." };
  const installResult = await installBun(sandboxName);
  for (const log of installResult.logs) {
    yield { type: "log", data: log };
  }

  if (!installResult.success) {
    yield { type: "error", data: "Failed to install Bun" };
    return;
  }

  yield { type: "log", data: "Running bun build..." };
  const buildCommand = await sandbox.runCommand({
    cmd: "sh",
    args: [
      "-c",
      'export PATH="$HOME/.bun/bin:$PATH" && bun build /tmp/src/handler.ts --outfile=/tmp/dist/index.js --target=bun',
    ],
    detached: true,
  });

  for await (const log of buildCommand.logs()) {
    yield { type: log.stream === "stderr" ? "error" : "log", data: log.data };
  }

  const result = await buildCommand.wait();

  if (result.exitCode !== 0) {
    yield { type: "error", data: `Build failed with exit code ${result.exitCode}` };
    return;
  }

  yield { type: "log", data: "Build completed successfully!" };
  yield { type: "done", data: "/tmp/dist/index.js" };
}

/**
 * Read the bundled code from the sandbox.
 */
export async function readBundledCode(sandboxName: string): Promise<string> {
  const sandbox = await Sandbox.get({ name: sandboxName });
  const result = await sandbox.runCommand("cat", ["/tmp/dist/index.js"]);

  if (result.exitCode !== 0) {
    throw new Error("Bundled code not found. Run build first.");
  }

  return await result.stdout();
}
