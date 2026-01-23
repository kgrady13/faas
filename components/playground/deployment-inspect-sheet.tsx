"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import {
  Terminal,
  TerminalHeader,
  TerminalTitle,
  TerminalContent,
  TerminalActions,
  TerminalCopyButton,
  TerminalClearButton,
} from "@/components/ai-elements/terminal";
import { useRuntimeLogs } from "@/hooks";
import { formatLogsAsString } from "@/lib/format";
import { REGION_OPTIONS, getCronLabel } from "@/lib/constants";
import type { DeploymentState } from "@/hooks";

type InspectTab = "details" | "logs";

interface DeploymentInspectSheetProps {
  deployment: DeploymentState | null;
  activeTab: InspectTab;
  onTabChange: (tab: InspectTab) => void;
  onClose: () => void;
  onCopyUrl: (url: string) => void;
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
      {status}
    </Badge>
  );
}

export function DeploymentInspectSheet({
  deployment,
  activeTab,
  onTabChange,
  onClose,
  onCopyUrl,
}: DeploymentInspectSheetProps) {
  const { logs, loading, error, clearLogs, startStreaming, stopStreaming } =
    useRuntimeLogs();

  // Start streaming logs only when logs tab is active
  useEffect(() => {
    if (!deployment || activeTab !== "logs") {
      stopStreaming();
      return;
    }

    startStreaming(deployment.id);

    return () => stopStreaming();
  }, [deployment, activeTab, startStreaming, stopStreaming]);

  const handleOpenChange = (open: boolean) => {
    if (!open) {
      onClose();
    }
  };

  return (
    <Sheet open={!!deployment} onOpenChange={handleOpenChange}>
      <SheetContent side="right" className="sm:max-w-lg! w-full flex flex-col gap-0">
        <SheetHeader>
          <SheetTitle>{deployment?.functionName || "Deployment"}</SheetTitle>
          <SheetDescription>{deployment?.id.slice(0, 12)}...</SheetDescription>
        </SheetHeader>

        {/* Tab Navigation */}
        <div className="flex border-b border-border">
          <button
            onClick={() => onTabChange("details")}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${activeTab === "details"
              ? "border-primary text-foreground"
              : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
          >
            Details
          </button>
          <button
            onClick={() => onTabChange("logs")}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${activeTab === "logs"
              ? "border-primary text-foreground"
              : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
          >
            Runtime Logs
          </button>
        </div>

        {/* Tab Content */}
        <div className="flex-1 overflow-auto">
          {activeTab === "details" && deployment && (
            <div className="space-y-4 p-4">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <div className="text-muted-foreground mb-1">Status</div>
                  <div>{getDeploymentStatusBadge(deployment.status)}</div>
                </div>
                <div>
                  <div className="text-muted-foreground mb-1">Created</div>
                  <div className="font-mono text-xs">
                    {new Date(deployment.createdAt).toLocaleString()}
                  </div>
                </div>
                <div className="col-span-2">
                  <div className="text-muted-foreground mb-1">Function URL</div>
                  {deployment.status === "ready" ? (
                    <div className="flex items-center gap-2">
                      <code className="text-xs bg-muted px-2 py-1 rounded flex-1 truncate">
                        {deployment.functionUrl}
                      </code>
                      <Button
                        variant="outline"
                        size="xs"
                        onClick={() => onCopyUrl(deployment.functionUrl)}
                      >
                        Copy
                      </Button>
                    </div>
                  ) : (
                    <span className="text-muted-foreground text-xs">Not available</span>
                  )}
                </div>
                <div className="col-span-2">
                  <div className="text-muted-foreground mb-1">Deployment URL</div>
                  <code className="text-xs bg-muted px-2 py-1 rounded block truncate">
                    {deployment.url}
                  </code>
                </div>
                <div className="col-span-2">
                  <div className="text-muted-foreground mb-1">Schedule Run</div>
                  {deployment.cronSchedule ? (
                    <div className="flex items-center gap-2">
                      <code className="text-xs bg-muted px-2 py-1 rounded">
                        {deployment.cronSchedule}
                      </code>
                      {getCronLabel(deployment.cronSchedule) && (
                        <span className="text-xs text-muted-foreground">
                          ({getCronLabel(deployment.cronSchedule)})
                        </span>
                      )}
                    </div>
                  ) : (
                    <span className="text-xs text-muted-foreground">None</span>
                  )}
                </div>
                <div className="col-span-2">
                  <div className="text-muted-foreground mb-1">Regions</div>
                  {deployment.regions && deployment.regions.length > 0 ? (
                    <div className="flex flex-wrap gap-1">
                      {deployment.regions.map((region) => {
                        const regionInfo = REGION_OPTIONS.find((r) => r.value === region);
                        return (
                          <Badge key={region} variant="outline" className="text-xs">
                            {region}
                            {regionInfo && (
                              <span className="ml-1 text-muted-foreground">
                                ({regionInfo.label})
                              </span>
                            )}
                          </Badge>
                        );
                      })}
                    </div>
                  ) : (
                    <span className="text-xs text-muted-foreground">Default (auto)</span>
                  )}
                </div>
                {deployment.errorMessage && (
                  <div className="col-span-2">
                    <div className="text-muted-foreground mb-1">Error</div>
                    <div className="text-destructive text-xs bg-destructive/10 p-2 rounded">
                      {deployment.errorMessage}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {activeTab === "logs" && (
            <div className="h-full flex flex-col">
              {error && (
                <div className="text-destructive text-sm bg-destructive/10 p-2 rounded mx-4 mt-4">
                  Error: {error}
                </div>
              )}
              <Terminal
                output={
                  logs.length === 0 && !loading && !error
                    ? "No logs yet. Invoke the function to see runtime logs."
                    : formatLogsAsString(logs)
                }
                isStreaming={loading}
                onClear={clearLogs}
                className="flex-1 border-0 rounded-none bg-muted/30 text-foreground"
              >
                <TerminalHeader className="border-border bg-muted/50">
                  <TerminalTitle className="text-muted-foreground">
                    Runtime Logs
                  </TerminalTitle>
                  <TerminalActions>
                    <TerminalCopyButton className="text-muted-foreground hover:bg-muted hover:text-foreground" />
                    <TerminalClearButton className="text-muted-foreground hover:bg-muted hover:text-foreground" />
                  </TerminalActions>
                </TerminalHeader>
                <TerminalContent className="max-h-none flex-1" />
              </Terminal>
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
