import { getSession, clearSession } from "@/lib/session-store";
import { stopSandbox } from "@/lib/sandbox";
import { jsonSuccess, jsonError } from "@/lib/api-response";

export async function POST() {
  try {
    const session = getSession();

    if (!session || !session.sandboxName) {
      return jsonError("No active session", 400);
    }

    // Stop the sandbox VM — state persists automatically
    await stopSandbox(session.sandboxName);
    clearSession();

    return jsonSuccess({
      message: "Sandbox stopped. Your environment is saved and will resume on next session.",
    });
  } catch (error) {
    console.error("Failed to stop sandbox:", error);
    return jsonError(
      error instanceof Error ? error.message : "Failed to stop sandbox",
      500
    );
  }
}
