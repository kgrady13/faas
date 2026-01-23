import { NextRequest } from "next/server";
import { getDeployment, deleteDeployment, getUserId } from "@/lib/deployments-store";
import { deleteVercelDeployment } from "@/lib/vercel-deploy";
import { jsonResponse, errorResponse } from "@/lib/api-response";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const userId = getUserId(request);
  const deployment = await getDeployment(userId, id);

  if (!deployment) {
    return errorResponse("Deployment not found", 404);
  }

  return jsonResponse({
    deployment: {
      id: deployment.id,
      url: deployment.url,
      functionName: deployment.functionName,
      functionUrl: `${deployment.url}/api/${deployment.functionName}`,
      status: deployment.status,
      cronSchedule: deployment.cronSchedule,
      createdAt: deployment.createdAt,
      errorMessage: deployment.errorMessage,
    },
  });
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const userId = getUserId(request);
  const deployment = await getDeployment(userId, id);

  if (!deployment) {
    return errorResponse("Deployment not found", 404);
  }

  try {
    // Delete from Vercel
    await deleteVercelDeployment(id);
  } catch (error) {
    // Distinguish between 404 (already deleted) and other errors
    const is404 = error instanceof Error && error.message.includes("404");
    if (!is404) {
      // Log non-404 errors but don't fail - we still want to clean up local state
      console.warn(`Failed to delete deployment from Vercel: ${error}`);
    }
  }

  // Delete from Redis store
  await deleteDeployment(userId, id);

  return jsonResponse({});
}
