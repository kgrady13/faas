import { NextRequest } from "next/server";
import { buildCode } from "@/lib/sandbox";
import { sseError, sseResponse } from "@/lib/api-response";
import { validateActiveSession } from "@/lib/session-validation";

export async function POST(request: NextRequest) {
  const { code } = await request.json();

  if (!code || typeof code !== "string") {
    return sseError("Code is required", 400);
  }

  const validation = validateActiveSession(request);
  if (!validation.valid) {
    return validation.error;
  }

  const { sandboxName } = validation;

  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();

      try {
        for await (const event of buildCode(code, sandboxName)) {
          const sseMessage = `data: ${JSON.stringify(event)}\n\n`;
          controller.enqueue(encoder.encode(sseMessage));
        }
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

  return sseResponse(stream);
}
