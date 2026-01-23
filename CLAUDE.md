# CLAUDE.md - AI Context for Sandbox FaaS

## Project Overview

This is a white-labeled FaaS platform allowing users to write, test, and deploy serverless functions. It uses Vercel Sandbox for development/testing and Vercel Serverless Functions for production deployment.

## Monorepo Structure

This is a **Turborepo monorepo** with the following apps:

- **@faas/web** (`apps/web/`) - Next.js FaaS platform UI
- **@faas/deployments** (`apps/deployments/`) - Vercel deployment target for user functions

## Tech Stack

- **Monorepo**: Turborepo with Bun workspaces
- **Framework**: Next.js 16.1.4 with React 19.2.3
- **Styling**: Tailwind CSS 4 (via @tailwindcss/postcss)
- **UI Components**: Shadcn/ui + Radix UI + Base UI
- **Code Editor**: Monaco Editor (@monaco-editor/react)
- **Animations**: Motion 12.x
- **Storage**: Upstash Redis for deployment metadata
- **Sandbox**: @vercel/sandbox SDK with Node.js 24 runtime
- **Package Manager**: Bun

## Commands

```bash
# Root commands (via turbo)
bun dev                           # Start all dev servers
bun run build                     # Build all apps
bun lint                          # Lint all apps

# Filter to specific app
bunx turbo run dev --filter=@faas/web
bunx turbo run build --filter=@faas/web

# Direct app commands
cd apps/web && bun dev            # Start web dev server
cd apps/web && bun tsc --noEmit   # Type check web app
```

## Key Implementation Details

### Sandbox Execution

- Uses `@vercel/sandbox` SDK with `node24` runtime
- TypeScript supported natively via `--experimental-strip-types` flag
- Code saved as `.ts` files and executed directly
- Streaming output via SSE using `detached: true` mode and `command.logs()` iterator

### Session Store

- In-memory storage using `globalThis` to persist across hot reloads in Next.js dev mode
- Without `globalThis`, module-level variables get reset between API requests in Turbopack
- Sessions track: `sandboxId`, `status`, `timeout`, `snapshotId`, `createdAt`
- Session timeout auto-extends by 2 minutes on successful run/build operations

### Deployment Store

- Deployments persisted in **Upstash Redis** (not in-memory)
- User isolation via IP address extracted from `x-forwarded-for` header
- Deployments include: id, url, functionName, createdAt, status, cronSchedule, regions, errorMessage, buildLogs

### Build Process (esbuild)

- esbuild installed on-demand **inside the sandbox** via `npm install esbuild` (intentionally npm, not bun, since it runs in the sandbox environment)
- **Must use CommonJS format** (`--format=cjs`) for Vercel Node.js runtime compatibility
- ESM format causes issues with the handler wrapping approach
- Output path: `/tmp/dist/index.js`

### Vercel Deployment (Critical Details)

**The biggest gotcha**: Vercel Node.js runtime does NOT natively support Web Standard `Request/Response` handlers. That's an Edge runtime feature.

**Solution**: Wrap user's Web Standard handler with a Node.js adapter:

```javascript
// User writes:
export default async function handler(req: Request): Promise<Response> { ... }

// We wrap it as:
module.exports = async (req, res) => {
  // Convert Node.js req → Web Standard Request
  const webRequest = new Request(url, { method, headers, body });

  // Call user's handler
  const webResponse = await handler(webRequest);

  // Convert Web Standard Response → Node.js res
  res.statusCode = webResponse.status;
  res.end(await webResponse.arrayBuffer());
};
```

**Build Output API v3 Structure**:

```
.vercel/output/
├── config.json          # version: 3, routes array
└── functions/api/handler.func/
    ├── .vc-config.json  # runtime: nodejs24.x, handler: index.js, launcherType: Nodejs
    └── index.js         # Wrapped CommonJS handler
```

**Important .vc-config.json settings**:

- `runtime`: `nodejs24.x` (or nodejs22.x)
- `handler`: `index.js` (the entry file)
- `launcherType`: `Nodejs` (required for traditional Node.js handlers)
- `supportsResponseStreaming`: `true` (optional)

### Common Issues Encountered

1. **"No active session" error**: Session store not persisting → Fixed with `globalThis`

2. **TypeScript syntax errors in sandbox**: Node.js not recognizing TS → Fixed with `--experimental-strip-types` flag and `.ts` extension

3. **ESM module errors on Vercel**: "type": "module" needed → Later removed when switching to CommonJS wrapper approach

4. **Invalid URL error**: `new URL(req.url)` fails with relative paths → Use `new URL(req.url, "http://localhost")` base URL

5. **Function timeout (300s)**: Vercel runtime not recognizing handler format → Fixed by wrapping Web Standard handler for Node.js

## Code Patterns

### API Response Pattern

Standardized responses via `lib/api-response.ts`:

- `jsonSuccess(data)` / `jsonError(message, status)` - NextResponse builders
- `sseResponse(stream)` - SSE streaming responses
- All responses follow `{ success: true/false, ... }` structure

### Session Validation

Centralized in `lib/session-validation.ts`:

- `validateActiveSession()` returns discriminated union
- Success branch includes session data, failure branch includes error Response
- Checks: session exists, not expired, not paused

### Type System

Discriminated union patterns in `lib/types.ts`:

- `ApiResponse<T> = ApiSuccessResponse<T> | ApiErrorResponse`
- SSE events typed with `SSEEventType` and `SSEEvent<T>`
- Runtime logs include context: requestMethod, requestPath, responseStatusCode

## Environment Variables

```bash
# Required - Vercel Deployment
VERCEL_API_TOKEN         # Vercel API token
VERCEL_WORKER_PROJECT_ID # Target project for deployments

# Required - Redis Storage
KV_REST_API_URL          # Upstash Redis endpoint
KV_REST_API_TOKEN        # Upstash authentication token

# Optional
VERCEL_TEAM_ID           # Team scope for API calls
VERCEL_OIDC_TOKEN        # Secure OIDC authentication
```

## File Structure

```
faas/                           # Monorepo root
├── turbo.json                  # Turborepo task configuration
├── package.json                # Root workspace config
├── apps/
│   ├── web/                    # @faas/web - Next.js FaaS platform
│   │   ├── app/
│   │   │   ├── api/
│   │   │   │   ├── session/route.ts        # Session CRUD
│   │   │   │   ├── run/route.ts            # Execute code (SSE)
│   │   │   │   ├── build/route.ts          # esbuild bundling (SSE)
│   │   │   │   ├── deploy/route.ts         # Vercel deployment (SSE)
│   │   │   │   ├── stop/route.ts           # Stop running execution
│   │   │   │   ├── deployments/
│   │   │   │   │   ├── route.ts            # List deployments
│   │   │   │   │   └── [id]/
│   │   │   │   │       ├── route.ts        # Get/delete deployment
│   │   │   │   │       └── logs/route.ts   # Get deployment logs
│   │   │   │   ├── snapshot/route.ts       # Create snapshot
│   │   │   │   └── restore/route.ts        # Restore snapshot
│   │   │   ├── page.tsx                    # Renders Playground
│   │   │   └── layout.tsx
│   │   ├── components/
│   │   │   ├── playground/
│   │   │   │   ├── index.tsx               # Main playground container
│   │   │   │   ├── code-editor-panel.tsx   # Monaco editor wrapper
│   │   │   │   ├── output-panel.tsx        # Execution output display
│   │   │   │   ├── deployments-panel.tsx   # Deployments list
│   │   │   │   └── footer-actions.tsx      # Action buttons
│   │   │   └── ui/                         # Shadcn/ui components
│   │   ├── hooks/
│   │   │   ├── index.ts                    # Barrel exports
│   │   │   ├── use-session.ts              # Session state management
│   │   │   ├── use-deployments.ts          # Deployments CRUD
│   │   │   ├── use-code-execution.ts       # Run/build operations
│   │   │   ├── use-keyboard-shortcuts.ts   # Hotkey bindings
│   │   │   └── use-runtime-logs.ts         # Live log streaming
│   │   ├── lib/
│   │   │   ├── api-response.ts             # Standardized API responses
│   │   │   ├── constants.ts                # Cron presets, regions, defaults
│   │   │   ├── deployments-store.ts        # Redis deployment operations
│   │   │   ├── format.ts                   # Time/log formatting utilities
│   │   │   ├── redis.ts                    # Upstash Redis client
│   │   │   ├── sandbox.ts                  # Sandbox SDK wrapper
│   │   │   ├── session-store.ts            # Session state (globalThis)
│   │   │   ├── session-validation.ts       # Request validation
│   │   │   ├── types.ts                    # TypeScript type definitions
│   │   │   ├── utils.ts                    # cn(), minDelay() utilities
│   │   │   └── vercel-deploy.ts            # Vercel API + handler wrapping
│   │   └── package.json
│   └── deployments/            # @faas/deployments - Vercel deployment target
│       ├── .vercel/            # Vercel project config (worker-deployments)
│       ├── vercel.json
│       └── package.json
└── packages/                   # Shared packages (future use)
```
