# Sandbox FaaS

A white-labeled FaaS (Function-as-a-Service) platform that uses Vercel Sandbox for development/testing and deploys to Vercel Serverless Functions (Fluid Compute) for production.

## Features

- **Interactive Code Editor**: Write and test Node.js/TypeScript code in real-time
- **Sandbox Execution**: Run code in isolated Vercel Sandbox microVMs (Node.js 24)
- **Build & Deploy**: Bundle code with esbuild and deploy to Vercel Serverless Functions
- **Session Management**: Create, snapshot, and restore sandbox sessions
- **Deployment Management**: List, copy URLs, and delete deployments

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         Web UI                                   │
│  ┌──────────────┐  ┌──────────────┐  ┌───────────────────────┐  │
│  │ Code Editor  │  │    Output    │  │  Deployed Functions   │  │
│  │  (textarea)  │  │    Panel     │  │  - URL, status, cron  │  │
│  └──────────────┘  └──────────────┘  └───────────────────────┘  │
│  [New Session] [Run] [Build] [Deploy] [Save Env] [Restore]      │
└─────────────────────────┬───────────────────────────────────────┘
                          │
        ┌─────────────────┼─────────────────────┐
        ▼                 ▼                     ▼
┌───────────────┐  ┌───────────────┐     ┌───────────────────┐
│   Sandbox     │  │  Build API    │     │  Vercel Deploy    │
│  (Dev/Test)   │──│  (esbuild)    │────▶│  (Build Output)   │
│  Node.js 24   │  │  bundle code  │     │  Fluid Compute    │
└───────────────┘  └───────────────┘     └───────────────────┘
```

## User Workflow

1. **Write & Test**: Write code in editor, click "Run" to test in Sandbox
2. **Build**: Click "Build" to bundle with esbuild
3. **Deploy**: Click "Deploy" to create Vercel Serverless Function
4. **Manage**: View deployed functions, copy URLs, delete deployments

## Function Signature (Web Standard)

Users write Web Standard Request/Response handlers:

```typescript
export default async function handler(req: Request): Promise<Response> {
  const url = new URL(req.url, "http://localhost");

  if (req.method === "GET") {
    return new Response(JSON.stringify({ message: "Hello!" }), {
      headers: { "Content-Type": "application/json" }
    });
  }

  return new Response("Method not allowed", { status: 405 });
}
```

The build process wraps this in a Node.js adapter for Vercel's runtime.

## Environment Variables

```bash
# Required for Vercel deployments
VERCEL_API_TOKEN=xxx           # Vercel API token
VERCEL_WORKER_PROJECT_ID=xxx   # Project ID for function deployments
VERCEL_TEAM_ID=xxx             # Team ID (optional)
```

## API Routes

| Route | Method | Description |
|-------|--------|-------------|
| `/api/session` | POST | Create new sandbox session |
| `/api/session` | GET | Get current session status |
| `/api/session` | DELETE | Stop session |
| `/api/run` | POST | Execute code in sandbox (SSE) |
| `/api/build` | POST | Bundle code with esbuild (SSE) |
| `/api/deploy` | POST | Deploy to Vercel |
| `/api/deployments` | GET | List all deployments |
| `/api/deployments/[id]` | GET | Get deployment details |
| `/api/deployments/[id]` | DELETE | Delete deployment |
| `/api/snapshot` | POST | Create sandbox snapshot |
| `/api/restore` | POST | Restore from snapshot |

## Technical Details

### Build Process

1. User code saved to `/tmp/src/handler.ts` in sandbox
2. esbuild bundles to CommonJS: `--format=cjs --platform=node --target=node22`
3. Bundled code wrapped with Node.js `(req, res)` adapter
4. Deployed using Vercel Build Output API v3

### Build Output Structure

```
.vercel/output/
├── config.json              # Routes and optional cron config
└── functions/
    └── api/
        └── handler.func/
            ├── .vc-config.json   # Runtime: nodejs24.x
            └── index.js          # Wrapped handler code
```

### Handler Wrapping

Web Standard handlers are wrapped for Node.js compatibility:

- Converts Node.js `req` to Web Standard `Request`
- Calls user's handler
- Converts Web Standard `Response` back to Node.js `res`

## Development

```bash
npm install
npm run dev
```

## Key Files

| File | Purpose |
|------|---------|
| `components/playground.tsx` | Main UI component |
| `lib/sandbox.ts` | Sandbox SDK wrapper |
| `lib/session-store.ts` | In-memory session state |
| `lib/deployments-store.ts` | In-memory deployments state |
| `lib/vercel-deploy.ts` | Vercel API helpers & handler wrapping |
| `app/api/build/route.ts` | esbuild bundling endpoint |
| `app/api/deploy/route.ts` | Deployment endpoint |
