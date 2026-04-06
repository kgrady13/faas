"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuCheckboxItem,
} from "@/components/ui/dropdown-menu";
import { Rocket, Clock, Copy, ExternalLink, RotateCcw, Check } from "lucide-react";
import { CRON_PRESETS, REGION_OPTIONS, getCronLabel } from "@/lib/constants";
import { usePlaygroundStore } from "@/lib/store/playground-store";
import { Shimmer } from "@/components/ai-elements/shimmer";

type DeployState = "idle" | "building" | "deploying" | "streaming" | "ready" | "error";

interface DeployResult {
  id: string;
  url: string;
  functionUrl: string;
  functionName: string;
}

interface DeployPopoverProps {
  loading: string | null;
  sessionRunning: boolean;
  onDeploy: () => void;
}

export function DeployPopover({ loading, sessionRunning, onDeploy }: DeployPopoverProps) {
  const [open, setOpen] = useState(false);
  const [deployState, setDeployState] = useState<DeployState>("idle");
  const [buildLogs, setBuildLogs] = useState<string[]>([]);
  const [deployResult, setDeployResult] = useState<DeployResult | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const logsEndRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  const cronSchedule = usePlaygroundStore((s) => s.cronSchedule);
  const setCronSchedule = usePlaygroundStore((s) => s.setCronSchedule);
  const regions = usePlaygroundStore((s) => s.regions);
  const setRegions = usePlaygroundStore((s) => s.setRegions);
  const addOutput = usePlaygroundStore((s) => s.addOutput);

  // Auto-scroll logs
  useEffect(() => {
    logsEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [buildLogs]);

  // Open popover when deploy starts externally (keyboard shortcut)
  useEffect(() => {
    if (loading === "deploy" && !open) {
      setOpen(true);
      setDeployState("building");
      setBuildLogs([]);
      setDeployResult(null);
      setErrorMessage(null);
    }
  }, [loading, open]);

  const streamBuildLogs = useCallback(async (deploymentId: string) => {
    abortRef.current = new AbortController();

    try {
      const res = await fetch(`/api/deployments/${deploymentId}/build-logs`, {
        signal: abortRef.current.signal,
      });

      const reader = res.body?.getReader();
      if (!reader) return;

      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          try {
            const event = JSON.parse(line.slice(6));
            switch (event.type) {
              case "stdout":
              case "stderr":
              case "command":
                setBuildLogs((prev) => [...prev, event.data]);
                break;
              case "state":
                setBuildLogs((prev) => [...prev, `[${event.data}]`]);
                break;
              case "done":
                if (event.data === "READY") {
                  setDeployState("ready");
                } else if (event.data === "ERROR") {
                  setDeployState("error");
                  setErrorMessage("Deployment failed during build");
                }
                return;
              case "error":
                setDeployState("error");
                setErrorMessage(event.data);
                return;
            }
          } catch {
            // ignore parse errors
          }
        }
      }
    } catch (err) {
      if ((err as Error).name !== "AbortError") {
        setDeployState("error");
        setErrorMessage((err as Error).message);
      }
    }
  }, []);

  const handleDeploy = useCallback(() => {
    setDeployState("building");
    setBuildLogs([]);
    setDeployResult(null);
    setErrorMessage(null);
    setOpen(true);

    // Call the parent's deploy handler — it uses SSE and we listen for deploy_done
    // to start streaming build logs
    onDeploy();
  }, [onDeploy]);

  // Listen for deploy_done events from the main deploy flow via the output panel
  // We watch the addOutput store action for deploy completion
  const lastDeployIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (deployState !== "building" && deployState !== "deploying") return;

    // Check if we have a deploy result by polling the outputs
    const outputs = usePlaygroundStore.getState().outputs;
    const deployDoneOutput = outputs.find(
      (o) => o.type === "system" && o.content.startsWith("Function URL: ")
    );

    if (deployDoneOutput) {
      const functionUrl = deployDoneOutput.content.replace("Function URL: ", "");
      // Extract deployment ID from outputs
      const deployStartOutput = outputs.find(
        (o) => o.type === "stdout" && o.content.startsWith("Deployment started: ")
      );
      const deploymentId = deployStartOutput?.content.replace("Deployment started: ", "");

      if (deploymentId && deploymentId !== lastDeployIdRef.current) {
        lastDeployIdRef.current = deploymentId;
        setDeployState("streaming");

        // Find the URL from outputs
        const urlParts = functionUrl.split("/api/");
        const baseUrl = `https://${urlParts[0].replace("https://", "")}`;

        setDeployResult({
          id: deploymentId,
          url: baseUrl,
          functionUrl,
          functionName: "handler",
        });

        // Start streaming build logs
        streamBuildLogs(deploymentId);
      }
    }

    // Check for errors
    const errorOutput = outputs.findLast(
      (o) => o.type === "stderr" && !o.content.startsWith("Error: No active")
    );
    if (errorOutput && deployState === "building") {
      // Only set error if we haven't gotten a deploy result yet
      if (!deployDoneOutput) {
        setDeployState("error");
        setErrorMessage(errorOutput.content);
      }
    }
  });

  const handleCopyUrl = useCallback(async () => {
    if (!deployResult) return;
    try {
      await navigator.clipboard.writeText(deployResult.functionUrl);
      setCopied(true);
      addOutput("system", "URL copied to clipboard");
      setTimeout(() => setCopied(false), 2000);
    } catch {
      addOutput("stderr", "Failed to copy to clipboard");
    }
  }, [deployResult, addOutput]);

  const handleReset = useCallback(() => {
    abortRef.current?.abort();
    setDeployState("idle");
    setBuildLogs([]);
    setDeployResult(null);
    setErrorMessage(null);
    lastDeployIdRef.current = null;
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => abortRef.current?.abort();
  }, []);

  const isDeploying = loading === "deploy" || deployState === "building" || deployState === "deploying" || deployState === "streaming";

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          size="sm"
          onClick={(e) => {
            if (deployState === "idle" && !isDeploying) {
              e.preventDefault();
              handleDeploy();
            }
          }}
          disabled={(loading !== null && loading !== "deploy") || !sessionRunning}
          className="gap-1.5 h-8 md:h-9 px-2 md:px-3"
        >
          <Rocket className="size-3.5 md:hidden" />
          <span className="hidden md:inline">
            {isDeploying ? <Shimmer>Deploying...</Shimmer> : "Deploy"}
          </span>
          <span className="md:hidden text-xs">{isDeploying ? "..." : "Deploy"}</span>
          <kbd className="hidden md:inline-flex h-5 max-h-full items-center rounded bg-white/15 px-1.5 font-[inherit] text-[0.625rem] ring-1 ring-white/20 ring-inset">
            D
          </kbd>
        </Button>
      </PopoverTrigger>

      <PopoverContent side="top" align="start" className="w-96 p-0 gap-0">
        {/* Header */}
        <div className="flex items-center justify-between px-3 py-2 border-b border-border">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium">Deploy</span>
            {deployState === "ready" && (
              <span className="flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-emerald-500" />
                <span className="text-xs text-emerald-600 dark:text-emerald-400">Ready</span>
              </span>
            )}
            {deployState === "error" && (
              <span className="flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-red-500" />
                <span className="text-xs text-red-600 dark:text-red-400">Error</span>
              </span>
            )}
            {isDeploying && (
              <span className="flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-yellow-500 animate-pulse" />
                <span className="text-xs text-muted-foreground">Building</span>
              </span>
            )}
          </div>
        </div>

        {/* Build Logs */}
        {(isDeploying || deployState === "ready" || deployState === "error") && (
          <div className="max-h-48 overflow-auto bg-muted/30 font-mono text-xs p-2 border-b border-border">
            {buildLogs.length === 0 && isDeploying && (
              <div className="text-muted-foreground py-2 text-center">
                <Shimmer>Waiting for build logs...</Shimmer>
              </div>
            )}
            {buildLogs.map((log, i) => (
              <div key={i} className="whitespace-pre-wrap text-muted-foreground leading-relaxed">
                {log}
              </div>
            ))}
            <div ref={logsEndRef} />
          </div>
        )}

        {/* Success State */}
        {deployState === "ready" && deployResult && (
          <div className="p-3 space-y-2">
            <div className="flex items-center gap-2">
              <code className="text-xs bg-muted px-2 py-1 rounded flex-1 truncate">
                {deployResult.functionUrl}
              </code>
              <Button
                variant="outline"
                size="icon"
                className="size-7 shrink-0"
                onClick={handleCopyUrl}
              >
                {copied ? <Check className="size-3" /> : <Copy className="size-3" />}
              </Button>
            </div>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                className="flex-1 text-xs h-7"
                onClick={() => window.open(deployResult.functionUrl, "_blank")}
              >
                <ExternalLink className="size-3 mr-1" />
                Open
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="flex-1 text-xs h-7"
                onClick={handleReset}
              >
                <RotateCcw className="size-3 mr-1" />
                Deploy Again
              </Button>
            </div>
          </div>
        )}

        {/* Error State */}
        {deployState === "error" && (
          <div className="p-3 space-y-2">
            {errorMessage && (
              <div className="text-xs text-destructive bg-destructive/10 p-2 rounded">
                {errorMessage}
              </div>
            )}
            <Button
              variant="outline"
              size="sm"
              className="w-full text-xs h-7"
              onClick={handleReset}
            >
              <RotateCcw className="size-3 mr-1" />
              Try Again
            </Button>
          </div>
        )}

        {/* Idle Config */}
        {deployState === "idle" && !isDeploying && (
          <div className="p-3 space-y-3">
            <div className="flex items-center gap-2">
              {/* Schedule */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="sm" className="gap-1.5 text-xs h-7 flex-1">
                    <Clock className="size-3" />
                    {getCronLabel(cronSchedule) || "No schedule"}
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent side="top" align="start" className="w-auto max-h-64 overflow-y-auto text-xs">
                  <DropdownMenuLabel className="text-xs">Schedule Run</DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuRadioGroup value={cronSchedule} onValueChange={setCronSchedule}>
                    {CRON_PRESETS.map((preset) => (
                      <DropdownMenuRadioItem key={preset.value || "none"} value={preset.value} className="text-xs whitespace-nowrap">
                        {preset.label}
                      </DropdownMenuRadioItem>
                    ))}
                  </DropdownMenuRadioGroup>
                </DropdownMenuContent>
              </DropdownMenu>

              {/* Regions */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="sm" className="text-xs h-7 flex-1">
                    {regions.length > 0 ? `Regions (${regions.length})` : "Regions"}
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent side="top" align="start" className="w-auto! max-h-64 overflow-y-auto text-xs">
                  <DropdownMenuLabel className="text-xs">Deploy to regions</DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  {REGION_OPTIONS.map((region) => (
                    <DropdownMenuCheckboxItem
                      key={region.value}
                      checked={regions.includes(region.value)}
                      onCheckedChange={(checked) => {
                        if (checked) {
                          setRegions([...regions, region.value]);
                        } else {
                          setRegions(regions.filter((r) => r !== region.value));
                        }
                      }}
                      onSelect={(e) => e.preventDefault()}
                      className="text-xs whitespace-nowrap"
                    >
                      <Badge className="font-mono mr-1 py-0 px-1">{region.value}</Badge>
                      {region.label}
                    </DropdownMenuCheckboxItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>

            <Button
              size="sm"
              className="w-full h-8"
              onClick={handleDeploy}
              disabled={!sessionRunning || loading !== null}
            >
              <Rocket className="size-3.5 mr-1.5" />
              Deploy to Vercel
            </Button>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
