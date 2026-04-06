import { type NextRequest } from "next/server";
import { sseError, sseResponse } from "@/lib/api-response";
import { streamBuildLogs } from "@/lib/vercel-deploy";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: deploymentId } = await params;

  if (!deploymentId) {
    return sseError("Deployment ID is required", 400);
  }

  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();

      const emit = (type: string, data: unknown) => {
        const sseMessage = `data: ${JSON.stringify({ type, data })}\n\n`;
        controller.enqueue(encoder.encode(sseMessage));
      };

      try {
        for await (const event of streamBuildLogs(deploymentId)) {
          switch (event.type) {
            case "stdout":
            case "stderr":
            case "command":
              emit(event.type, event.text);
              break;
            case "state":
              emit("state", event.readyState);
              break;
            case "done":
              emit("done", event.readyState);
              break;
            case "error":
              emit("error", event.message);
              break;
          }
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unknown error";
        emit("error", message);
      } finally {
        controller.close();
      }
    },
  });

  return sseResponse(stream);
}
