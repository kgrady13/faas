import { NextRequest } from "next/server";
import { getSession, setSession } from "@/lib/session-store";
import { getOrCreateSandbox } from "@/lib/sandbox";
import { jsonSuccess, jsonError } from "@/lib/api-response";

// With persistent sandboxes, "restore" is just resuming the sandbox.
// The SDK auto-resumes from the last snapshot.
export async function POST(request: NextRequest) {
  try {
    const session = getSession();

    if (!session?.sandboxName) {
      return jsonError("No session to restore", 400);
    }

    // Get the persistent sandbox — auto-resumes from last state
    await getOrCreateSandbox(session.sandboxName);

    const updated = {
      sandboxName: session.sandboxName,
      status: "running" as const,
      timeout: Date.now() + 30 * 60 * 1000,
      createdAt: session.createdAt,
    };

    setSession(updated);

    return jsonSuccess({
      session: {
        ...updated,
        remainingTime: Math.max(0, updated.timeout - Date.now()),
      },
      message: "Sandbox resumed from saved state.",
    });
  } catch (error) {
    console.error("Failed to restore sandbox:", error);
    return jsonError(
      error instanceof Error ? error.message : "Failed to restore sandbox",
      500
    );
  }
}
