import { getSession, updateSession } from "@/lib/session-store";
import { createSnapshot } from "@/lib/sandbox";
import { jsonSuccess, jsonError } from "@/lib/api-response";

export async function POST() {
  try {
    const session = getSession();

    if (!session || !session.sandboxId) {
      return jsonError("No active session", 400);
    }

    // Create snapshot (this stops the sandbox) - reconnects if needed
    const snapshotId = await createSnapshot(session.sandboxId);

    // Update session with snapshot info
    updateSession({
      snapshotId,
      status: "paused",
    });

    return jsonSuccess({
      snapshotId,
      message: "Snapshot created. Sandbox has been stopped. Use Restore to resume.",
    });
  } catch (error) {
    console.error("Failed to create snapshot:", error);
    return jsonError(
      error instanceof Error ? error.message : "Failed to create snapshot",
      500
    );
  }
}
