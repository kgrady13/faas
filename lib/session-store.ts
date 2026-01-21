export interface Session {
  sandboxId: string;
  status: 'pending' | 'running' | 'stopping' | 'stopped' | 'failed';
  timeout: number;
  snapshotId?: string;
  createdAt: Date;
}

// In-memory singleton storing current session
let currentSession: Session | null = null;

export function getSession(): Session | null {
  return currentSession;
}

export function setSession(session: Session | null): void {
  currentSession = session;
}

export function updateSession(updates: Partial<Session>): Session | null {
  if (currentSession) {
    currentSession = { ...currentSession, ...updates };
  }
  return currentSession;
}

export function clearSession(): void {
  currentSession = null;
}
