import { NextRequest } from "next/server";
import { getSession, setSession, clearSession } from "@/lib/session-store";
import { getOrCreateSandbox, stopSandbox, generateSandboxName } from "@/lib/sandbox";
import { getUserId } from "@/lib/deployments-store";
import { jsonSuccess, jsonError } from "@/lib/api-response";

// POST /api/session - Create or resume a persistent sandbox
export async function POST(request: NextRequest) {
  try {
    const userId = getUserId(request);
    const sandboxName = generateSandboxName(userId);

    // Stop tracking any previous session in local state
    const existingSession = getSession();
    if (existingSession && existingSession.sandboxName !== sandboxName) {
      clearSession();
    }

    // Get existing sandbox or create a new one (persistent by default)
    const sandbox = await getOrCreateSandbox(sandboxName);

    const session = {
      sandboxName,
      status: "running" as const,
      timeout: Date.now() + 30 * 60 * 1000, // 30 minutes (VM auto-stops, state persists)
      createdAt: new Date(),
    };

    setSession(session);

    return jsonSuccess({
      session: {
        ...session,
        remainingTime: Math.max(0, session.timeout - Date.now()),
      },
    });
  } catch (error) {
    console.error("Failed to create/resume session:", error);
    return jsonError("Failed to create sandbox", 500);
  }
}

// GET /api/session - Get session status
export async function GET() {
  const session = getSession();

  if (!session) {
    return jsonSuccess({ session: null });
  }

  const isExpired = Date.now() > session.timeout;

  return jsonSuccess({
    session: {
      ...session,
      remainingTime: Math.max(0, session.timeout - Date.now()),
      // With persistent sandboxes, "expired" just means the VM auto-stopped.
      // State is preserved and will auto-resume on next command.
      isActive: !isExpired,
    },
  });
}

// DELETE /api/session - Stop sandbox (state persists automatically)
export async function DELETE() {
  const session = getSession();

  try {
    if (session?.sandboxName) {
      await stopSandbox(session.sandboxName);
    }
    clearSession();

    return jsonSuccess({
      message: "Sandbox stopped. Your environment is saved and will resume on next session.",
    });
  } catch (error) {
    console.error("Failed to stop session:", error);
    clearSession();
    return jsonSuccess({});
  }
}
