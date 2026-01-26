# FaaS (FLUID-as-a-Service)

A white-labeled FaaS (Function-as-a-Service) platform that uses Vercel Sandbox for development/testing and deploys to Vercel Serverless Functions (Fluid Compute) for production.

## Features

- **Interactive Code Editor**: Write and test TypeScript code in real-time with Monaco Editor
- **Sandbox Execution**: Run code in isolated Vercel Sandbox microVMs (Node.js 24)
- **Build & Deploy**: Bundle code with Bun and deploy to Vercel Bun runtime
- **Session Management**: Create, snapshot, and restore sandbox sessions
- **Deployment Management**: List, copy URLs, and delete deployments
- **Cron Scheduling**: Configure scheduled function execution
- **Multi-Region Deployment**: Deploy to specific Vercel regions

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         Web UI                                   │
│  ┌──────────────┐  ┌──────────────┐  ┌───────────────────────┐  │
│  │ Code Editor  │  │    Output    │  │  Deployed Functions   │  │
│  │   (Monaco)   │  │    Panel     │  │  - URL, status, cron  │  │
│  └──────────────┘  └──────────────┘  └───────────────────────┘  │
│  [New Session] [Run] [Build] [Deploy]                           │
└─────────────────────────┬───────────────────────────────────────┘
                          │
        ┌─────────────────┴─────────────────┐
        ▼                                   ▼
┌─────────────────────────────┐     ┌───────────────────┐
│         Sandbox             │     │  Vercel Deploy    │
│        Node.js 24           │     │  (Build Output)   │
│  ┌─────────┐  ┌──────────┐  │────▶│  Bun Runtime      │
│  │Dev/Test │  │  Build   │  │     └───────────────────┘
│  │  (Run)  │  │  (Bun)   │  │
│  └─────────┘  └──────────┘  │
└─────────────────────────────┘
```

## User Workflow

1. **Write & Test**: Write code in editor, click "Run" to test in Sandbox
2. **Build**: Click "Build" to bundle with Bun
3. **Deploy**: Click "Deploy" to create Vercel Serverless Function
4. **Manage**: View deployed functions, copy URLs, delete deployments

## Function Signature (Bun Handler)

Users write Bun-style fetch handlers that deploy directly to Vercel's Bun runtime:

```typescript
export default {
  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url, "http://localhost");

    if (request.method === "GET") {
      return new Response(JSON.stringify({ message: "Hello!" }), {
        headers: { "Content-Type": "application/json" },
      });
    }

    return new Response("Method not allowed", { status: 405 });
  },
};
```

The Bun runtime natively supports Web Standard Request/Response - no wrapper needed.

## Environment Variables

```bash
# Required for Vercel deployments
VERCEL_API_TOKEN=xxx           # Vercel API token
VERCEL_WORKER_PROJECT_ID=xxx   # Project ID for function deployments
VERCEL_TEAM_ID=xxx             # Team ID (optional)
```

## API Routes

| Route                   | Method | Description                   |
| ----------------------- | ------ | ----------------------------- |
| `/api/session`          | POST   | Create new sandbox session    |
| `/api/session`          | GET    | Get current session status    |
| `/api/session`          | DELETE | Stop session                  |
| `/api/run`              | POST   | Execute code in sandbox (SSE) |
| `/api/build`            | POST   | Bundle code with Bun (SSE)    |
| `/api/deploy`           | POST   | Deploy to Vercel              |
| `/api/deployments`      | GET    | List all deployments          |
| `/api/deployments/[id]` | GET    | Get deployment details        |
| `/api/deployments/[id]` | DELETE | Delete deployment             |
| `/api/snapshot`         | POST   | Create sandbox snapshot       |
| `/api/restore`          | POST   | Restore from snapshot         |

## Technical Details

### Build Process

1. User code saved to `/tmp/src/handler.ts` in sandbox
2. Bun bundles to ESM: `bun build --target=bun --outfile=/tmp/dist/index.js`
3. ESM bundle deployed as-is (no wrapper needed for Bun runtime)
4. Deployed using Vercel Build Output API v3

### Build Output Structure

```
.vercel/output/
├── config.json              # Routes and optional cron config
└── functions/
    └── api/
        └── handler.func/
            ├── .vc-config.json   # Runtime: bun1.x
            └── index.js          # ESM bundled handler (no wrapper)
```

### Bun Runtime

Vercel's Bun runtime (`bun1.x`) natively supports Web Standard handlers:

- No Node.js adapter or wrapper needed
- Direct Request/Response API support
- Handlers deploy as-is after bundling

## Development

```bash
bun install
bun dev
```

## Key Files

| File                        | Purpose                               |
| --------------------------- | ------------------------------------- |
| `components/playground.tsx` | Main UI component                     |
| `lib/sandbox.ts`            | Sandbox SDK wrapper                   |
| `lib/session-store.ts`      | In-memory session state               |
| `lib/deployments-store.ts`  | Redis-backed deployments state        |
| `lib/vercel-deploy.ts`      | Vercel API helpers & handler wrapping |
| `app/api/build/route.ts`    | Bun bundling endpoint                 |
| `app/api/deploy/route.ts`   | Deployment endpoint                   |
