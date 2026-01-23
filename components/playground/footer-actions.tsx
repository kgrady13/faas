"use client";

import { Button } from "@/components/ui/button";
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
import { Clock } from "lucide-react";
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
    <footer className="shrink-0 border-t border-border px-4 py-3 flex flex-nowrap items-center gap-2 overflow-x-auto bg-background relative z-10">
      <Button
        variant="outline"
        onClick={onNewSession}
        disabled={loading !== null}
        className="gap-2"
      >
        {loading === "create" ? "Creating..." : "New Session"}
        <kbd className="inline-flex h-5 max-h-full items-center rounded bg-black/10 dark:bg-white/10 px-1.5 font-[inherit] text-[0.625rem] ring-1 ring-black/10 dark:ring-white/20 ring-inset">
          N
        </kbd>
      </Button>

      <Button
        onClick={onRun}
        disabled={loading !== null || !sessionRunning}
        className="gap-2"
      >
        {loading === "run" ? "Running..." : "Run"}
        <kbd className="inline-flex h-5 max-h-full items-center rounded bg-white/15 px-1.5 font-[inherit] text-[0.625rem] ring-1 ring-white/20 ring-inset">
          R
        </kbd>
      </Button>

      <div className="w-px h-6 bg-border mx-1" />

      <Button
        onClick={onDeploy}
        disabled={loading !== null || !sessionRunning}
        className="gap-2"
      >
        {loading === "deploy" ? "Deploying..." : "Deploy"}
        <kbd className="inline-flex h-5 max-h-full items-center rounded bg-white/15 px-1.5 font-[inherit] text-[0.625rem] ring-1 ring-white/20 ring-inset">
          D
        </kbd>
      </Button>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="sm" className="gap-1.5">
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

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="sm">
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
              <span className="font-mono mr-2 text-emerald-500">{region.value}</span>
              {region.label}
            </DropdownMenuCheckboxItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>

      {remainingTime > 0 && remainingTime < 60000 && sessionRunning && (
        <span className="ml-auto text-sm text-destructive">
          Warning: Session expires soon!
        </span>
      )}
    </footer>
  );
}
