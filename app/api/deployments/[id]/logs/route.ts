import { NextRequest } from "next/server";
import { getDeployment } from "@/lib/deployments-store";
import { streamDeploymentLogs } from "@/lib/vercel-deploy";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const deployment = await getDeployment(id);

  if (!deployment) {
    return new Response(
      JSON.stringify({ success: false, error: "Deployment not found" }),
      { status: 404, headers: { "Content-Type": "application/json" } }
    );
  }

  // Create a custom ReadableStream that first sends "connected" then pipes Vercel logs
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      // Send connected message immediately
      controller.enqueue(
        encoder.encode(`data: ${JSON.stringify({ type: "connected" })}\n\n`)
      );

      try {
        const logStream = await streamDeploymentLogs(id);
        const reader = logStream.getReader();
        const decoder = new TextDecoder();
        let buffer = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });

          // Vercel sends newline-delimited JSON objects
          const lines = buffer.split("\n");
          buffer = lines.pop() || ""; // Keep incomplete line in buffer

          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed) continue;
            try {
              const logEntry = JSON.parse(trimmed);
              controller.enqueue(
                encoder.encode(
                  `data: ${JSON.stringify({ type: "log", data: logEntry })}\n\n`
                )
              );
            } catch {
              // Skip non-JSON lines (e.g., Vercel heartbeat or metadata)
            }
          }
        }

        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify({ type: "done" })}\n\n`)
        );
        controller.close();
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unknown error";
        console.error("Log stream error:", message);
        controller.enqueue(
          encoder.encode(
            `data: ${JSON.stringify({ type: "error", data: message })}\n\n`
          )
        );
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
