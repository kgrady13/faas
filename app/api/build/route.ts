import { NextRequest } from "next/server";
import { getSession, updateSession } from "@/lib/session-store";
import { buildCode } from "@/lib/sandbox";

export async function POST(request: NextRequest) {
  const { code } = await request.json();

  if (!code || typeof code !== "string") {
    return new Response(
      JSON.stringify({ success: false, error: "Code is required" }),
      { status: 400, headers: { "Content-Type": "application/json" } }
    );
  }

  const session = getSession();

  if (!session || !session.sandboxId) {
    return new Response(
      JSON.stringify({ success: false, error: "No active session. Please create a new session." }),
      { status: 400, headers: { "Content-Type": "application/json" } }
    );
  }

  // Check if session has expired
  if (Date.now() > session.timeout) {
    return new Response(
      JSON.stringify({ success: false, error: "Session has expired. Please create a new session." }),
      { status: 400, headers: { "Content-Type": "application/json" } }
    );
  }

  const sandboxId = session.sandboxId;

  // Create a readable stream for SSE
  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();

      try {
        // Stream build logs from the sandbox
        for await (const event of buildCode(code, sandboxId)) {
          const sseMessage = `data: ${JSON.stringify(event)}\n\n`;
          controller.enqueue(encoder.encode(sseMessage));
        }

        // Extend timeout by 2 minutes on successful build
        updateSession({
          timeout: Date.now() + 2 * 60 * 1000,
        });
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "Build failed";
        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify({ type: "error", data: errorMessage })}\n\n`)
        );
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
