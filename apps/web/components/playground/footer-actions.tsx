"use client";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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
import { Clock, Github, Code, Terminal, Play, Rocket, Plus } from "lucide-react";
import { CRON_PRESETS, REGION_OPTIONS, getCronLabel } from "@/lib/constants";

type MobileView = "editor" | "output";

interface FooterActionsProps {
  loading: string | null;
  sessionRunning: boolean;
  remainingTime: number;
  cronSchedule: string;
  regions: string[];
  mobileView: MobileView;
  onMobileViewChange: (view: MobileView) => void;
  onCronScheduleChange: (value: string) => void;
  onRegionsChange: (regions: string[]) => void;
  onNewSession: () => void;
  onRun: () => void;
  onDeploy: () => void;
}

export function FooterActions({
  loading,
  sessionRunning,
  remainingTime,
  cronSchedule,
  regions,
  mobileView,
  onMobileViewChange,
  onCronScheduleChange,
  onRegionsChange,
  onNewSession,
  onRun,
  onDeploy,
}: FooterActionsProps) {
  return (
    <footer className="shrink-0 border-t border-border px-2 md:px-4 py-2 md:py-3 flex flex-nowrap items-center gap-1.5 md:gap-2 overflow-x-auto bg-background relative z-10">
      {/* Mobile View Toggle - Only shown on mobile */}
      <div className="flex md:hidden border border-border rounded-md p-0.5">
        <Button
          variant={mobileView === "editor" ? "default" : "ghost"}
          size="sm"
          onClick={() => onMobileViewChange("editor")}
          className="h-7 px-2 gap-1"
        >
          <Code className="size-3.5" />
          <span className="text-xs">Code</span>
        </Button>
        <Button
          variant={mobileView === "output" ? "default" : "ghost"}
          size="sm"
          onClick={() => onMobileViewChange("output")}
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

      {/* Deploy Button */}
      <Button
        size="sm"
        onClick={onDeploy}
        disabled={loading !== null || !sessionRunning}
        className="gap-1.5 h-8 md:h-9 px-2 md:px-3"
      >
        <Rocket className="size-3.5 md:hidden" />
        <span className="hidden md:inline">{loading === "deploy" ? "Deploying..." : "Deploy"}</span>
        <span className="md:hidden text-xs">{loading === "deploy" ? "..." : "Deploy"}</span>
        <kbd className="hidden md:inline-flex h-5 max-h-full items-center rounded bg-white/15 px-1.5 font-[inherit] text-[0.625rem] ring-1 ring-white/20 ring-inset">
          D
        </kbd>
      </Button>

      {/* Schedule Dropdown - Hidden on mobile */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="sm" className="gap-1.5 hidden md:flex">
            <Clock className="size-3.5" />
            {getCronLabel(cronSchedule) || "Schedule Run"}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          side="top"
          align="start"
          className="w-auto max-h-64 overflow-y-auto text-xs"
        >
          <DropdownMenuLabel className="text-xs">Schedule Run</DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuRadioGroup value={cronSchedule} onValueChange={onCronScheduleChange}>
            {CRON_PRESETS.map((preset) => (
              <DropdownMenuRadioItem
                key={preset.value || "none"}
                value={preset.value}
                className="text-xs whitespace-nowrap"
              >
                {preset.label}
              </DropdownMenuRadioItem>
            ))}
          </DropdownMenuRadioGroup>
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Regions Dropdown - Hidden on mobile */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="sm" className="hidden md:flex">
            {regions.length > 0 ? `Regions (${regions.length})` : "Regions"}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          side="top"
          align="start"
          className="w-auto! max-h-64 overflow-y-auto text-xs"
        >
          <DropdownMenuLabel className="text-xs">Deploy to regions</DropdownMenuLabel>
          <DropdownMenuSeparator />
          {REGION_OPTIONS.map((region) => (
            <DropdownMenuCheckboxItem
              key={region.value}
              checked={regions.includes(region.value)}
              onCheckedChange={(checked) => {
                if (checked) {
                  onRegionsChange([...regions, region.value]);
                } else {
                  onRegionsChange(regions.filter((r) => r !== region.value));
                }
              }}
              onSelect={(e) => e.preventDefault()}
              className="text-xs whitespace-nowrap"
            >
              <Badge className="font-mono mr-1 py-0 px-1">
                {region.value}
              </Badge>
              {region.label}
            </DropdownMenuCheckboxItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>

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
