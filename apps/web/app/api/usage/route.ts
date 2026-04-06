import { NextRequest } from "next/server";
import { getUserId, getUserProject } from "@/lib/deployments-store";
import { getUserUsage } from "@/lib/vercel-deploy";
import { generateSandboxName } from "@/lib/sandbox";
import {
  getSandboxUsageTotals,
  getRecentSessions,
  calculateSandboxCost,
} from "@/lib/sandbox-usage-store";
import { jsonResponse, errorResponse } from "@/lib/api-response";

export async function GET(request: NextRequest) {
  const userId = getUserId(request);

  // Default to current calendar month
  const searchParams = request.nextUrl.searchParams;
  const now = new Date();
  const defaultFrom = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
  const defaultTo = now.toISOString();

  const from = searchParams.get("from") || defaultFrom;
  const to = searchParams.get("to") || defaultTo;

  try {
    // Fetch deployment usage (requires a per-user project)
    const userProject = await getUserProject(userId);
    let usage = null;

    if (userProject) {
      usage = await getUserUsage(userProject.vercelProjectId, from, to);
      usage.projectName = userProject.projectName;
    }

    // Fetch sandbox usage (independent of deployment project)
    const sandboxName = generateSandboxName(userId);
    const totals = await getSandboxUsageTotals(sandboxName);

    if (totals) {
      const estimatedCost = calculateSandboxCost(totals);
      const recentSessions = await getRecentSessions(sandboxName, 5);

      const sandboxUsage = { totals, estimatedCost, recentSessions };

      if (usage) {
        usage.sandboxUsage = sandboxUsage;
      } else {
        // No deployment project yet, but sandbox usage exists
        return jsonResponse({
          usage: {
            totalBilledCost: 0,
            totalEffectiveCost: 0,
            charges: [],
            periodStart: from,
            periodEnd: to,
            projectId: "",
            projectName: "",
            sandboxUsage,
          },
        });
      }
    }

    if (!usage) {
      return jsonResponse({ usage: null, message: "No usage data yet. Start a session or deploy a function." });
    }

    return jsonResponse({ usage });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to fetch usage";
    console.error("Usage fetch error:", message);
    return errorResponse(message, 500);
  }
}
