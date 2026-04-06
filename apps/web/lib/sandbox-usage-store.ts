import { redis } from "./redis";
import type {
  SandboxSessionUsage,
  SandboxUsageTotals,
  SandboxUsageCost,
} from "./types";

// Redis key schema
const totalsKey = (sandboxName: string) => `sbx-usage:totals:${sandboxName}`;
const sessionsKey = (sandboxName: string) => `sbx-usage:sessions:${sandboxName}`;

// Vercel Sandbox pricing (Pro plan)
const PRICING = {
  activeCpuPerHour: 0.128,
  memoryPerGbHour: 0.0212,
  dataTransferPerGb: 0.15,
} as const;

/**
 * Record a session's usage after sandbox stop.
 * Stores the individual session record and increments running totals.
 */
export async function recordSessionUsage(usage: SandboxSessionUsage): Promise<void> {
  const timestamp = new Date(usage.stoppedAt).getTime();
  const pipeline = redis.pipeline();

  // Store individual session record (sorted set, scored by timestamp)
  pipeline.zadd(sessionsKey(usage.sandboxName), {
    score: timestamp,
    member: JSON.stringify(usage),
  });

  // Increment running totals (hash)
  const key = totalsKey(usage.sandboxName);
  pipeline.hincrby(key, "totalDurationMs", usage.durationMs);
  pipeline.hincrby(key, "totalActiveCpuMs", usage.activeCpuMs);
  pipeline.hincrby(key, "totalEgressBytes", usage.egressBytes);
  pipeline.hincrby(key, "totalIngressBytes", usage.ingressBytes);
  pipeline.hincrby(key, "totalSessions", 1);
  // Overwrite last known resource allocation
  pipeline.hset(key, { memoryMb: usage.memoryMb, vcpus: usage.vcpus });

  await pipeline.exec();
}

/**
 * Get aggregated usage totals for a sandbox.
 */
export async function getSandboxUsageTotals(sandboxName: string): Promise<SandboxUsageTotals | null> {
  const data = await redis.hgetall<Record<string, string>>(totalsKey(sandboxName));
  if (!data || Object.keys(data).length === 0) return null;

  return {
    totalDurationMs: Number(data.totalDurationMs) || 0,
    totalActiveCpuMs: Number(data.totalActiveCpuMs) || 0,
    totalEgressBytes: Number(data.totalEgressBytes) || 0,
    totalIngressBytes: Number(data.totalIngressBytes) || 0,
    totalSessions: Number(data.totalSessions) || 0,
    memoryMb: Number(data.memoryMb) || 0,
    vcpus: Number(data.vcpus) || 0,
  };
}

/**
 * Get recent session usage records.
 */
export async function getRecentSessions(
  sandboxName: string,
  count = 5
): Promise<SandboxSessionUsage[]> {
  // ZRANGE with REV gives newest first
  const results = await redis.zrange<string[]>(
    sessionsKey(sandboxName),
    "+inf",
    "-inf",
    { byScore: true, rev: true, count, offset: 0 }
  );

  return results.map((entry) =>
    typeof entry === "string" ? JSON.parse(entry) : entry
  );
}

/**
 * Calculate estimated costs from usage totals.
 * Pure function — pricing applied at read time.
 */
export function calculateSandboxCost(totals: SandboxUsageTotals): SandboxUsageCost {
  const cpuHours = totals.totalActiveCpuMs / 3_600_000;
  const memoryGbHours = (totals.memoryMb / 1024) * (totals.totalDurationMs / 3_600_000);
  const dataTransferGb = (totals.totalEgressBytes + totals.totalIngressBytes) / 1_073_741_824;

  const activeCpuCost = cpuHours * PRICING.activeCpuPerHour;
  const memoryCost = memoryGbHours * PRICING.memoryPerGbHour;
  const dataTransferCost = dataTransferGb * PRICING.dataTransferPerGb;

  return {
    activeCpuCost,
    memoryCost,
    dataTransferCost,
    totalCost: activeCpuCost + memoryCost + dataTransferCost,
  };
}
