import { NextRequest } from "next/server";
import { saveCode } from "@/lib/sandbox";
import { jsonSuccess, jsonError } from "@/lib/api-response";
import { validateActiveSession } from "@/lib/session-validation";

// POST /api/save - Write editor code to sandbox filesystem
export async function POST(request: NextRequest) {
  const { code } = await request.json();

  if (!code || typeof code !== "string") {
    return jsonError("Code is required", 400);
  }

  const validation = validateActiveSession(request);
  if (!validation.valid) {
    return jsonError("No active session", 400);
  }

  try {
    await saveCode(validation.sandboxName, code);
    return jsonSuccess({ saved: true });
  } catch (error) {
    console.error("Failed to save code:", error);
    return jsonError("Failed to save code to sandbox", 500);
  }
}
