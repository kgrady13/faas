import { getSession } from "./session-store";
import { sseError } from "./api-response";
import type { Session } from "./types";

export interface SessionValidationSuccess {
  valid: true;
  session: Session;
  sandboxId: string;
}

export interface SessionValidationFailure {
  valid: false;
  error: Response;
}

export type SessionValidationResult = SessionValidationSuccess | SessionValidationFailure;

/**
 * Validates that there is an active session that can execute code.
 * Checks: session exists, not expired, not paused.
 *
 * @returns SessionValidationResult with either the valid session or an error Response
 */
export function validateActiveSession(): SessionValidationResult {
  const session = getSession();

  if (!session || !session.sandboxId) {
    return {
      valid: false,
      error: sseError("No active session. Please create a new session.", 400),
    };
  }

  // Check if session has expired
  if (Date.now() > session.timeout) {
    return {
      valid: false,
      error: sseError("Session has expired. Please create a new session.", 400),
    };
  }

  // Check if session is paused
  if (session.status === "paused") {
    return {
      valid: false,
      error: sseError("Session is paused. Click 'Resume' to continue.", 400),
    };
  }

  return {
    valid: true,
    session,
    sandboxId: session.sandboxId,
  };
}
