import { NextRequest } from "next/server";
import { getSession, updateSession } from "@/lib/session-store";
import { executeCodeStreaming } from "@/lib/sandbox";

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

  // Check if session is paused
  if (session.status === "paused") {
    return new Response(
      JSON.stringify({ success: false, error: "Session is paused. Click 'Resume' to continue." }),
      { status: 400, headers: { "Content-Type": "application/json" } }
    );
  }

  const sandboxId = session.sandboxId;

  // Create a readable stream for SSE
  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();

      try {
        // Stream logs from the sandbox (reconnects if needed)
        for await (const event of executeCodeStreaming(code, sandboxId)) {
          const sseMessage = `data: ${JSON.stringify(event)}\n\n`;
          controller.enqueue(encoder.encode(sseMessage));
        }

        // Extend timeout by 2 minutes on successful execution
        updateSession({
          timeout: Date.now() + 2 * 60 * 1000,
        });

        // Send done event
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: "done" })}\n\n`));
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "Execution failed";
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
