"use client";

import { Button } from "@/components/ui/button";
import { Github, Code, Terminal, Play, Plus } from "lucide-react";
import { usePlaygroundStore } from "@/lib/store/playground-store";
import { DeployPopover } from "./deploy-popover";

interface FooterActionsProps {
  loading: string | null;
  sessionRunning: boolean;
  remainingTime: number;
  onNewSession: () => void;
  onRun: () => void;
  onDeploy: () => void;
}

export function FooterActions({
  loading,
  sessionRunning,
  remainingTime,
  onNewSession,
  onRun,
  onDeploy,
}: FooterActionsProps) {
  const mobileView = usePlaygroundStore((s) => s.mobileView);
  const setMobileView = usePlaygroundStore((s) => s.setMobileView);

  return (
    <footer className="shrink-0 border-t border-border px-2 md:px-4 py-2 md:py-3 flex flex-nowrap items-center gap-1.5 md:gap-2 overflow-x-auto bg-background relative z-10">
      {/* Mobile View Toggle - Only shown on mobile */}
      <div className="flex md:hidden border border-border rounded-md p-0.5">
        <Button
          variant={mobileView === "editor" ? "default" : "ghost"}
          size="sm"
          onClick={() => setMobileView("editor")}
          className="h-7 px-2 gap-1"
        >
          <Code className="size-3.5" />
          <span className="text-xs">Code</span>
        </Button>
        <Button
          variant={mobileView === "output" ? "default" : "ghost"}
          size="sm"
          onClick={() => setMobileView("output")}
          className="h-7 px-2 gap-1"
        >
          <Terminal className="size-3.5" />
          <span className="text-xs">Output</span>
        </Button>
      </div>

      {/* Divider - mobile only */}
      <div className="w-px h-6 bg-border mx-0.5 md:hidden" />

      {/* New Session Button */}
      <Button
        variant="outline"
        size="sm"
        onClick={onNewSession}
        disabled={loading !== null}
        className="gap-1.5 h-8 md:h-9 px-2 md:px-3"
      >
        <Plus className="size-3.5 md:hidden" />
        <span className="hidden md:inline">{loading === "create" ? "Creating..." : "New Session"}</span>
        <span className="md:hidden text-xs">{loading === "create" ? "..." : "New"}</span>
        <kbd className="hidden md:inline-flex h-5 max-h-full items-center rounded bg-black/10 dark:bg-white/10 px-1.5 font-[inherit] text-[0.625rem] ring-1 ring-black/10 dark:ring-white/20 ring-inset">
          N
        </kbd>
      </Button>

      {/* Run Button */}
      <Button
        size="sm"
        onClick={onRun}
        disabled={loading !== null || !sessionRunning}
        className="gap-1.5 h-8 md:h-9 px-2 md:px-3"
      >
        <Play className="size-3.5 md:hidden" />
        <span className="hidden md:inline">{loading === "run" ? "Running..." : "Run"}</span>
        <span className="md:hidden text-xs">{loading === "run" ? "..." : "Run"}</span>
        <kbd className="hidden md:inline-flex h-5 max-h-full items-center rounded bg-white/15 px-1.5 font-[inherit] text-[0.625rem] ring-1 ring-white/20 ring-inset">
          R
        </kbd>
      </Button>

      {/* Divider */}
      <div className="w-px h-6 bg-border mx-0.5 md:mx-1" />

      {/* Deploy Popover (replaces inline Deploy button + cron/regions dropdowns) */}
      <DeployPopover
        loading={loading}
        sessionRunning={sessionRunning}
        onDeploy={onDeploy}
      />

      <div className="flex-1" />

      {/* Session Warning - Hidden on mobile */}
      {remainingTime > 0 && remainingTime < 60000 && sessionRunning && (
        <span className="hidden md:inline text-sm text-destructive">
          Warning: Session expires soon!
        </span>
      )}

      {/* GitHub Link */}
      <a
        href="https://github.com/kgrady13/faas.git"
        target="_blank"
        rel="noopener noreferrer"
        className="text-muted-foreground hover:text-foreground transition-colors"
        aria-label="View on GitHub"
      >
        <Github className="size-5" />
      </a>
    </footer>
  );
}
