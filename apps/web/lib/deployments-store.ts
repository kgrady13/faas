import { NextRequest } from "next/server";
import { redis } from "./redis";
import type { Deployment, UserProject } from "./types";

export type { Deployment };

/**
 * Get a user identifier from the request (client IP).
 * Falls back to 'anonymous' if IP cannot be determined.
 */
export function getUserId(request: NextRequest): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    // x-forwarded-for can be comma-separated, take the first one
    return forwarded.split(",")[0].trim();
  }
  // Fallback - in dev this might be ::1 or 127.0.0.1
  return request.headers.get("x-real-ip") || "anonymous";
}

// Key helpers scoped by user
const deploymentKey = (userId: string, id: string) => `deployment:${userId}:${id}`;
const deploymentIdsKey = (userId: string) => `deployments:${userId}:ids`;
const userProjectKey = (userId: string) => `project:${userId}`;

// ── User-project mapping ──────────────────────────────────────────────

export async function getUserProject(userId: string): Promise<UserProject | null> {
  return (await redis.get<UserProject>(userProjectKey(userId))) || null;
}

export async function setUserProject(userId: string, project: UserProject): Promise<void> {
  await redis.set(userProjectKey(userId), project);
}

export async function deleteUserProject(userId: string): Promise<boolean> {
  const result = await redis.del(userProjectKey(userId));
  return result > 0;
}

// ── Deployments ───────────────────────────────────────────────────────

export async function getDeployment(userId: string, id: string): Promise<Deployment | null> {
  const deployment = await redis.get<Deployment>(deploymentKey(userId, id));
  return deployment || null;
}

export async function getAllDeployments(userId: string): Promise<Deployment[]> {
  const ids = await redis.smembers(deploymentIdsKey(userId));
  if (ids.length === 0) return [];

  const pipeline = redis.pipeline();
  for (const id of ids) {
    pipeline.get(deploymentKey(userId, id));
  }

  const results = await pipeline.exec<(Deployment | null)[]>();
  const deployments = results.filter((d): d is Deployment => d !== null);

  // Sort by createdAt descending
  return deployments.sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );
}

export async function addDeployment(userId: string, deployment: Deployment): Promise<void> {
  const pipeline = redis.pipeline();
  pipeline.set(deploymentKey(userId, deployment.id), deployment);
  pipeline.sadd(deploymentIdsKey(userId), deployment.id);
  await pipeline.exec();
}

export async function updateDeployment(
  userId: string,
  id: string,
  updates: Partial<Deployment>
): Promise<Deployment | null> {
  const existing = await getDeployment(userId, id);
  if (!existing) return null;

  const updated = { ...existing, ...updates };
  await redis.set(deploymentKey(userId, id), updated);
  return updated;
}

export async function deleteDeployment(userId: string, id: string): Promise<boolean> {
  const pipeline = redis.pipeline();
  pipeline.del(deploymentKey(userId, id));
  pipeline.srem(deploymentIdsKey(userId), id);
  const results = await pipeline.exec<[number, number]>();
  return results[0] > 0;
}

export async function clearDeployments(userId: string): Promise<void> {
  const ids = await redis.smembers(deploymentIdsKey(userId));
  if (ids.length === 0) return;

  const pipeline = redis.pipeline();
  for (const id of ids) {
    pipeline.del(deploymentKey(userId, id));
  }
  pipeline.del(deploymentIdsKey(userId));
  await pipeline.exec();
}
