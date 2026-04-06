"use client";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import { Clock, Copy, MoreVertical, RefreshCw } from "lucide-react";
import type { DeploymentState } from "@/hooks";
import type { UsageSummary } from "@/lib/types";
import { Shimmer } from "@/components/ai-elements/shimmer";
import { usePlaygroundStore } from "@/lib/store/playground-store";

interface DeploymentsPanelProps {
  deployments: DeploymentState[];
  onRefresh: () => void;
  onCopyUrl: (url: string) => void;
  onDelete: (id: string) => void;
  usage: UsageSummary | null;
  usageLoading: boolean;
  onRefreshUsage: () => void;
}

function getDeploymentStatusBadge(status: DeploymentState["status"]) {
  const variants: Record<
    DeploymentState["status"],
    "default" | "secondary" | "destructive" | "outline"
  > = {
    ready: "default",
    building: "secondary",
    queued: "secondary",
    error: "destructive",
    canceled: "outline",
  };

  return (
    <Badge variant={variants[status]} className="text-xs">
      {status === "building" ? <Shimmer>building</Shimmer> : status}
    </Badge>
  );
}

function UsageSummarySection({
  usage,
  loading,
  onRefresh,
}: {
  usage: UsageSummary | null;
  loading: boolean;
  onRefresh: () => void;
}) {
  if (loading) {
    return (
      <div className="px-3 py-2 border-b border-border">
        <Shimmer>Loading usage...</Shimmer>
      </div>
    );
  }

  if (!usage) return null;

  // Aggregate charges by service name
  const byService = new Map<string, number>();
  for (const charge of usage.charges) {
    byService.set(
      charge.serviceName,
      (byService.get(charge.serviceName) || 0) + charge.billedCost
    );
  }
  const topServices = [...byService.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3);

  return (
    <div className="px-3 py-2 border-b border-border space-y-1">
      <div className="flex items-center justify-between">
        <span className="text-xs text-muted-foreground uppercase tracking-wide">
          Usage (This Month)
        </span>
        <Button
          variant="ghost"
          size="icon"
          className="size-6"
          onClick={onRefresh}
        >
          <RefreshCw className="size-3" />
        </Button>
      </div>
      <div className="flex items-center justify-between">
        <span className="text-xs text-muted-foreground">Total Cost</span>
        <span className="text-sm font-mono font-medium">
          ${usage.totalBilledCost.toFixed(4)}
        </span>
      </div>
      {topServices.map(([name, cost]) => (
        <div key={name} className="flex items-center justify-between">
          <span className="text-xs text-muted-foreground truncate max-w-[60%]">
            {name}
          </span>
          <span className="text-xs font-mono">${cost.toFixed(4)}</span>
        </div>
      ))}
    </div>
  );
}

export function DeploymentsPanel({
  deployments,
  onRefresh,
  onCopyUrl,
  onDelete,
  usage,
  usageLoading,
  onRefreshUsage,
}: DeploymentsPanelProps) {
  const setInspectedDeployment = usePlaygroundStore((s) => s.setInspectedDeployment);

  return (
    <div className="h-32 md:h-48 shrink-0 flex flex-col">
      <UsageSummarySection
        usage={usage}
        loading={usageLoading}
        onRefresh={onRefreshUsage}
      />
      <div className="shrink-0 px-3 py-2 border-b border-border text-sm text-muted-foreground flex items-center justify-between">
        <span>Deployed Functions ({deployments.length})</span>
        <Button variant="ghost" size="xs" onClick={onRefresh}>
          Refresh
        </Button>
      </div>
      <div className="flex-1 overflow-auto">
        {deployments.length === 0 ? (
          <div className="p-4 text-sm text-muted-foreground">
            No deployments yet. Build and deploy your code to see them here.
          </div>
        ) : (
          <div className="divide-y divide-border">
            {deployments.map((deployment) => (
              <div
                key={deployment.id}
                className="p-3 flex items-center gap-3 text-sm"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium truncate">
                      {deployment.functionName}
                    </span>
                    {getDeploymentStatusBadge(deployment.status)}
                    {deployment.cronSchedule && (
                      <>
                        <Clock className="size-3 -mr-1 text-muted-foreground" />
                        <span className="text-xs text-muted-foreground">cron</span>
                      </>
                    )}
                    {deployment.regions && deployment.regions.length > 0 && (
                      <div className="flex items-center gap-1">
                        {deployment.regions.slice(0, 3).map((region) => (
                          <Badge
                            key={region}
                            variant="outline"
                            className="text-xs py-0 px-1"
                          >
                            {region}
                          </Badge>
                        ))}
                        {deployment.regions.length > 3 && (
                          <span className="text-xs text-muted-foreground">
                            +{deployment.regions.length - 3}
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                  {deployment.status === "ready" && (
                    <div className="text-xs text-muted-foreground truncate mt-0.5">
                      {deployment.functionUrl}
                    </div>
                  )}
                  {deployment.errorMessage && (
                    <div className="text-xs text-destructive mt-0.5">
                      {deployment.errorMessage}
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-1">
                  {deployment.status === "ready" && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-7"
                      onClick={() => onCopyUrl(deployment.functionUrl)}
                    >
                      <Copy className="size-3.5" />
                    </Button>
                  )}
                  <Button
                    variant="ghost"
                    size="xs"
                    onClick={() => setInspectedDeployment(deployment)}
                  >
                    Inspect
                  </Button>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" className="size-7">
                        <MoreVertical className="size-3.5" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="text-xs">
                      <DropdownMenuItem
                        variant="destructive"
                        onClick={() => onDelete(deployment.id)}
                      >
                        Delete
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
