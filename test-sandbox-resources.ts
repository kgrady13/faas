/**
 * Test: Verify activeCpuDurationMs and networkTransfer fields
 * are returned on the GET /v1/sandboxes/{id} endpoint after a sandbox stops.
 *
 * Uses @vercel/sandbox SDK for command execution (REST command endpoints don't exist),
 * then raw REST API to GET the sandbox and check for resource fields.
 *
 * Usage: npx tsx test-sandbox-resources.ts
 * Requires: VERCEL_TOKEN or VERCEL_OIDC_TOKEN env var
 */
import { Sandbox } from "@vercel/sandbox";

const TOKEN = process.env.VERCEL_TOKEN || process.env.VERCEL_OIDC_TOKEN;
const TEAM_ID = process.env.VERCEL_TEAM_ID;
if (!TOKEN) {
  console.error("Set VERCEL_TOKEN or run `vercel env pull` first");
  process.exit(1);
}

const BASE = "https://api.vercel.com/v1/sandboxes";
const headers = {
  Authorization: `Bearer ${TOKEN}`,
  "Content-Type": "application/json",
};
const qs = TEAM_ID ? `?teamId=${TEAM_ID}` : "";

async function main() {
  // 1. Create sandbox via SDK (handles setup + WebSocket connection)
  console.log("Creating sandbox via SDK...");
  const sandbox = await Sandbox.create({
    apiToken: TOKEN!,
    teamId: TEAM_ID,
    runtime: "node22",
  });
  console.log(`Created: ${sandbox.id}`);

  // 2. Run a command that does real CPU + network work
  console.log("Running command with network fetch...");
  const command = await sandbox.runCommand({
    cmd: "node",
    args: ["-e", `fetch("https://httpbin.org/get").then(r => r.text()).then(t => { console.log(t); })`],
    detached: true,
  });

  for await (const log of command.logs()) {
    console.log(`  [${log.stream}] ${log.data.slice(0, 100)}...`);
  }
  const exitCode = await command.exitCode;
  console.log(`Command exited with code: ${exitCode}`);

  // 3. Stop the sandbox
  console.log("Stopping sandbox...");
  await sandbox.close();

  // Wait for stop to finalize
  await new Promise((r) => setTimeout(r, 3000));

  // 4. GET the sandbox via REST and check for the new fields
  console.log("Fetching stopped sandbox via REST...");
  const getRes = await fetch(`${BASE}/${sandbox.id}${qs}`, { headers });
  const data = await getRes.json();
  const sbx = data.sandbox;

  console.log("\n--- Results ---");
  console.log(`status: ${sbx.status}`);
  console.log(`activeCpuDurationMs: ${sbx.activeCpuDurationMs ?? "MISSING"}`);
  console.log(`networkTransfer: ${JSON.stringify(sbx.networkTransfer) ?? "MISSING"}`);

  const hasFields =
    sbx.activeCpuDurationMs !== undefined && sbx.networkTransfer !== undefined;

  if (hasFields) {
    const hasRealActivity = sbx.activeCpuDurationMs > 0 &&
      (sbx.networkTransfer.ingress > 0 || sbx.networkTransfer.egress > 0);
    if (hasRealActivity) {
      console.log("\n✅ Fields present with real activity — safe to share with Notion");
    } else {
      console.log("\n⚠️  Fields present but values are zero — command may not have run properly");
    }
  } else {
    console.log("\n❌ Fields NOT present — do not share yet, REST API may not have shipped");
  }
}

main().catch(console.error);
