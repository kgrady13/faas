"use client";

import dynamic from "next/dynamic";
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
        <Shimmer>Something is happening...</Shimmer>
      </div>
    ),
  }
);

interface CodeEditorPanelProps {
  code: string;
  onChange: (code: string) => void;
  onFormat: () => void;
}

export function CodeEditorPanel({ code, onChange, onFormat }: CodeEditorPanelProps) {
  return (
    <div className="w-1/2 border-r border-border flex flex-col min-h-0">
      <div className="shrink-0 px-3 py-2 text-sm text-muted-foreground flex items-center justify-between">
        <span>Code Editor</span>
        <Button variant="ghost" size="xs" onClick={onFormat}>
          Format
        </Button>
      </div>
      <Editor
        height="100%"
        defaultLanguage="typescript"
        value={code}
        onChange={(value) => onChange(value || "")}
        theme="light"
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
