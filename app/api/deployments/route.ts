import { getAllDeployments } from "@/lib/deployments-store";

export async function GET() {
  const deployments = getAllDeployments();

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
        createdAt: d.createdAt.toISOString(),
        errorMessage: d.errorMessage,
      })),
    }),
    { status: 200, headers: { "Content-Type": "application/json" } }
  );
}
