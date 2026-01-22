export interface Deployment {
  id: string;
  url: string;
  functionName: string;
  createdAt: Date;
  status: 'building' | 'queued' | 'ready' | 'error' | 'canceled';
  cronSchedule?: string;
  regions?: string[];
  errorMessage?: string;
  buildLogs?: string[];
}

// Use globalThis to persist deployments across hot reloads in dev mode
const globalForDeployments = globalThis as unknown as {
  deployments: Map<string, Deployment>;
};

// Initialize if not present
if (!globalForDeployments.deployments) {
  globalForDeployments.deployments = new Map();
}

const deployments = globalForDeployments.deployments;

export function getDeployment(id: string): Deployment | null {
  return deployments.get(id) || null;
}

export function getAllDeployments(): Deployment[] {
  return Array.from(deployments.values()).sort(
    (a, b) => b.createdAt.getTime() - a.createdAt.getTime()
  );
}

export function addDeployment(deployment: Deployment): void {
  deployments.set(deployment.id, deployment);
}

export function updateDeployment(id: string, updates: Partial<Deployment>): Deployment | null {
  const existing = deployments.get(id);
  if (!existing) return null;

  const updated = { ...existing, ...updates };
  deployments.set(id, updated);
  return updated;
}

export function deleteDeployment(id: string): boolean {
  return deployments.delete(id);
}

export function clearDeployments(): void {
  deployments.clear();
}
