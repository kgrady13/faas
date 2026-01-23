import type { RuntimeLog } from "./types";

/**
 * Format milliseconds as MM:SS countdown
 */
export function formatTime(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${minutes}:${secs.toString().padStart(2, "0")}`;
}

/**
 * Format timestamp for log display (HH:MM:SS)
 */
export function formatLogTime(timestampInMs: number): string {
  const date = new Date(timestampInMs);
  return date.toLocaleTimeString("en-US", {
    hour12: false,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

/**
 * Format runtime logs array as terminal-friendly string
 */
export function formatLogsAsString(logs: RuntimeLog[]): string {
  if (logs.length === 0) return "";
  return logs
    .map((log) => {
      const time = formatLogTime(log.timestampInMs);
      const level = log.level.toUpperCase().padEnd(7);
      let line = `${time} ${level} ${log.message}`;
      if (log.requestMethod && log.requestPath) {
        line += ` ${log.requestMethod} ${log.requestPath}`;
        if (log.responseStatusCode) {
          line += ` ${log.responseStatusCode}`;
        }
      }
      return line;
    })
    .join("\n");
}
