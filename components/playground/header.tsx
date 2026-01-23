"use client";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import type { SessionState, SessionLoadingState } from "@/hooks";
import { formatTime } from "@/lib/format";

interface PlaygroundHeaderProps {
  session: SessionState | null;
  remainingTime: number;
  loading: SessionLoadingState;
  onPause: () => void;
  onResume: () => void;
  onStop: () => void;
}

export function PlaygroundHeader({
  session,
  remainingTime,
  loading,
  onPause,
  onResume,
  onStop,
}: PlaygroundHeaderProps) {
  const getStatusBadge = () => {
    if (!session) {
      return <Badge variant="outline">No Session</Badge>;
    }

    const variants: Record<
      SessionState["status"],
      "default" | "secondary" | "destructive" | "outline"
    > = {
      pending: "secondary",
      running: "default",
      stopping: "secondary",
      stopped: "destructive",
      paused: "outline",
      failed: "destructive",
    };

    // Special styling for paused state (yellow/warning)
    if (session.status === "paused") {
      return (
        <Badge
          variant="outline"
          className="border-yellow-500 text-yellow-600 dark:text-yellow-400"
        >
          Paused
        </Badge>
      );
    }

    return (
      <Badge variant={variants[session.status]}>
        {session.status.charAt(0).toUpperCase() + session.status.slice(1)}
        {session.status === "running" && remainingTime > 0 && (
          <span className="ml-1.5 tabular-nums">{formatTime(remainingTime)}</span>
        )}
      </Badge>
    );
  };

  return (
    <header className="shrink-0 border-b border-border px-4 py-3 flex items-center justify-between">
      <h1 className="text-lg font-semibold">Sandbox FaaS</h1>
      <div className="flex items-center gap-3">
        {session?.snapshotId && (
          <span className="text-xs text-muted-foreground">
            {session.snapshotId.slice(0, 12)}...
          </span>
        )}
        {session?.status === "running" && (
          <>
            <Button
              variant="outline"
              size="sm"
              onClick={onPause}
              disabled={loading !== null}
              className="bg-amber-50 text-amber-700 border-amber-200 hover:bg-amber-100 hover:text-amber-800"
            >
              {loading === "snapshot" ? "Pausing..." : "Pause"}
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={onStop}
              disabled={loading !== null}
              className="bg-red-50 text-destructive border-red-200 hover:bg-red-100 hover:text-destructive"
            >
              {loading === "stop" ? "Stopping..." : "Stop"}
            </Button>
          </>
        )}
        {session?.status === "paused" && (
          <>
            <Button
              variant="outline"
              size="sm"
              onClick={onResume}
              disabled={loading !== null}
              className="bg-emerald-50 text-emerald-600 border-emerald-300 hover:bg-emerald-100 hover:text-emerald-700"
            >
              {loading === "restore" ? "Resuming..." : "Resume"}
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={onStop}
              disabled={loading !== null}
              className="bg-red-50 text-destructive border-red-200 hover:bg-red-100 hover:text-destructive"
            >
              {loading === "stop" ? "Stopping..." : "Stop"}
            </Button>
          </>
        )}
        {getStatusBadge()}
      </div>
    </header>
  );
}
