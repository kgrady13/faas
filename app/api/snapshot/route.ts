import { NextResponse } from "next/server";
import { getSession, updateSession } from "@/lib/session-store";
import { createSnapshot } from "@/lib/sandbox";

export async function POST() {
  try {
    const session = getSession();

    if (!session || !session.sandboxId) {
      return NextResponse.json(
        { success: false, error: "No active session" },
        { status: 400 }
      );
    }

    // Create snapshot (this stops the sandbox) - reconnects if needed
    const snapshotId = await createSnapshot(session.sandboxId);

    // Update session with snapshot info
    updateSession({
      snapshotId,
      status: "paused",
    });

    return NextResponse.json({
      success: true,
      snapshotId,
      message: "Snapshot created. Sandbox has been stopped. Use Restore to resume.",
    });
  } catch (error) {
    console.error("Failed to create snapshot:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Failed to create snapshot",
      },
      { status: 500 }
    );
  }
}
