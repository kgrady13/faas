import { NextRequest, NextResponse } from "next/server";
import { getSession, setSession } from "@/lib/session-store";
import { createSandbox } from "@/lib/sandbox";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    let snapshotId = body.snapshotId;

    // If no snapshotId provided, try to get from current session
    if (!snapshotId) {
      const session = getSession();
      snapshotId = session?.snapshotId;
    }

    if (!snapshotId) {
      return NextResponse.json(
        { success: false, error: "No snapshot available to restore" },
        { status: 400 }
      );
    }

    // Create sandbox from snapshot
    const sandbox = await createSandbox(snapshotId);

    const session = {
      sandboxId: sandbox.sandboxId,
      status: "running" as const,
      timeout: Date.now() + 5 * 60 * 1000,
      snapshotId,
      createdAt: new Date(),
    };

    setSession(session);

    return NextResponse.json({
      success: true,
      session: {
        ...session,
        remainingTime: Math.max(0, session.timeout - Date.now()),
      },
      message: "Sandbox restored from snapshot",
    });
  } catch (error) {
    console.error("Failed to restore snapshot:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Failed to restore snapshot",
      },
      { status: 500 }
    );
  }
}
