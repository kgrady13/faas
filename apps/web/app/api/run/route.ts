import { NextRequest } from "next/server";
import { updateSession } from "@/lib/session-store";
import { executeCodeStreaming } from "@/lib/sandbox";
import { sseError, sseResponse } from "@/lib/api-response";
import { validateActiveSession } from "@/lib/session-validation";

export async function POST(request: NextRequest) {
  const { code } = await request.json();

  if (!code || typeof code !== "string") {
    return sseError("Code is required", 400);
  }

  const validation = validateActiveSession();
  if (!validation.valid) {
    return validation.error;
  }

  const { sandboxId } = validation;

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

  return sseResponse(stream);
}
