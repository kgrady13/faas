import type { Session } from "./types";

export type { Session };

// Use globalThis to persist session across hot reloads in dev mode
const globalForSession = globalThis as unknown as {
  currentSession: Session | null;
};

// Initialize if not present
if (globalForSession.currentSession === undefined) {
  globalForSession.currentSession = null;
}

export function getSession(): Session | null {
  return globalForSession.currentSession;
}

export function setSession(session: Session | null): void {
  globalForSession.currentSession = session;
}

export function updateSession(updates: Partial<Session>): Session | null {
  if (globalForSession.currentSession) {
    globalForSession.currentSession = { ...globalForSession.currentSession, ...updates };
  }
  return globalForSession.currentSession;
}

export function clearSession(): void {
  globalForSession.currentSession = null;
}
