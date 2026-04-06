/**
 * Sandbox billing cost calculator.
 * Extracts billing metrics from the stop/get response and computes cost.
 *
 * Usage in your app:
 *   const metrics = extractBillingMetrics(stopResponse.sandbox);
 *   await recordUsage(userId, metrics);
 */

// Rate per vCPU-second — replace with actual Vercel pricing
const RATE_PER_VCPU_SEC = 0.000014;

interface SandboxResponse {
  id: string;
  duration?: number;       // ms
  startedAt?: number;      // epoch ms
  stoppedAt?: number;      // epoch ms
  requestedStopAt?: number;
  memory: number;          // MB
  vcpus: number;
  region: string;
  runtime: string;
}

interface BillingMetrics {
  sandboxId: string;
  durationMs: number;
  durationSec: number;
  vcpus: number;
  memoryMb: number;
  region: string;
  runtime: string;
  startedAt: Date;
  stoppedAt: Date;
  estimatedCost: number;
}

export function extractBillingMetrics(sandbox: SandboxResponse): BillingMetrics {
  const durationMs = sandbox.duration ??
    ((sandbox.stoppedAt && sandbox.startedAt)
      ? sandbox.stoppedAt - sandbox.startedAt
      : 0);

  const durationSec = durationMs / 1000;
  const cost = durationSec * sandbox.vcpus * RATE_PER_VCPU_SEC;

  return {
    sandboxId: sandbox.id,
    durationMs,
    durationSec: Math.round(durationSec * 100) / 100,
    vcpus: sandbox.vcpus,
    memoryMb: sandbox.memory,
    region: sandbox.region,
    runtime: sandbox.runtime,
    startedAt: new Date(sandbox.startedAt ?? 0),
    stoppedAt: new Date(sandbox.stoppedAt ?? 0),
    estimatedCost: Math.round(cost * 1_000_000) / 1_000_000, // 6 decimal places
  };
}

// --- Example: integrate into your stop flow ---
//
// const res = await fetch(`/v1/sandboxes/${id}/stop`, { method: "POST", ... });
// const { sandbox } = await res.json();
// const billing = extractBillingMetrics(sandbox);
//
// // Record for usage-based billing
// await redis.hset(`billing:${userId}`, {
//   [billing.sandboxId]: JSON.stringify(billing),
// });
