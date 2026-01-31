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
import { Clock, Github } from "lucide-react";
import { CRON_PRESETS, REGION_OPTIONS, getCronLabel } from "@/lib/constants";

interface FooterActionsProps {
  loading: string | null;
  sessionRunning: boolean;
  remainingTime: number;
  cronSchedule: string;
  regions: string[];
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
  onCronScheduleChange,
  onRegionsChange,
  onNewSession,
  onRun,
  onDeploy,
}: FooterActionsProps) {
  return (
    <footer className="shrink-0 border-t border-border px-2 py-2 md:px-4 md:py-3 flex flex-wrap md:flex-nowrap items-center gap-1.5 md:gap-2 bg-background relative z-10">
      <Button
        variant="outline"
        size="sm"
        onClick={onNewSession}
        disabled={loading !== null}
        className="gap-1 md:gap-2 text-xs md:text-sm"
      >
        {loading === "create" ? "Creating..." : "New"}
        <kbd className="hidden md:inline-flex h-5 max-h-full items-center rounded bg-black/10 dark:bg-white/10 px-1.5 font-[inherit] text-[0.625rem] ring-1 ring-black/10 dark:ring-white/20 ring-inset">
          N
        </kbd>
      </Button>

      <Button
        size="sm"
        onClick={onRun}
        disabled={loading !== null || !sessionRunning}
        className="gap-1 md:gap-2 text-xs md:text-sm"
      >
        {loading === "run" ? "Running..." : "Run"}
        <kbd className="hidden md:inline-flex h-5 max-h-full items-center rounded bg-white/15 px-1.5 font-[inherit] text-[0.625rem] ring-1 ring-white/20 ring-inset">
          R
        </kbd>
      </Button>

      <div className="hidden md:block w-px h-6 bg-border mx-1" />

      <Button
        size="sm"
        onClick={onDeploy}
        disabled={loading !== null || !sessionRunning}
        className="gap-1 md:gap-2 text-xs md:text-sm"
      >
        {loading === "deploy" ? "Deploying..." : "Deploy"}
        <kbd className="hidden md:inline-flex h-5 max-h-full items-center rounded bg-white/15 px-1.5 font-[inherit] text-[0.625rem] ring-1 ring-white/20 ring-inset">
          D
        </kbd>
      </Button>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="sm" className="gap-1 md:gap-1.5 text-xs md:text-sm">
            <Clock className="size-3 md:size-3.5" />
            <span className="hidden sm:inline">{getCronLabel(cronSchedule) || "Schedule"}</span>
            <span className="sm:hidden">Cron</span>
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

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="sm" className="text-xs md:text-sm">
            {regions.length > 0 ? (
              <>
                <span className="hidden sm:inline">Regions ({regions.length})</span>
                <span className="sm:hidden">{regions.length}</span>
              </>
            ) : (
              "Regions"
            )}
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

      <div className="hidden md:block flex-1" />

      {remainingTime > 0 && remainingTime < 60000 && sessionRunning && (
        <span className="text-xs md:text-sm text-destructive w-full md:w-auto text-center md:text-left order-first md:order-none mb-1 md:mb-0">
          Session expires soon!
        </span>
      )}

      <a
        href="https://github.com/kgrady13/faas.git"
        target="_blank"
        rel="noopener noreferrer"
        className="text-muted-foreground hover:text-foreground transition-colors ml-auto md:ml-0"
        aria-label="View on GitHub"
      >
        <Github className="size-4 md:size-5" />
      </a>
    </footer>
  );
}
