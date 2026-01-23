"use client";

import { useEffect, useRef } from "react";
import Ansi from "ansi-to-react";
import { Button } from "@/components/ui/button";
import type { Output } from "@/lib/types";

interface OutputPanelProps {
  outputs: Output[];
  onClear: () => void;
}

export function OutputPanel({ outputs, onClear }: OutputPanelProps) {
  const outputRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom when new output arrives
  useEffect(() => {
    if (outputRef.current) {
      outputRef.current.scrollTop = outputRef.current.scrollHeight;
    }
  }, [outputs]);

  return (
    <div className="flex-1 flex flex-col min-h-0 border-b border-border">
      <div className="shrink-0 px-3 py-2 border-b border-border text-sm text-muted-foreground flex items-center justify-between">
        <span>Output</span>
        <Button variant="ghost" size="xs" onClick={onClear}>
          Clear
        </Button>
      </div>
      <div
        ref={outputRef}
        className="flex-1 min-h-0 p-4 font-mono text-sm overflow-auto bg-muted/30"
      >
        {outputs.length === 0 ? (
          <span className="text-muted-foreground">Output will appear here...</span>
        ) : (
          outputs.map((output, i) => (
            <div
              key={i}
              className={`whitespace-pre-wrap ${
                output.type === "stderr"
                  ? "text-destructive"
                  : output.type === "system"
                    ? "text-primary"
                    : "text-foreground"
              }`}
            >
              {output.type === "system" ? (
                `> ${output.content}`
              ) : (
                <Ansi useClasses>{output.content}</Ansi>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
