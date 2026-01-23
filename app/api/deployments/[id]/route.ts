import { NextRequest } from "next/server";
import { getDeployment, deleteDeployment } from "@/lib/deployments-store";
import { deleteVercelDeployment } from "@/lib/vercel-deploy";

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

  return new Response(
    JSON.stringify({
      success: true,
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
    }),
    { status: 200, headers: { "Content-Type": "application/json" } }
  );
}

export async function DELETE(
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

  try {
    // Delete from Vercel
    await deleteVercelDeployment(id);
  } catch (error) {
    // Log but don't fail - deployment might already be deleted on Vercel
    console.warn(`Failed to delete deployment from Vercel: ${error}`);
  }

  // Delete from Redis store
  await deleteDeployment(id);

  return new Response(
    JSON.stringify({ success: true }),
    { status: 200, headers: { "Content-Type": "application/json" } }
  );
}
