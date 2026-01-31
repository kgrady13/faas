"use client";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import { Clock, Copy, MoreVertical } from "lucide-react";
import type { DeploymentState } from "@/hooks";
import { Shimmer } from "@/components/ai-elements/shimmer";

interface DeploymentsPanelProps {
  deployments: DeploymentState[];
  onRefresh: () => void;
  onCopyUrl: (url: string) => void;
  onInspect: (deployment: DeploymentState) => void;
  onDelete: (id: string) => void;
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

export function DeploymentsPanel({
  deployments,
  onRefresh,
  onCopyUrl,
  onInspect,
  onDelete,
}: DeploymentsPanelProps) {
  return (
    <div className="h-32 md:h-48 shrink-0 flex flex-col">
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
                    onClick={() => onInspect(deployment)}
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
