/**
 * Shared type definitions for the FaaS platform
 */

// Session types
export type SessionStatus = "pending" | "running" | "stopping" | "stopped" | "paused" | "failed";

export interface Session {
  sandboxId: string;
  status: SessionStatus;
  timeout: number;
  snapshotId?: string;
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
