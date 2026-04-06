/**
 * Verify sandbox billing metrics available after stop.
 *
 * The REST API returns billing fields on stop, but the SDK's stop()
 * returns void. Two approaches shown:
 *   1. REST API directly — response includes all fields
 *   2. SDK — call Sandbox.get() after stop() to read metadata
 *
 * Usage:
 *   bun run verify-sandbox-stop-metrics.ts
 */

import { Sandbox } from "@vercel/sandbox";

// ─── Billing fields available from the Sandbox API ───
// From @vercel/sandbox validators.d.ts (SandboxMetaData):
//
//   duration?:         number   // total runtime in ms
//   startedAt?:        number   // epoch ms when sandbox started
//   stoppedAt?:        number   // epoch ms when sandbox stopped
//   requestedStopAt?:  number   // epoch ms when stop was requested
//   memory:            number   // allocated memory (MB)
//   vcpus:             number   // allocated vCPUs
//   region:            string   // e.g. "iad1"
//   runtime:           string   // e.g. "node24"
//   timeout:           number   // configured timeout (ms)

interface BillingMetrics {
  sandboxId: string;
  durationMs: number;
  durationSec: number;
  memory: number;       // MB
  vcpus: number;
  region: string;
  runtime: string;
  startedAt: number;
  stoppedAt: number;
  // Derived cost estimate (example rate: $0.000014/vCPU-second)
  estimatedCost: number;
}

// Example rate — replace with actual Vercel pricing
const RATE_PER_VCPU_SECOND = 0.000014;

function calculateBilling(sandbox: {
  sandboxId: string;
  status: string;
  createdAt: Date;
  timeout: number;
}): BillingMetrics | null {
  // The SDK exposes these via getters, but the internal metadata
  // has the full shape. After stop(), we re-fetch to get stoppedAt/duration.
  //
  // With REST API, these come directly in the stop response body:
  // POST /v1/sandboxes/{id}/stop → { sandbox: { duration, startedAt, stoppedAt, ... } }

  console.log(`  status: ${sandbox.status}`);
  console.log(`  createdAt: ${sandbox.createdAt.toISOString()}`);
  console.log(`  timeout: ${sandbox.timeout}ms`);

  // The SDK doesn't expose duration/startedAt/stoppedAt via public getters,
  // but the REST API response includes them. See approach below.
  return null;
}

async function main() {
  console.log("=== Sandbox Billing Metrics Verification ===\n");

  // ─── Approach 1: SDK (current limitation) ───
  console.log("1️⃣  SDK Approach (Sandbox.create → stop → get):\n");

  console.log("Creating sandbox...");
  const sandbox = await Sandbox.create({ runtime: "node24" });
  console.log(`  id: ${sandbox.sandboxId}`);

  // Let it run briefly
  await new Promise((r) => setTimeout(r, 2000));

  // stop() returns void — no billing data
  console.log("Stopping sandbox...");
  await sandbox.stop();
  console.log("  stop() returned void (no billing data in SDK response)\n");

  // Re-fetch to get the stopped metadata
  console.log("Re-fetching sandbox metadata...");
  const stopped = await Sandbox.get({ sandboxId: sandbox.sandboxId });
  console.log(`  status: ${stopped.status}`);
  calculateBilling(stopped);

  // ─── Approach 2: REST API directly ───
  console.log("\n2️⃣  REST API Approach (direct HTTP):\n");
  console.log("Creating another sandbox via REST...");

  const token = process.env.VERCEL_API_TOKEN!;
  const teamId = process.env.VERCEL_TEAM_ID;
  const base = "https://api.vercel.com/v1/sandboxes";
  const qs = teamId ? `?teamId=${teamId}` : "";
  const headers = {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  };

  const createRes = await fetch(`${base}${qs}`, {
    method: "POST",
    headers,
    body: JSON.stringify({ runtime: "node24" }),
  });

  if (!createRes.ok) {
    console.log(`  ⚠️  REST create failed (${createRes.status}) — token may lack sandbox scope`);
    console.log("  Skipping REST demo. See schema below.\n");
  } else {
    const { sandbox: created } = await createRes.json() as any;
    console.log(`  id: ${created.id}`);

    await new Promise((r) => setTimeout(r, 2000));

    console.log("Stopping via REST...");
    const stopRes = await fetch(`${base}/${created.id}/stop${qs}`, {
      method: "POST",
      headers,
    });
    const { sandbox: stoppedRest } = await stopRes.json() as any;

    console.log("\n  Billing fields from stop response:");
    console.log(`    duration:       ${stoppedRest.duration}ms (${(stoppedRest.duration / 1000).toFixed(2)}s)`);
    console.log(`    startedAt:      ${new Date(stoppedRest.startedAt).toISOString()}`);
    console.log(`    stoppedAt:      ${new Date(stoppedRest.stoppedAt).toISOString()}`);
    console.log(`    memory:         ${stoppedRest.memory}MB`);
    console.log(`    vcpus:          ${stoppedRest.vcpus}`);
    console.log(`    region:         ${stoppedRest.region}`);
    console.log(`    runtime:        ${stoppedRest.runtime}`);

    const durationSec = stoppedRest.duration / 1000;
    const cost = durationSec * stoppedRest.vcpus * RATE_PER_VCPU_SECOND;
    console.log(`\n  Estimated cost:   $${cost.toFixed(6)} (${durationSec.toFixed(2)}s × ${stoppedRest.vcpus} vCPU × $${RATE_PER_VCPU_SECOND}/vCPU-s)`);
  }

  // ─── Schema Summary ───
  console.log("\n=== Available Billing Fields (from SandboxMetaData) ===\n");
  console.log(`  Field              Type       Description`);
  console.log(`  ─────              ────       ───────────`);
  console.log(`  duration?          number     Total runtime in ms`);
  console.log(`  startedAt?         number     Epoch ms — sandbox started`);
  console.log(`  stoppedAt?         number     Epoch ms — sandbox stopped`);
  console.log(`  requestedStopAt?   number     Epoch ms — stop was requested`);
  console.log(`  memory             number     Allocated memory (MB)`);
  console.log(`  vcpus              number     Allocated vCPUs`);
  console.log(`  region             string     Deployment region (e.g. "iad1")`);
  console.log(`  runtime            string     Runtime (e.g. "node24")`);
  console.log(`  timeout            number     Configured timeout (ms)`);

  console.log("\n=== Cost Calculation Formula ===\n");
  console.log(`  cost = (duration_ms / 1000) × vcpus × RATE_PER_VCPU_SECOND`);
  console.log(`  cost = (duration_ms / 1000) × (memory / 2048) × RATE_PER_MB_SECOND  [alt]`);
  console.log(`\n  Note: The API doesn't return a pre-computed cost field.`);
  console.log(`  Consumers derive cost from duration + resource allocation.`);

  console.log("\n=== SDK Gap ===\n");
  console.log(`  ⚠️  SDK stop() returns Promise<void> — doesn't surface billing data.`);
  console.log(`  Options:`);
  console.log(`    a) Use REST API directly (stop response includes all fields)`);
  console.log(`    b) Call Sandbox.get() after stop() to read metadata`);
  console.log(`    c) Request SDK update: stop() should return SandboxMetaData`);
}

main().catch(console.error);
