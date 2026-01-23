import { getSession, clearSession } from "@/lib/session-store";
import { stopSandbox } from "@/lib/sandbox";
import { jsonSuccess, jsonError } from "@/lib/api-response";

export async function POST() {
  try {
    const session = getSession();

    if (!session || !session.sandboxId) {
      return jsonError("No active session", 400);
    }

    // Stop the sandbox (no snapshot created)
    await stopSandbox(session.sandboxId);

    // Clear the session completely
    clearSession();

    return jsonSuccess({
      message: "Sandbox stopped and session cleared.",
    });
  } catch (error) {
    console.error("Failed to stop sandbox:", error);
    return jsonError(
      error instanceof Error ? error.message : "Failed to stop sandbox",
      500
    );
  }
}
