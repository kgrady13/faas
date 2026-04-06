import { NextRequest } from "next/server";
import { getSession, setSession } from "./session-store";
import { sseError } from "./api-response";
import { getUserId } from "./deployments-store";
import { generateSandboxName } from "./sandbox";
import type { Session } from "./types";

export interface SessionValidationSuccess {
  valid: true;
  session: Session;
  sandboxName: string;
}

export interface SessionValidationFailure {
  valid: false;
  error: Response;
}

export type SessionValidationResult = SessionValidationSuccess | SessionValidationFailure;

/**
 * Validates that there is a sandbox to work with.
 *
 * With persistent sandboxes, the sandbox name is deterministic from the user ID.
 * If the in-memory session was lost (dev hot-reload), we recover it from the request.
 */
export function validateActiveSession(request?: NextRequest): SessionValidationResult {
  let session = getSession();

  // If session was lost from globalThis (hot-reload, restart), recover from request
  if ((!session || !session.sandboxName) && request) {
    const userId = getUserId(request);
    const sandboxName = generateSandboxName(userId);
    session = {
      sandboxName,
      status: "running",
      timeout: Date.now() + 30 * 60 * 1000,
      createdAt: new Date(),
    };
    setSession(session);
  }

  if (!session || !session.sandboxName) {
    return {
      valid: false,
      error: sseError("No active session. Please create a new session.", 400),
    };
  }

  return {
    valid: true,
    session,
    sandboxName: session.sandboxName,
  };
}
