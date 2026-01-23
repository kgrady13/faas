import { redis } from "./redis";

export interface Deployment {
  id: string;
  url: string;
  functionName: string;
  createdAt: string; // ISO string for Redis serialization
  status: "building" | "queued" | "ready" | "error" | "canceled";
  cronSchedule?: string;
  regions?: string[];
  errorMessage?: string;
  buildLogs?: string[];
}

const DEPLOYMENT_KEY_PREFIX = "deployment:";
const DEPLOYMENT_IDS_KEY = "deployments:ids";

export async function getDeployment(id: string): Promise<Deployment | null> {
  const deployment = await redis.get<Deployment>(`${DEPLOYMENT_KEY_PREFIX}${id}`);
  return deployment || null;
}

export async function getAllDeployments(): Promise<Deployment[]> {
  const ids = await redis.smembers(DEPLOYMENT_IDS_KEY);
  if (ids.length === 0) return [];

  const pipeline = redis.pipeline();
  for (const id of ids) {
    pipeline.get(`${DEPLOYMENT_KEY_PREFIX}${id}`);
  }

  const results = await pipeline.exec<(Deployment | null)[]>();
  const deployments = results.filter((d): d is Deployment => d !== null);

  // Sort by createdAt descending
  return deployments.sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );
}

export async function addDeployment(deployment: Deployment): Promise<void> {
  const pipeline = redis.pipeline();
  pipeline.set(`${DEPLOYMENT_KEY_PREFIX}${deployment.id}`, deployment);
  pipeline.sadd(DEPLOYMENT_IDS_KEY, deployment.id);
  await pipeline.exec();
}

export async function updateDeployment(
  id: string,
  updates: Partial<Deployment>
): Promise<Deployment | null> {
  const existing = await getDeployment(id);
  if (!existing) return null;

  const updated = { ...existing, ...updates };
  await redis.set(`${DEPLOYMENT_KEY_PREFIX}${id}`, updated);
  return updated;
}

export async function deleteDeployment(id: string): Promise<boolean> {
  const pipeline = redis.pipeline();
  pipeline.del(`${DEPLOYMENT_KEY_PREFIX}${id}`);
  pipeline.srem(DEPLOYMENT_IDS_KEY, id);
  const results = await pipeline.exec<[number, number]>();
  return results[0] > 0;
}

export async function clearDeployments(): Promise<void> {
  const ids = await redis.smembers(DEPLOYMENT_IDS_KEY);
  if (ids.length === 0) return;

  const pipeline = redis.pipeline();
  for (const id of ids) {
    pipeline.del(`${DEPLOYMENT_KEY_PREFIX}${id}`);
  }
  pipeline.del(DEPLOYMENT_IDS_KEY);
  await pipeline.exec();
}
