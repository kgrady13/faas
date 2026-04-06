import { NextRequest } from "next/server";
import { getUserId, getUserProject } from "@/lib/deployments-store";
import { getUserUsage } from "@/lib/vercel-deploy";
import { jsonResponse, errorResponse } from "@/lib/api-response";

export async function GET(request: NextRequest) {
  const userId = getUserId(request);

  const userProject = await getUserProject(userId);
  if (!userProject) {
    return jsonResponse({ usage: null, message: "No project found. Deploy a function first." });
  }

  // Default to current calendar month
  const searchParams = request.nextUrl.searchParams;
  const now = new Date();
  const defaultFrom = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
  const defaultTo = now.toISOString();

  const from = searchParams.get("from") || defaultFrom;
  const to = searchParams.get("to") || defaultTo;

  try {
    const usage = await getUserUsage(userProject.vercelProjectId, from, to);
    usage.projectName = userProject.projectName;

    return jsonResponse({ usage });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to fetch usage";
    console.error("Usage fetch error:", message);
    return errorResponse(message, 500);
  }
}
