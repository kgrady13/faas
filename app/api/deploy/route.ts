import { NextRequest } from "next/server";
import { getSession } from "@/lib/session-store";
import { readBundledCode } from "@/lib/sandbox";
import { generateBuildOutput, createDeployment, getDeploymentStatus } from "@/lib/vercel-deploy";
import { addDeployment, updateDeployment, type Deployment } from "@/lib/deployments-store";

export async function POST(request: NextRequest) {
  const body = await request.json();
  const { functionName = "handler", cronSchedule } = body;

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

  try {
    // Read the bundled code from the sandbox
    const bundledCode = await readBundledCode(sandboxId);

    // Generate Build Output API files
    const files = generateBuildOutput(bundledCode, functionName, cronSchedule);

    // Create deployment on Vercel
    const deploymentResult = await createDeployment({
      files,
      functionName,
      cronSchedule,
    });

    // Store deployment in our local store
    const deployment: Deployment = {
      id: deploymentResult.id,
      url: deploymentResult.url,
      functionName,
      createdAt: new Date(),
      status: deploymentResult.readyState === 'READY' ? 'ready' :
              deploymentResult.readyState === 'ERROR' ? 'error' :
              deploymentResult.readyState === 'QUEUED' ? 'queued' : 'building',
      cronSchedule,
      errorMessage: deploymentResult.errorMessage,
    };

    addDeployment(deployment);

    // If deployment is not ready yet, poll for status
    if (deployment.status === 'building' || deployment.status === 'queued') {
      // Poll in the background (non-blocking)
      pollDeploymentStatus(deployment.id);
    }

    return new Response(
      JSON.stringify({
        success: true,
        deployment: {
          id: deployment.id,
          url: deployment.url,
          functionName: deployment.functionName,
          status: deployment.status,
          cronSchedule: deployment.cronSchedule,
          functionUrl: `${deployment.url}/api/${functionName}`,
        },
      }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Deployment failed";
    return new Response(
      JSON.stringify({ success: false, error: errorMessage }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}

/**
 * Poll deployment status until it's ready or fails
 */
async function pollDeploymentStatus(deploymentId: string) {
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

      updateDeployment(deploymentId, {
        status: newStatus,
        url: status.url,
        errorMessage: status.errorMessage,
      });

      // Stop polling if deployment is done
      if (newStatus === 'ready' || newStatus === 'error' || newStatus === 'canceled') {
        break;
      }
    } catch {
      // Ignore polling errors, continue trying
    }
  }
}
