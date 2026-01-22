import { NextResponse } from "next/server";
import { getSession, clearSession } from "@/lib/session-store";
import { stopSandbox } from "@/lib/sandbox";

export async function POST() {
  try {
    const session = getSession();

    if (!session || !session.sandboxId) {
      return NextResponse.json(
        { success: false, error: "No active session" },
        { status: 400 }
      );
    }

    // Stop the sandbox (no snapshot created)
    await stopSandbox(session.sandboxId);

    // Clear the session completely
    clearSession();

    return NextResponse.json({
      success: true,
      message: "Sandbox stopped and session cleared.",
    });
  } catch (error) {
    console.error("Failed to stop sandbox:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Failed to stop sandbox",
      },
      { status: 500 }
    );
  }
}
