import { NextRequest } from "next/server";
import { getAllDeployments, getUserId } from "@/lib/deployments-store";

export async function GET(request: NextRequest) {
  const userId = getUserId(request);
  const deployments = await getAllDeployments(userId);

  return new Response(
    JSON.stringify({
      success: true,
      deployments: deployments.map(d => ({
        id: d.id,
        url: d.url,
        functionName: d.functionName,
        functionUrl: `${d.url}/api/${d.functionName}`,
        status: d.status,
        cronSchedule: d.cronSchedule,
        regions: d.regions,
        createdAt: d.createdAt,
        errorMessage: d.errorMessage,
      })),
    }),
    { status: 200, headers: { "Content-Type": "application/json" } }
  );
}
