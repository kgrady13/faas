import { getSession, updateSession } from "@/lib/session-store";
import { stopSandbox } from "@/lib/sandbox";
import { jsonSuccess, jsonError } from "@/lib/api-response";

// With persistent sandboxes, "snapshot" is just stopping the sandbox.
// State is automatically saved on stop and restored on resume.
export async function POST() {
  try {
    const session = getSession();

    if (!session || !session.sandboxName) {
      return jsonError("No active session", 400);
    }

    const { usage } = await stopSandbox(session.sandboxName);
    updateSession({ status: "paused" });

    return jsonSuccess({
      message: "Sandbox paused. State saved automatically. Use Resume to continue.",
      usage,
    });
  } catch (error) {
    console.error("Failed to pause sandbox:", error);
    return jsonError(
      error instanceof Error ? error.message : "Failed to pause sandbox",
      500
    );
  }
}
