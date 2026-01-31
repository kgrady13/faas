"use client";

import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import type { SessionState, SessionLoadingState } from "@/hooks";
import { formatTime } from "@/lib/format";
import { ThemeToggle } from "@/components/theme-toggle";

interface PlaygroundHeaderProps {
  session: SessionState | null;
  remainingTime: number;
  loading: SessionLoadingState;
  onPause: () => void;
  onResume: () => void;
  onStop: () => void;
  onRestart: () => void;
}

export function PlaygroundHeader({
  session,
  remainingTime,
  loading,
  onPause,
  onResume,
  onStop,
  onRestart,
}: PlaygroundHeaderProps) {
  const [isDevToolsOpen, setIsDevToolsOpen] = useState(false);
  const popoverRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  // Close popover when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        popoverRef.current &&
        !popoverRef.current.contains(event.target as Node) &&
        buttonRef.current &&
        !buttonRef.current.contains(event.target as Node)
      ) {
        setIsDevToolsOpen(false);
      }
    };

    if (isDevToolsOpen) {
      document.addEventListener("mousedown", handleClickOutside);
      return () => document.removeEventListener("mousedown", handleClickOutside);
    }
  }, [isDevToolsOpen]);

  const getStatusBadge = () => {
    if (!session) {
      return <Badge variant="outline">No Session</Badge>;
    }

    switch (session.status) {
      case "running":
        return (
          <Badge variant="default">
            Ready
          </Badge>
        );
      case "paused":
        return (
          <Badge
            variant="outline"
            className="border-yellow-500 text-yellow-600 dark:text-yellow-400"
          >
            Paused
          </Badge>
        );
      case "pending":
        return <Badge variant="secondary">Starting...</Badge>;
      case "stopping":
        return <Badge variant="secondary">Stopping...</Badge>;
      case "stopped":
        return <Badge variant="destructive">Stopped</Badge>;
      case "failed":
        return <Badge variant="destructive">Failed</Badge>;
      default:
        return <Badge variant="outline">Unknown</Badge>;
    }
  };

  const getStatusColor = () => {
    if (!session) return "bg-gray-400";
    switch (session.status) {
      case "running":
        return "bg-foreground";
      case "paused":
        return "bg-yellow-500";
      case "pending":
        return "bg-blue-500";
      case "stopping":
        return "bg-orange-500";
      case "stopped":
      case "failed":
        return "bg-red-500";
      default:
        return "bg-gray-400";
    }
  };

  const getStatusText = () => {
    if (!session) return "No Session";
    return session.status.charAt(0).toUpperCase() + session.status.slice(1);
  };

  return (
    <header className="shrink-0 border-b border-border px-2 md:px-4 py-2 md:py-3 flex items-center justify-between">
      <div className="flex items-center gap-1">
        <svg data-testid="geist-icon" height="16" strokeLinejoin="round" viewBox="0 0 16 16" width="16" style={{ color: "currentcolor" }}>
          <path fillRule="evenodd" clipRule="evenodd" d="M7 2H9V0.75V0H10.5V0.75V2H13C13.5523 2 14 2.44772 14 3V5.5H15.25H16V7H15.25H14V9H15.25H16V10.5H15.25H14V13C14 13.5523 13.5523 14 13 14H10.5V15.25V16H9V15.25V14H7V15.25V16H5.5V15.25V14H3C2.44772 14 2 13.5523 2 13V10.5H0.75H0V9H0.75H2V7H0.75H0V5.5H0.75H2V3C2 2.44772 2.44772 2 3 2H5.5V0.75V0H7V0.75V2ZM3.5 8.98228V3.5H12.5V9H10C9.56114 9 9.29513 8.85208 9.13685 8.68588C8.96919 8.50984 8.875 8.26309 8.875 8C8.875 7.73691 8.96919 7.49016 9.13685 7.31412C9.29513 7.14792 9.56114 7 10 7V5.5C8.82792 5.5 7.9118 5.74294 7.16034 6.13019C6.41599 6.51379 5.87229 7.01955 5.42887 7.4794C5.29221 7.62111 5.17056 7.75171 5.05789 7.87267L5.05789 7.87267C4.78031 8.17066 4.55724 8.41014 4.2986 8.6132C4.04734 8.81045 3.80061 8.93775 3.5 8.98228ZM3.5 10.4907V12.5H12.5V10.5H10C9.18886 10.5 8.51737 10.2104 8.05065 9.72037C7.59331 9.24016 7.375 8.61191 7.375 8C7.375 7.91436 7.37928 7.8284 7.38788 7.74258C7.06615 7.96886 6.78522 8.23377 6.50863 8.5206C6.41912 8.61343 6.32548 8.71405 6.22828 8.8185L6.22819 8.8186C5.92315 9.14637 5.58298 9.5119 5.22484 9.79305C4.75982 10.1581 4.20727 10.437 3.5 10.4907Z" fill="currentColor"></path></svg>
        <h1 className="text-base md:text-lg font-semibold">faas</h1>
      </div>
      <div className="flex items-center gap-2 md:gap-3 relative">
        {getStatusBadge()}
        <ThemeToggle />
        {/* Dev Tools Button */}
        <button
          ref={buttonRef}
          onClick={() => setIsDevToolsOpen(!isDevToolsOpen)}
          className="flex items-center justify-center w-8 h-8 rounded-md border border-border hover:bg-muted transition-colors relative"
          title="Dev Tools"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="text-muted-foreground"
          >
            <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" />
          </svg>
          {/* Status indicator dot */}
          <span
            className={`absolute -top-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2 border-background ${getStatusColor()}`}
          />
        </button>

        {/* Dev Tools Popover */}
        {isDevToolsOpen && (
          <div
            ref={popoverRef}
            className="absolute top-full right-0 mt-2 w-64 md:w-72 bg-popover border border-border rounded-lg shadow-lg overflow-hidden z-50"
          >
            {/* Header */}
            <div className="flex items-center justify-between px-3 py-2 border-b border-border bg-muted/50">
              <span className="text-sm font-medium">Dev Tools</span>
              <button
                onClick={() => setIsDevToolsOpen(false)}
                className="text-muted-foreground hover:text-foreground transition-colors"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>

            {/* Content */}
            <div className="p-3 space-y-3">
              {/* Status Section */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground uppercase tracking-wide">
                    Status
                  </span>
                  <Badge
                    variant="outline"
                    className={
                      session?.status === "running"
                        ? "border-foreground text-foreground"
                        : session?.status === "paused"
                          ? "border-yellow-500 text-yellow-600 dark:text-yellow-400"
                          : ""
                    }
                  >
                    {getStatusText()}
                  </Badge>
                </div>

                {/* Remaining Time */}
                {session?.status === "running" && remainingTime > 0 && (
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-muted-foreground">Time Remaining</span>
                    <span className="text-sm font-mono">{formatTime(remainingTime)}</span>
                  </div>
                )}

                {/* Sandbox ID */}
                {session?.sandboxId && (
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-muted-foreground">Sandbox ID</span>
                    <span className="text-xs font-mono text-muted-foreground">
                      {session.sandboxId.slice(0, 12)}...
                    </span>
                  </div>
                )}

                {/* Snapshot ID */}
                {session?.snapshotId && (
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-muted-foreground">Snapshot ID</span>
                    <span className="text-xs font-mono text-muted-foreground">
                      {session.snapshotId.slice(0, 12)}...
                    </span>
                  </div>
                )}
              </div>

              {/* Actions */}
              <div className="pt-2 border-t border-border space-y-2">
                {session?.status === "running" && (
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={onPause}
                      disabled={loading !== null}
                      className="flex-1 h-8 text-xs"
                    >
                      {loading === "snapshot" ? "Pausing..." : "Pause"}
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={onStop}
                      disabled={loading !== null}
                      className="flex-1 h-8 text-xs text-destructive hover:text-destructive"
                    >
                      {loading === "stop" ? "Stopping..." : "Stop"}
                    </Button>
                  </div>
                )}

                {session?.status === "paused" && (
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={onResume}
                      disabled={loading !== null}
                      className="flex-1 h-8 text-xs"
                    >
                      {loading === "restore" ? "Resuming..." : "Resume"}
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={onStop}
                      disabled={loading !== null}
                      className="flex-1 h-8 text-xs text-destructive hover:text-destructive"
                    >
                      {loading === "stop" ? "Stopping..." : "Stop"}
                    </Button>
                  </div>
                )}

                {(session?.status === "stopped" || session?.status === "failed") && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={onRestart}
                    disabled={loading !== null}
                    className="w-full h-8 text-xs"
                  >
                    {loading === "create" ? "Starting..." : "Restart Environment"}
                  </Button>
                )}

                {!session && (
                  <p className="text-xs text-muted-foreground text-center py-1">
                    No active sandbox session
                  </p>
                )}
              </div>
            </div>
          </div>
        )}



      </div>
    </header>
  );
}
