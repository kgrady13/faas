/**
 * Shared constants for the FaaS platform
 */

export interface CronPreset {
  value: string;
  label: string;
}

export interface RegionOption {
  value: string;
  label: string;
}

/**
 * Predefined cron schedule options
 */
export const CRON_PRESETS: CronPreset[] = [
  { value: "", label: "No schedule" },
  { value: "* * * * *", label: "Every minute" },
  { value: "*/5 * * * *", label: "Every 5 minutes" },
  { value: "*/15 * * * *", label: "Every 15 minutes" },
  { value: "0 * * * *", label: "Hourly" },
  { value: "0 */6 * * *", label: "Every 6 hours" },
  { value: "0 0 * * *", label: "Daily (midnight)" },
  { value: "0 9 * * *", label: "Daily (9am)" },
  { value: "0 0 * * 0", label: "Weekly (Sunday)" },
  { value: "0 0 1 * *", label: "Monthly (1st)" },
];

/**
 * Available deployment regions
 */
export const REGION_OPTIONS: RegionOption[] = [
  { value: "iad1", label: "Washington, D.C., USA" },
  { value: "sfo1", label: "San Francisco, USA" },
  { value: "pdx1", label: "Portland, USA" },
  { value: "cle1", label: "Cleveland, USA" },
  { value: "gru1", label: "Sao Paulo, Brazil" },
  { value: "hnd1", label: "Tokyo, Japan" },
  { value: "icn1", label: "Seoul, South Korea" },
  { value: "kix1", label: "Osaka, Japan" },
  { value: "sin1", label: "Singapore" },
  { value: "bom1", label: "Mumbai, India" },
  { value: "syd1", label: "Sydney, Australia" },
  { value: "cdg1", label: "Paris, France" },
  { value: "arn1", label: "Stockholm, Sweden" },
  { value: "dub1", label: "Dublin, Ireland" },
  { value: "lhr1", label: "London, UK" },
  { value: "fra1", label: "Frankfurt, Germany" },
  { value: "cpt1", label: "Cape Town, South Africa" },
];

/**
 * Default code template for new sessions
 */
export const DEFAULT_CODE = `// Web Standard Function Handler
// Click "Run" to test, "Deploy" for Vercel Fluid Compute

console.log("Hello World");

export default async function handler(req: Request): Promise<Response> {
  // Use base URL for relative paths (Vercel passes relative URLs)
  const url = new URL(req.url, "http://localhost");

  console.log("Hello From Handler");

  if (req.method === "GET") {
    return new Response(JSON.stringify({
      message: "Hello from Vercel Fluid Compute!",
      timestamp: new Date().toISOString(),
      path: url.pathname,
    }), {
      headers: { "Content-Type": "application/json" }
    });
  }

  if (req.method === "POST") {
    const body = await req.json();
    return new Response(JSON.stringify({
      received: body,
      processed: true,
    }), {
      headers: { "Content-Type": "application/json" }
    });
  }

  return new Response("Method not allowed", { status: 405 });
}
`;

/**
 * Get human-readable label for a cron expression
 * @param cronExpression - The cron expression to look up
 * @returns The label if found, null otherwise
 */
export function getCronLabel(cronExpression: string | undefined): string | null {
  if (!cronExpression) return null;
  const preset = CRON_PRESETS.find((p) => p.value === cronExpression);
  return preset?.label || null;
}

/**
 * Get region info by region code
 * @param regionCode - The region code (e.g., "iad1")
 * @returns The region option if found, undefined otherwise
 */
export function getRegionInfo(regionCode: string): RegionOption | undefined {
  return REGION_OPTIONS.find((r) => r.value === regionCode);
}
