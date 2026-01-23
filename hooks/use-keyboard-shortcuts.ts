"use client";

import { useEffect, useRef } from "react";

export interface KeyboardShortcutActions {
  onNewSession?: () => void;
  onRun?: () => void;
  onDeploy?: () => void;
}

export interface UseKeyboardShortcutsOptions {
  /** Whether shortcuts are currently disabled (e.g., during loading) */
  disabled?: boolean;
  /** Whether session is running (required for run/deploy shortcuts) */
  sessionRunning?: boolean;
}

/**
 * Hook to handle keyboard shortcuts for playground actions.
 * Shortcuts are disabled when typing in inputs or the Monaco editor.
 *
 * Shortcuts:
 * - N: New Session
 * - R: Run (requires active session)
 * - D: Deploy (requires active session)
 */
export function useKeyboardShortcuts(
  actions: KeyboardShortcutActions,
  options: UseKeyboardShortcutsOptions = {}
) {
  const { disabled = false, sessionRunning = false } = options;

  // Use refs to avoid stale closures in the event handler
  const actionsRef = useRef(actions);
  const optionsRef = useRef({ disabled, sessionRunning });

  // Keep refs updated
  useEffect(() => {
    actionsRef.current = actions;
    optionsRef.current = { disabled, sessionRunning };
  });

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const { disabled, sessionRunning } = optionsRef.current;
      const { onNewSession, onRun, onDeploy } = actionsRef.current;

      // Skip if user is typing in an input, textarea, or the Monaco editor
      const target = e.target as HTMLElement;
      const isEditing =
        target.tagName === "INPUT" ||
        target.tagName === "TEXTAREA" ||
        target.closest(".monaco-editor") !== null ||
        target.isContentEditable;

      if (isEditing) return;

      switch (e.key.toLowerCase()) {
        case "n":
          e.preventDefault();
          if (!disabled && onNewSession) {
            onNewSession();
          }
          break;
        case "r":
          e.preventDefault();
          if (!disabled && sessionRunning && onRun) {
            onRun();
          }
          break;
        case "d":
          e.preventDefault();
          if (!disabled && sessionRunning && onDeploy) {
            onDeploy();
          }
          break;
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);
}
