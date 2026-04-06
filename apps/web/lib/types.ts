/**
 * Shared type definitions for the FaaS platform
 */

// Session types
export type SessionStatus = "pending" | "running" | "stopping" | "stopped" | "paused" | "failed";

export interface Session {
  sandboxName: string;
  status: SessionStatus;
  timeout: number;
  createdAt: Date;
}

export interface SessionWithRemainingTime extends Session {
  remainingTime: number;
  isActive?: boolean;
}

// Deployment types
export type DeploymentStatus = "building" | "queued" | "ready" | "error" | "canceled";

export interface Deployment {
  id: string;
  url: string;
  functionName: string;
  createdAt: string; // ISO string for Redis serialization
  status: DeploymentStatus;
  cronSchedule?: string;
  regions?: string[];
  errorMessage?: string;
  buildLogs?: string[];
  vercelProjectId?: string; // Per-user Vercel project ID (absent for legacy deployments)
}

// Per-user Vercel project mapping (stored in Redis)
export interface UserProject {
  vercelProjectId: string;
  projectName: string;
  createdAt: string; // ISO string
}

// Billing/usage types (FOCUS v1.3 format)
export interface UsageCharge {
  serviceName: string;
  billedCost: number;
  effectiveCost: number;
  consumedQuantity: number;
  consumedUnit: string;
  chargePeriodStart: string;
  chargePeriodEnd: string;
  regionId?: string;
  regionName?: string;
}

export interface UsageSummary {
  totalBilledCost: number;
  totalEffectiveCost: number;
  charges: UsageCharge[];
  periodStart: string;
  periodEnd: string;
  projectId: string;
  projectName: string;
  sandboxUsage?: SandboxUsageSummary;
}

// Sandbox usage types — per-session metrics captured on stop

export interface SandboxSessionUsage {
  sessionId: string;
  sandboxName: string;
  stoppedAt: string; // ISO string
  durationMs: number; // wall-clock duration
  activeCpuMs: number; // active CPU time (excludes I/O wait)
  memoryMb: number; // memory allocated
  vcpus: number; // vCPUs allocated
  egressBytes: number;
  ingressBytes: number;
}

export interface SandboxUsageTotals {
  totalDurationMs: number;
  totalActiveCpuMs: number;
  totalEgressBytes: number;
  totalIngressBytes: number;
  totalSessions: number;
  memoryMb: number; // last known allocation
  vcpus: number; // last known allocation
}

export interface SandboxUsageCost {
  activeCpuCost: number; // $0.128/hr
  memoryCost: number; // $0.0212/GB-hr
  dataTransferCost: number; // $0.15/GB
  totalCost: number;
}

export interface SandboxUsageSummary {
  totals: SandboxUsageTotals;
  estimatedCost: SandboxUsageCost;
  recentSessions: SandboxSessionUsage[];
}

export interface DeploymentWithFunctionUrl extends Deployment {
  functionUrl: string;
}

// Output types for the playground
export type OutputType = "stdout" | "stderr" | "system";

export interface Output {
  type: OutputType;
  content: string;
  timestamp: Date;
}

// Runtime log types
export type RuntimeLogLevel = "error" | "warning" | "info";
export type RuntimeLogSource = "delimiter" | "edge-function" | "edge-middleware" | "serverless" | "request";

export interface RuntimeLog {
  level: RuntimeLogLevel;
  message: string;
  rowId: string;
  source: RuntimeLogSource;
  timestampInMs: number;
  domain?: string;
  requestMethod?: string;
  requestPath?: string;
  responseStatusCode?: number;
  messageTruncated?: boolean;
}

// API response types
export interface ApiSuccessResponse<T = unknown> {
  success: true;
  data?: T;
  message?: string;
}

export interface ApiErrorResponse {
  success: false;
  error: string;
}

export type ApiResponse<T = unknown> = ApiSuccessResponse<T> | ApiErrorResponse;

// SSE event types
export type SSEEventType = "stdout" | "stderr" | "exit" | "error" | "done" | "log" | "phase" | "build_done" | "deploy_done" | "snapshot" | "connected";

export interface SSEEvent<T = unknown> {
  type: SSEEventType;
  data?: T;
}
