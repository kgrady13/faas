import { NextRequest } from "next/server";
import { updateSession } from "@/lib/session-store";
import { buildCode, createSnapshot } from "@/lib/sandbox";
import { generateBuildOutput, createDeployment, getDeploymentStatus } from "@/lib/vercel-deploy";
import { addDeployment, updateDeployment, getUserId, type Deployment } from "@/lib/deployments-store";
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

  const { sandboxId } = validation;

  // Create a readable stream for SSE
  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();

      const emit = (type: string, data: unknown) => {
        const sseMessage = `data: ${JSON.stringify({ type, data })}\n\n`;
        controller.enqueue(encoder.encode(sseMessage));
      };

      try {
        // Phase 1: Build
        emit("phase", "build");

        let buildSucceeded = false;

        for await (const event of buildCode(code, sandboxId)) {
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

        // Read the bundled code
        const { getOrReconnectSandbox } = await import("@/lib/sandbox");
        const sandbox = await getOrReconnectSandbox(sandboxId);
        const result = await sandbox.runCommand("cat", ["/tmp/dist/index.js"]);
        if (result.exitCode !== 0) {
          emit("error", "Failed to read bundled code");
          return;
        }
        const bundledCode = await result.stdout();

        // Phase 2: Deploy
        emit("phase", "deploy");
        emit("log", "Creating Vercel deployment...");

        // Generate Build Output API files
        const files = generateBuildOutput(bundledCode, functionName, cronSchedule);

        // Create deployment on Vercel
        const deploymentResult = await createDeployment({
          files,
          functionName,
          cronSchedule,
          regions,
        });

        // Store deployment in our local store
        // Use user-selected regions, or fetch from API response once deployment is ready
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
        };

        await addDeployment(userId, deployment);

        // If deployment is not ready yet, poll for status
        if (deployment.status === "building" || deployment.status === "queued") {
          pollDeploymentStatus(userId, deployment.id);
        }

        emit("log", `Deployment started: ${deployment.id}`);
        emit("deploy_done", {
          id: deployment.id,
          url: deployment.url,
          functionName: deployment.functionName,
          status: deployment.status,
          cronSchedule: deployment.cronSchedule,
          functionUrl: `${deployment.url}/api/${functionName}`,
        });

        // Create snapshot to pause the sandbox after deployment
        try {
          const snapshotId = await createSnapshot(sandboxId);
          updateSession({
            snapshotId,
            status: "paused",
          });
          emit("snapshot", { id: snapshotId });
          emit("log", `Sandbox paused. Snapshot: ${snapshotId}`);
        } catch (snapshotError) {
          console.error("Failed to create snapshot after deployment:", snapshotError);
          emit("log", "Warning: Failed to create snapshot after deployment");
        }

        // Extend timeout on successful deploy
        updateSession({
          timeout: Date.now() + 2 * 60 * 1000,
        });
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

/**
 * Poll deployment status until it's ready or fails
 */
async function pollDeploymentStatus(userId: string, deploymentId: string) {
  const maxAttempts = 60; // 5 minutes max
  let attempts = 0;

  while (attempts < maxAttempts) {
    await new Promise(resolve => setTimeout(resolve, 5000)); // Wait 5 seconds
    attempts++;

    try {
      const status = await getDeploymentStatus(deploymentId);

      const newStatus = status.readyState === 'READY' ? 'ready' :
                        status.readyState === 'ERROR' ? 'error' :
                        status.readyState === 'CANCELED' ? 'canceled' :
                        status.readyState === 'QUEUED' ? 'queued' : 'building';

      const updates: Partial<Deployment> = {
        status: newStatus,
        url: status.url,
        errorMessage: status.errorMessage,
      };
      // Only update regions if API returns them
      if (status.regions && status.regions.length > 0) {
        updates.regions = status.regions;
      }
      await updateDeployment(userId, deploymentId, updates);

      // Stop polling if deployment is done
      if (newStatus === 'ready' || newStatus === 'error' || newStatus === 'canceled') {
        break;
      }
    } catch {
      // Ignore polling errors, continue trying
    }
  }
}
