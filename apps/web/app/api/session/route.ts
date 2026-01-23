import { NextResponse } from "next/server";
import { getSession, setSession, clearSession } from "@/lib/session-store";
import { createSandbox, stopSandbox } from "@/lib/sandbox";
import { jsonSuccess, jsonError } from "@/lib/api-response";

// POST /api/session - Create new session
export async function POST() {
  try {
    // Stop any existing sandbox first
    const existingSession = getSession();
    if (existingSession?.sandboxId) {
      try {
        await stopSandbox(existingSession.sandboxId);
      } catch {
        // Ignore errors stopping old sandbox
      }
    }

    // Create new sandbox
    const sandbox = await createSandbox();

    const session = {
      sandboxId: sandbox.sandboxId,
      status: "running" as const,
      timeout: Date.now() + 5 * 60 * 1000, // 5 minutes default
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
    console.error("Failed to create session:", error);
    return jsonError("Failed to create sandbox", 500);
  }
}

// GET /api/session - Get session status
export async function GET() {
  const session = getSession();

  if (!session) {
    return NextResponse.json({ session: null });
  }

  const isExpired = Date.now() > session.timeout;

  // Update status if expired
  if (isExpired && session.status === "running") {
    session.status = "stopped";
  }

  return NextResponse.json({
    session: {
      ...session,
      remainingTime: Math.max(0, session.timeout - Date.now()),
      isActive: session.status === "running" && !isExpired,
    },
  });
}

// DELETE /api/session - Stop session
export async function DELETE() {
  const session = getSession();

  try {
    if (session?.sandboxId) {
      await stopSandbox(session.sandboxId);
    }
    clearSession();

    return jsonSuccess({});
  } catch (error) {
    console.error("Failed to stop session:", error);
    clearSession();
    return jsonSuccess({}); // Still clear session even if stop fails
  }
}
