# CLAUDE.md - AI Context for Sandbox FaaS

## Project Overview

This is a white-labeled FaaS platform allowing users to write, test, and deploy serverless functions. It uses Vercel Sandbox for development/testing and Vercel Serverless Functions for production deployment.

## Key Implementation Details

### Sandbox Execution

- Uses `@vercel/sandbox` SDK with `node24` runtime
- TypeScript supported natively via `--experimental-strip-types` flag
- Code saved as `.ts` files and executed directly
- Streaming output via SSE using `detached: true` mode and `command.logs()` iterator

### Session Store

- In-memory storage using `globalThis` to persist across hot reloads in Next.js dev mode
- Without `globalThis`, module-level variables get reset between API requests in Turbopack

### Build Process (esbuild)

- esbuild installed on-demand in sandbox via `npm install esbuild`
- **Must use CommonJS format** (`--format=cjs`) for Vercel Node.js runtime compatibility
- ESM format causes issues with the handler wrapping approach

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

### Environment Variables

```
VERCEL_API_TOKEN         # Required - Vercel API token
VERCEL_WORKER_PROJECT_ID # Required - Target project for deployments
VERCEL_TEAM_ID           # Optional - Team scope for API calls
```

## File Structure

```
app/
├── api/
│   ├── session/route.ts     # Session CRUD
│   ├── run/route.ts         # Execute code (SSE)
│   ├── build/route.ts       # esbuild bundling (SSE)
│   ├── deploy/route.ts      # Vercel deployment
│   ├── deployments/
│   │   ├── route.ts         # List deployments
│   │   └── [id]/route.ts    # Get/delete deployment
│   ├── snapshot/route.ts    # Create snapshot
│   └── restore/route.ts     # Restore snapshot
├── page.tsx                 # Renders Playground
└── layout.tsx

components/
└── playground.tsx           # Main UI (editor, output, deployments panel)

lib/
├── sandbox.ts               # Sandbox SDK wrapper
├── session-store.ts         # Session state (globalThis)
├── deployments-store.ts     # Deployments state (globalThis)
└── vercel-deploy.ts         # Vercel API + handler wrapping
```

## Commands

```bash
npm run dev      # Start development server
npm run build    # Production build
npx tsc --noEmit # Type check
```
