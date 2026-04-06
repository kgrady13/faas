import { getSession } from "./session-store";
import { sseError } from "./api-response";
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
 * Validates that there is a session with a sandbox name.
 * With persistent sandboxes, the SDK auto-resumes stopped VMs on command,
 * so we only need to verify a sandbox name exists.
 */
export function validateActiveSession(): SessionValidationResult {
  const session = getSession();

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
