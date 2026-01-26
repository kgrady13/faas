# CLAUDE.md - AI Context for Sandbox FaaS

## Project Overview

This is a white-labeled FaaS platform allowing users to write, test, and deploy serverless functions. It uses Vercel Sandbox for development/testing and Vercel Serverless Functions for production deployment.

## Monorepo Structure

This is a **Turborepo monorepo** with the following apps:

- **@faas/web** (`apps/web/`) - Next.js FaaS platform UI
- **@faas/deployments** (`apps/deployments/`) - Vercel deployment target for user functions

## Vercel Projects

Two separate Vercel projects:

| App                | Project Name       | Purpose                                          |
| ------------------ | ------------------ | ------------------------------------------------ |
| `apps/web`         | `faas`             | The FaaS platform UI where users write/test code |
| `apps/deployments` | `faas-deployments` | Target project for deployed user functions       |

The web app deploys user functions TO the `faas-deployments` project via the Vercel API.

## Tech Stack

- **Monorepo**: Turborepo with Bun workspaces
- **Framework**: Next.js 16.1.4 with React 19.2.3
- **Styling**: Tailwind CSS 4 (via @tailwindcss/postcss)
- **UI Components**: Shadcn/ui + Radix UI + Base UI
- **Code Editor**: Monaco Editor (@monaco-editor/react)
- **Animations**: Motion 12.x
- **Storage**: Upstash Redis for deployment metadata
- **Sandbox**: @vercel/sandbox SDK with Node.js 24 runtime (for testing)
- **Build Tool**: Bun (installed in sandbox for bundling)
- **Deployed Runtime**: Vercel Bun runtime (`bun1.x`)
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

### Build Process (Bun)

- Bun installed on-demand **inside the sandbox** via curl (`curl -fsSL https://bun.sh/install | bash`)
- Uses `bun build` with `--target=bun` for Bun runtime compatibility
- Bun handles TypeScript natively - no separate transpilation needed
- Output path: `/tmp/dist/index.js`
- Source path: `/tmp/src/handler.ts`

### Vercel Deployment (Bun Runtime)

**Key insight**: Vercel's **Bun runtime** (`bun1.x`) natively supports Web Standard `Request/Response` handlers - no wrapper needed!

```javascript
// User writes (and this deploys as-is):
export default async function handler(req: Request): Promise<Response> {
  return new Response('Hello World');
}
```

**Build Output API v3 Structure**:

```
.vercel/output/
├── config.json          # version: 3, routes array, optional crons
└── functions/api/handler.func/
    ├── .vc-config.json  # runtime: bun1.x, handler: index.js
    └── index.js         # ESM bundled handler (no wrapper)
```

**Important .vc-config.json settings**:

- `runtime`: `bun1.x` (uses Bun runtime - supports Web Standard handlers)
- `handler`: `index.js` (the entry file)
- `supportsResponseStreaming`: `true`

**Note**: The `apps/deployments` project has `bunVersion: 1.x` in its vercel.json to ensure Bun is used.

### Common Issues Encountered

1. **"No active session" error**: Session store not persisting → Fixed with `globalThis`

2. **TypeScript syntax errors in sandbox**: Node.js not recognizing TS → Fixed with `--experimental-strip-types` flag and `.ts` extension

3. **Invalid URL error**: `new URL(req.url)` fails with relative paths → Use `new URL(req.url, "http://localhost")` base URL

4. **Bun not found in PATH**: After curl install, Bun is at `~/.bun/bin/bun` → Use `export PATH="$HOME/.bun/bin:$PATH"` before running bun commands

5. **Historical: Node.js wrapper issues**: Previously used CommonJS wrapper for Node.js runtime. Migrated to Bun runtime which supports Web Standard handlers natively - no wrapper needed

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

See `apps/web/.env.example` for the full template.

```bash
# Required - Vercel Deployment
VERCEL_API_TOKEN         # Vercel API token (https://vercel.com/account/tokens)
VERCEL_WORKER_PROJECT_ID # Target project ID for deployments

# Required - Redis Storage (Upstash/Vercel KV)
KV_REST_API_URL          # Upstash Redis REST API endpoint
KV_REST_API_TOKEN        # Upstash REST API token (read/write)

# Optional
VERCEL_TEAM_ID           # Team scope for API calls
VERCEL_OIDC_TOKEN        # Secure OIDC authentication
KV_REST_API_READ_ONLY_TOKEN  # Read-only token (if needed)
KV_URL                   # Vercel KV connection URL
REDIS_URL                # Alternative Redis URL
```

## File Structure

```
faas/                           # Monorepo root
├── turbo.json                  # Turborepo task configuration
├── package.json                # Root workspace config (bun@1.3.1)
├── bun.lock                    # Bun lockfile
├── CLAUDE.md                   # This file - AI context
├── apps/
│   ├── web/                    # @faas/web - Next.js FaaS platform
│   │   ├── .vercel/            # Vercel project config (sandbox-faas)
│   │   ├── .env.example        # Environment variables template
│   │   ├── .env.local          # Local environment (gitignored)
│   │   ├── app/
│   │   │   ├── api/
│   │   │   │   ├── session/route.ts        # Session CRUD
│   │   │   │   ├── run/route.ts            # Execute code (SSE)
│   │   │   │   ├── build/route.ts          # Bun bundling (SSE)
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
│   │   │   ├── layout.tsx
│   │   │   └── globals.css                 # Tailwind CSS 4 styles
│   │   ├── components/
│   │   │   ├── playground/
│   │   │   │   ├── index.tsx               # Main playground container
│   │   │   │   ├── header.tsx              # Playground header/toolbar
│   │   │   │   ├── code-editor-panel.tsx   # Monaco editor wrapper
│   │   │   │   ├── output-panel.tsx        # Execution output display
│   │   │   │   ├── deployments-panel.tsx   # Deployments list
│   │   │   │   ├── deployment-inspect-sheet.tsx  # Deployment details sheet
│   │   │   │   └── footer-actions.tsx      # Action buttons
│   │   │   ├── ai-elements/                # AI-themed UI components
│   │   │   │   ├── terminal.tsx            # Terminal output component
│   │   │   │   └── shimmer.tsx             # Loading shimmer effect
│   │   │   ├── shadcnio/                   # Shadcn.io components
│   │   │   │   └── rotating-text.tsx       # Rotating text animation
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
│   │   │   └── vercel-deploy.ts            # Vercel Deployment API client
│   │   └── package.json
│   └── deployments/            # @faas/deployments - Vercel deployment target
│       ├── .vercel/            # Vercel project config (faas-deployments)
│       ├── .env.local          # Local environment (gitignored)
│       ├── vercel.json         # Vercel config (bunVersion: 1.x)
│       └── package.json
└── packages/                   # Shared packages (future use)
```
