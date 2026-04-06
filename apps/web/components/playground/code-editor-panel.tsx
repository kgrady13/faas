"use client";

import dynamic from "next/dynamic";
import { useTheme } from "next-themes";
import { Button } from "@/components/ui/button";
import { Shimmer } from "@/components/ai-elements/shimmer";
import { minDelay } from "@/lib/utils";
import { usePlaygroundStore } from "@/lib/store/playground-store";

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

interface CodeEditorPanelProps {
  onFormat: () => void;
}

export function CodeEditorPanel({ onFormat }: CodeEditorPanelProps) {
  const { resolvedTheme } = useTheme();
  const code = usePlaygroundStore((s) => s.code);
  const setCode = usePlaygroundStore((s) => s.setCode);
  const mobileView = usePlaygroundStore((s) => s.mobileView);

  return (
    <div className={`w-full md:w-1/2 border-r border-border flex flex-col min-h-0 flex-1 md:flex-initial ${mobileView === "output" ? "hidden md:flex" : "flex"}`}>
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
        onChange={(value) => setCode(value || "")}
        theme={resolvedTheme === "dark" ? "vs-dark" : "light"}
        loading={null}
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
