import { createHash } from "crypto";
import { Vercel } from "@vercel/sdk";
import { SkipAutoDetectionConfirmation } from "@vercel/sdk/models/createdeploymentop.js";
import { getUserProject, setUserProject } from "./deployments-store";
import type { UserProject, UsageSummary, UsageCharge } from "./types";

interface VercelFile {
  file: string;
  data: string;
  encoding?: "base64" | "utf-8";
}

interface CreateDeploymentOptions {
  files: VercelFile[];
  functionName: string;
  cronSchedule?: string;
  regions?: string[];
}

interface DeploymentResponse {
  id: string;
  url: string;
  readyState: "QUEUED" | "BUILDING" | "READY" | "ERROR" | "CANCELED";
  regions?: string[];
  errorMessage?: string;
}

function getEnvConfig() {
  const token = process.env.VERCEL_API_TOKEN;
  const teamId = process.env.VERCEL_TEAM_ID;
  // Fallback project ID for legacy deployments (optional with per-user projects)
  const fallbackProjectId = process.env.VERCEL_WORKER_PROJECT_ID;

  if (!token) {
    throw new Error("VERCEL_API_TOKEN environment variable is required");
  }

  return { token, teamId, fallbackProjectId };
}

/**
 * Get a configured Vercel SDK client
 */
export function getVercelClient(): Vercel {
  const { token } = getEnvConfig();
  return new Vercel({ bearerToken: token });
}

/**
 * Generate a deterministic, DNS-safe project name from a userId.
 * SHA-256 hash avoids leaking the raw IP into Vercel project names.
 */
export function generateProjectName(userId: string): string {
  const hash = createHash("sha256").update(userId).digest("hex").slice(0, 12);
  return `faas-${hash}`;
}

/**
 * Ensure a per-user Vercel project exists. Creates one lazily on first deploy.
 * Checks Redis first (fast path), then creates via Vercel SDK if needed.
 */
export async function ensureUserProject(userId: string): Promise<UserProject> {
  const existing = await getUserProject(userId);
  if (existing) return existing;

  const { teamId } = getEnvConfig();
  const vercel = getVercelClient();
  const projectName = generateProjectName(userId);

  try {
    const response = await vercel.projects.createProject({
      teamId: teamId || undefined,
      requestBody: { name: projectName },
    });

    const userProject: UserProject = {
      vercelProjectId: response.id,
      projectName: response.name,
      createdAt: new Date().toISOString(),
    };

    await setUserProject(userId, userProject);
    return userProject;
  } catch (error: unknown) {
    // Handle 409 conflict — project exists in Vercel but not in Redis
    const is409 =
      error instanceof Error &&
      (error.message.includes("409") ||
        error.message.includes("already exists"));

    if (is409) {
      const result = await vercel.projects.getProjects({
        teamId: teamId || undefined,
        search: projectName,
      });

      const projects = "projects" in result ? result.projects : result;
      const found = projects?.find(
        (p: { name: string }) => p.name === projectName,
      );

      if (found) {
        const userProject: UserProject = {
          vercelProjectId: found.id as string,
          projectName: found.name as string,
          createdAt: new Date().toISOString(),
        };
        await setUserProject(userId, userProject);
        return userProject;
      }
    }

    throw error;
  }
}

/**
 * Generate Build Output API structure for a serverless function
 * Uses Bun runtime which supports Web Standard handlers natively
 */
export function generateBuildOutput(
  bundledCode: string,
  functionName: string,
  cronSchedule?: string,
): VercelFile[] {
  const files: VercelFile[] = [];

  // config.json - routes and optional cron
  const config: {
    version: number;
    routes: { src: string; dest: string }[];
    crons?: { path: string; schedule: string }[];
  } = {
    version: 3,
    routes: [{ src: `/api/${functionName}`, dest: `/api/${functionName}` }],
  };

  if (cronSchedule) {
    config.crons = [{ path: `/api/${functionName}`, schedule: cronSchedule }];
  }

  files.push({
    file: ".vercel/output/config.json",
    data: JSON.stringify(config, null, 2),
  });

  // .vc-config.json - function configuration for Bun runtime
  // Bun supports Web Standard Request/Response natively - no wrapper needed
  const vcConfig = {
    runtime: "bun1.x",
    handler: "index.js",
    supportsResponseStreaming: true,
  };

  files.push({
    file: `.vercel/output/functions/api/${functionName}.func/.vc-config.json`,
    data: JSON.stringify(vcConfig, null, 2),
  });

  // index.js - bundled handler code (ESM for Bun runtime, no wrapper needed)
  files.push({
    file: `.vercel/output/functions/api/${functionName}.func/index.js`,
    data: bundledCode,
  });

  return files;
}

/**
 * Create a deployment on Vercel using the SDK
 * SDK handles file uploads automatically — no manual SHA1 hashing needed
 */
export async function createDeployment(
  options: CreateDeploymentOptions & { projectId: string },
): Promise<DeploymentResponse> {
  const { teamId } = getEnvConfig();
  const vercel = getVercelClient();
  const { files, functionName, regions, projectId } = options;

  const requestBody: Record<string, unknown> = {
    name: projectId,
    project: projectId,
    files: files.map((f) => ({ file: f.file, data: f.data })),
    target: "production",
    meta: {
      functionName,
      deployedAt: new Date().toISOString(),
    },
  };

  if (regions && regions.length > 0) {
    requestBody.regions = regions;
  }

  const deployment = await vercel.deployments.createDeployment({
    requestBody: requestBody as never,
    teamId: teamId || undefined,
    skipAutoDetectionConfirmation: SkipAutoDetectionConfirmation.One,
  });

  return {
    id: deployment.id,
    url: deployment.url ? `https://${deployment.url}` : "",
    readyState: deployment.readyState as DeploymentResponse["readyState"],
    errorMessage: (deployment as Record<string, unknown>).errorMessage as
      | string
      | undefined,
  };
}

/**
 * Get the status of a deployment
 */
export async function getDeploymentStatus(
  deploymentId: string,
): Promise<DeploymentResponse> {
  const { teamId } = getEnvConfig();
  const vercel = getVercelClient();

  const deployment = await vercel.deployments.getDeployment({
    idOrUrl: deploymentId,
    teamId: teamId || undefined,
  });

  return {
    id: deployment.id,
    url: deployment.url ? `https://${deployment.url}` : "",
    readyState: deployment.readyState as DeploymentResponse["readyState"],
    errorMessage: (deployment as Record<string, unknown>).errorMessage as
      | string
      | undefined,
  };
}

/**
 * Delete a deployment from Vercel
 */
export async function deleteVercelDeployment(
  deploymentId: string,
): Promise<void> {
  const { teamId } = getEnvConfig();
  const vercel = getVercelClient();

  await vercel.deployments.deleteDeployment({
    id: deploymentId,
    teamId: teamId || undefined,
  });
}

/**
 * Build log event types from the deployment event stream
 */
export type BuildLogEvent =
  | { type: "stdout" | "stderr" | "command"; text: string }
  | { type: "state"; readyState: string }
  | { type: "done"; readyState: string }
  | { type: "error"; message: string };

const TERMINAL_STATES = ["READY", "ERROR", "CANCELED"];
const LOG_TYPES = ["stdout", "stderr", "command"];

/**
 * Stream build logs for a deployment using the SDK's getDeploymentEvents
 * Uses serial-based deduplication (adapted from reference project)
 */
export async function* streamBuildLogs(
  deploymentId: string,
): AsyncGenerator<BuildLogEvent> {
  const { teamId } = getEnvConfig();
  const vercel = getVercelClient();

  let lastSerial = "";

  while (true) {
    try {
      const { readyState } = await vercel.deployments.getDeployment({
        idOrUrl: deploymentId,
        teamId: teamId || undefined,
      });

      const events = (await vercel.deployments.getDeploymentEvents({
        idOrUrl: deploymentId,
        teamId: teamId || undefined,
        direction: "forward",
        limit: -1,
        builds: 1,
      })) as Array<{
        type: string;
        serial?: string;
        text?: string;
        payload?: {
          serial?: string;
          text?: string;
          info?: { readyState?: string };
        };
        info?: { readyState?: string };
      }>;

      for (const event of events ?? []) {
        const serial = event.serial ?? event.payload?.serial;
        if (serial && serial <= lastSerial) continue;
        if (serial) lastSerial = serial;

        const text = event.text ?? event.payload?.text;
        if (text && LOG_TYPES.includes(event.type)) {
          yield {
            type: event.type as "stdout" | "stderr" | "command",
            text,
          };
        }

        const state = event.info?.readyState ?? event.payload?.info?.readyState;
        if (event.type === "deployment-state" && state) {
          yield { type: "state", readyState: state };
        }
      }

      if (TERMINAL_STATES.includes(readyState as string)) {
        yield { type: "done", readyState: String(readyState) };
        return;
      }

      await new Promise((resolve) => setTimeout(resolve, 1000));
    } catch (err) {
      yield {
        type: "error",
        message: err instanceof Error ? err.message : String(err),
      };
      return;
    }
  }
}

/**
 * Stream runtime logs for a deployment from Vercel
 * Returns a ReadableStream of JSON log objects
 */
export async function streamDeploymentLogs(
  deploymentId: string,
  projectId: string,
): Promise<ReadableStream<Uint8Array>> {
  const { token, teamId } = getEnvConfig();

  const params = new URLSearchParams();
  if (teamId) params.set("teamId", teamId);

  const response = await fetch(
    `https://api.vercel.com/v1/projects/${projectId}/deployments/${deploymentId}/runtime-logs?${params}`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/stream+json",
      },
    },
  );

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to fetch deployment logs: ${error}`);
  }

  if (!response.body) {
    throw new Error("No response body for log stream");
  }

  return response.body;
}

/**
 * Fetch billing charges for a specific project using the Vercel SDK.
 * Filters FOCUS v1.3 charge stream by ProjectId tag, aggregates into a summary.
 */
export async function getUserUsage(
  projectId: string,
  from: string,
  to: string,
): Promise<UsageSummary> {
  const { teamId } = getEnvConfig();
  const vercel = getVercelClient();

  const stream = await vercel.billing.listBillingCharges({
    from,
    to,
    teamId: teamId || undefined,
  });

  const charges: UsageCharge[] = [];
  let totalBilledCost = 0;
  let totalEffectiveCost = 0;

  for await (const charge of stream) {
    if (charge.tags?.ProjectId !== projectId) continue;

    charges.push({
      serviceName: charge.serviceName,
      billedCost: charge.billedCost,
      effectiveCost: charge.effectiveCost,
      consumedQuantity: charge.consumedQuantity,
      consumedUnit: charge.consumedUnit,
      chargePeriodStart: charge.chargePeriodStart,
      chargePeriodEnd: charge.chargePeriodEnd,
      regionId: charge.regionId,
      regionName: charge.regionName,
    });

    totalBilledCost += charge.billedCost;
    totalEffectiveCost += charge.effectiveCost;
  }

  return {
    totalBilledCost,
    totalEffectiveCost,
    charges,
    periodStart: from,
    periodEnd: to,
    projectId,
    projectName: "",
  };
}
