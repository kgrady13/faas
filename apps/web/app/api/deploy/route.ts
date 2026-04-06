import { NextRequest } from "next/server";
import { buildCode, getSandbox } from "@/lib/sandbox";
import { generateBuildOutput, createDeployment, ensureUserProject } from "@/lib/vercel-deploy";
import { addDeployment, getUserId } from "@/lib/deployments-store";
import type { Deployment } from "@/lib/types";
import { sseError, sseResponse } from "@/lib/api-response";
import { validateActiveSession } from "@/lib/session-validation";

export async function POST(request: NextRequest) {
  const body = await request.json();
  const { code, functionName = "handler", cronSchedule, regions } = body;

  if (!code || typeof code !== "string") {
    return sseError("Code is required", 400);
  }

  const userId = getUserId(request);
  const validation = validateActiveSession();
  if (!validation.valid) {
    return validation.error;
  }

  const { sandboxName } = validation;

  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();

      const emit = (type: string, data: unknown) => {
        const sseMessage = `data: ${JSON.stringify({ type, data })}\n\n`;
        controller.enqueue(encoder.encode(sseMessage));
      };

      try {
        // Phase 0: Ensure per-user Vercel project exists
        emit("phase", "setup");
        emit("log", "Ensuring deployment project exists...");

        let userProject;
        try {
          userProject = await ensureUserProject(userId);
          emit("log", `Project ready: ${userProject.projectName}`);
        } catch (err) {
          emit("error", `Failed to create deployment project: ${err instanceof Error ? err.message : String(err)}`);
          return;
        }

        // Phase 1: Build
        emit("phase", "build");

        let buildSucceeded = false;

        for await (const event of buildCode(code, sandboxName)) {
          if (event.type === "log") {
            emit("log", event.data);
          } else if (event.type === "error") {
            emit("error", event.data);
          } else if (event.type === "done") {
            buildSucceeded = true;
            emit("build_done", event.data);
          }
        }

        if (!buildSucceeded) {
          emit("error", "Build failed");
          return;
        }

        // Read the bundled code from sandbox
        const sandbox = await getSandbox(sandboxName);
        const result = await sandbox.runCommand("cat", ["/tmp/dist/index.js"]);
        if (result.exitCode !== 0) {
          emit("error", "Failed to read bundled code");
          return;
        }
        const bundledCode = await result.stdout();

        // Phase 2: Deploy
        emit("phase", "deploy");
        emit("log", "Creating Vercel deployment...");

        const files = generateBuildOutput(bundledCode, functionName, cronSchedule);

        const deploymentResult = await createDeployment({
          files,
          functionName,
          cronSchedule,
          regions,
          projectId: userProject.vercelProjectId,
        });

        const deployment: Deployment = {
          id: deploymentResult.id,
          url: deploymentResult.url,
          functionName,
          createdAt: new Date().toISOString(),
          status: deploymentResult.readyState === "READY" ? "ready" :
                  deploymentResult.readyState === "ERROR" ? "error" :
                  deploymentResult.readyState === "QUEUED" ? "queued" : "building",
          cronSchedule,
          regions: regions || deploymentResult.regions,
          errorMessage: deploymentResult.errorMessage,
          vercelProjectId: userProject.vercelProjectId,
        };

        await addDeployment(userId, deployment);

        emit("log", `Deployment started: ${deployment.id}`);
        emit("deploy_done", {
          id: deployment.id,
          url: deployment.url,
          functionName: deployment.functionName,
          status: deployment.status,
          cronSchedule: deployment.cronSchedule,
          functionUrl: `${deployment.url}/api/${functionName}`,
        });

        // No manual snapshot needed — persistent sandboxes auto-save on stop
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "Deployment failed";
        emit("error", errorMessage);
      } finally {
        controller.close();
      }
    },
  });

  return sseResponse(stream);
}
