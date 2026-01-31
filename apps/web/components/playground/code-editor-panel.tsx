"use client";

import dynamic from "next/dynamic";
import { useTheme } from "next-themes";
import type { Monaco } from "@monaco-editor/react";
import { Button } from "@/components/ui/button";
import { Shimmer } from "@/components/ai-elements/shimmer";
import { minDelay } from "@/lib/utils";

// Dynamically import Monaco Editor (~3MB) - don't block initial page load
// minDelay ensures shimmer shows for at least 1s even on fast connections
const Editor = dynamic(
  () => minDelay(import("@monaco-editor/react"), 1000),
  {
    ssr: false,
    loading: () => (
      <div className="h-full flex items-center justify-center">
        <Shimmer>Things are happening...</Shimmer>
      </div>
    ),
  }
);

// SDK type definitions for Monaco intellisense
const SDK_TYPES = `declare module "@faas/sdk" {
  export interface Capability {
    name: string;
    description?: string;
  }

  export interface SyncCapability extends Capability {
    type: "sync";
    sync: () => Promise<void>;
  }

  export interface AutomationCapability extends Capability {
    type: "automation";
    trigger: "page_changed" | "database_changed";
    run: (event: AutomationEvent) => Promise<void>;
  }

  export interface SkillCapability<TInput = any, TOutput = any> extends Capability {
    type: "skill";
    execute: (input: TInput) => Promise<TOutput>;
  }

  export type WorkerCapability = SyncCapability | AutomationCapability | SkillCapability<any, any>;

  export interface AutomationEvent {
    type: "page_changed" | "database_changed";
    targetId: string;
    timestamp: string;
    metadata?: Record<string, unknown>;
  }

  export class Worker {
    addCapability(capability: WorkerCapability): this;
    getCapabilities(): WorkerCapability[];
    getCapability(name: string): WorkerCapability | undefined;
    hasCapability(name: string): boolean;
    fetch(request: Request): Promise<Response>;
  }

  export function createWorker(): Worker;
}`;

function handleEditorWillMount(monaco: Monaco) {
  // Configure TypeScript compiler options
  monaco.languages.typescript.typescriptDefaults.setCompilerOptions({
    target: monaco.languages.typescript.ScriptTarget.ESNext,
    module: monaco.languages.typescript.ModuleKind.ESNext,
    moduleResolution: monaco.languages.typescript.ModuleResolutionKind.NodeJs,
    allowNonTsExtensions: true,
    strict: true,
    esModuleInterop: true,
  });

  // Add SDK type definitions
  monaco.languages.typescript.typescriptDefaults.addExtraLib(
    SDK_TYPES,
    "file:///node_modules/@faas/sdk/index.d.ts"
  );
}

interface CodeEditorPanelProps {
  code: string;
  onChange: (code: string) => void;
  onFormat: () => void;
}

export function CodeEditorPanel({ code, onChange, onFormat }: CodeEditorPanelProps) {
  const { resolvedTheme } = useTheme();

  return (
    <div className="flex-1 md:border-r border-b md:border-b-0 border-border flex flex-col min-h-0">
      <div className="shrink-0 px-3 py-2 text-sm text-muted-foreground flex items-center justify-between">
        <span className="hidden md:inline">Code Editor</span>
        <Button variant="ghost" size="xs" onClick={onFormat}>
          Format
        </Button>
      </div>
      <Editor
        height="100%"
        defaultLanguage="typescript"
        value={code}
        onChange={(value) => onChange(value || "")}
        theme={resolvedTheme === "dark" ? "vs-dark" : "light"}
        loading={null}
        beforeMount={handleEditorWillMount}
        options={{
          minimap: { enabled: false },
          fontSize: 14,
          lineNumbers: "on",
          scrollBeyondLastLine: false,
          automaticLayout: true,
          tabSize: 2,
          wordWrap: "on",
          padding: { top: 16 },
        }}
      />
    </div>
  );
}
