import crypto from 'crypto';

const VERCEL_API_BASE = 'https://api.vercel.com';

interface VercelFile {
  file: string;
  data: string;
  encoding?: 'base64' | 'utf-8';
}

interface CreateDeploymentOptions {
  files: VercelFile[];
  functionName: string;
  cronSchedule?: string;
  regions?: string[];
}

interface DeploymentResponse {
  id: string;
  url: string;
  readyState: 'QUEUED' | 'BUILDING' | 'READY' | 'ERROR' | 'CANCELED';
  regions?: string[];
  errorMessage?: string;
}

function getEnvConfig() {
  const token = process.env.VERCEL_API_TOKEN;
  const teamId = process.env.VERCEL_TEAM_ID;
  const projectId = process.env.VERCEL_WORKER_PROJECT_ID;

  if (!token) {
    throw new Error('VERCEL_API_TOKEN environment variable is required');
  }
  if (!projectId) {
    throw new Error('VERCEL_WORKER_PROJECT_ID environment variable is required');
  }

  return { token, teamId, projectId };
}

function sha1(content: string): string {
  return crypto.createHash('sha1').update(content).digest('hex');
}

/**
 * Upload a file to Vercel's file store
 */
async function uploadFile(token: string, teamId: string | undefined, content: string): Promise<string> {
  const params = new URLSearchParams();
  if (teamId) params.set('teamId', teamId);

  const response = await fetch(`${VERCEL_API_BASE}/v2/files?${params}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/octet-stream',
      'x-vercel-digest': sha1(content),
    },
    body: content,
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to upload file: ${error}`);
  }

  return sha1(content);
}

/**
 * Wrap a Web Standard handler for Node.js runtime compatibility
 */
function wrapHandlerForNodejs(bundledCode: string): string {
  // The bundled code (CJS) exports the handler as default
  // We wrap it for Node.js (req, res) format
  return `
// Import the bundled handler
const handlerModule = (() => {
  const module = { exports: {} };
  const exports = module.exports;
  ${bundledCode}
  return module.exports;
})();

// Get the handler (handle both default export styles)
const handler = handlerModule.default || handlerModule;

// Node.js wrapper for Vercel runtime
module.exports = async (req, res) => {
  try {
    // Build full URL from Node.js request
    const protocol = req.headers['x-forwarded-proto'] || 'https';
    const host = req.headers['x-forwarded-host'] || req.headers.host || 'localhost';
    const url = \`\${protocol}://\${host}\${req.url}\`;

    // Collect body for non-GET requests
    let body = null;
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      const chunks = [];
      for await (const chunk of req) {
        chunks.push(chunk);
      }
      if (chunks.length > 0) {
        body = Buffer.concat(chunks);
      }
    }

    // Convert to Web Standard Request
    const webRequest = new Request(url, {
      method: req.method,
      headers: req.headers,
      body: body,
      duplex: 'half',
    });

    // Call the Web Standard handler
    const webResponse = await handler(webRequest);

    // Convert Web Standard Response to Node.js response
    res.statusCode = webResponse.status;
    webResponse.headers.forEach((value, key) => {
      res.setHeader(key, value);
    });

    const responseBody = await webResponse.arrayBuffer();
    res.end(Buffer.from(responseBody));
  } catch (error) {
    console.error('Handler error:', error);
    res.statusCode = 500;
    res.end(JSON.stringify({ error: error.message }));
  }
};
`;
}

/**
 * Generate Build Output API structure for a serverless function
 */
export function generateBuildOutput(
  bundledCode: string,
  functionName: string,
  cronSchedule?: string
): VercelFile[] {
  const files: VercelFile[] = [];

  // Wrap the Web Standard handler for Node.js runtime
  const wrappedCode = wrapHandlerForNodejs(bundledCode);

  // config.json - routes and optional cron
  const config: {
    version: number;
    routes: { src: string; dest: string }[];
    crons?: { path: string; schedule: string }[];
  } = {
    version: 3,
    routes: [{ src: `/api/${functionName}`, dest: `/api/${functionName}` }],
  };

  if (cronSchedule) {
    config.crons = [{ path: `/api/${functionName}`, schedule: cronSchedule }];
  }

  files.push({
    file: '.vercel/output/config.json',
    data: JSON.stringify(config, null, 2),
  });

  // .vc-config.json - function configuration for Node.js
  const vcConfig = {
    runtime: 'nodejs24.x',
    handler: 'index.js',
    launcherType: 'Nodejs',
    supportsResponseStreaming: true,
  };

  files.push({
    file: `.vercel/output/functions/api/${functionName}.func/.vc-config.json`,
    data: JSON.stringify(vcConfig, null, 2),
  });

  // index.js - wrapped handler code (CommonJS for Node.js runtime)
  files.push({
    file: `.vercel/output/functions/api/${functionName}.func/index.js`,
    data: wrappedCode,
  });

  return files;
}

/**
 * Create a deployment on Vercel using the Build Output API
 */
export async function createDeployment(options: CreateDeploymentOptions): Promise<DeploymentResponse> {
  const { token, teamId, projectId } = getEnvConfig();
  const { files, functionName, regions } = options;

  // Upload all files and build the file list
  const uploadedFiles: { file: string; sha: string; size: number }[] = [];

  for (const file of files) {
    const sha = await uploadFile(token, teamId, file.data);
    uploadedFiles.push({
      file: file.file,
      sha,
      size: Buffer.byteLength(file.data, 'utf-8'),
    });
  }

  // Create the deployment
  const params = new URLSearchParams();
  if (teamId) params.set('teamId', teamId);

  const deploymentBody: Record<string, unknown> = {
    name: projectId,
    project: projectId,
    files: uploadedFiles,
    target: 'production',
    meta: {
      functionName,
      deployedAt: new Date().toISOString(),
    },
  };

  // Add regions if specified
  if (regions && regions.length > 0) {
    deploymentBody.regions = regions;
  }

  const response = await fetch(`${VERCEL_API_BASE}/v13/deployments?${params}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(deploymentBody),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to create deployment: ${error}`);
  }

  const deployment = await response.json();

  return {
    id: deployment.id,
    url: `https://${deployment.url}`,
    readyState: deployment.readyState,
    regions: deployment.regions,
    errorMessage: deployment.errorMessage,
  };
}

/**
 * Get the status of a deployment
 */
export async function getDeploymentStatus(deploymentId: string): Promise<DeploymentResponse> {
  const { token, teamId } = getEnvConfig();

  const params = new URLSearchParams();
  if (teamId) params.set('teamId', teamId);

  const response = await fetch(
    `${VERCEL_API_BASE}/v13/deployments/${deploymentId}?${params}`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    }
  );

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to get deployment status: ${error}`);
  }

  const deployment = await response.json();

  return {
    id: deployment.id,
    url: `https://${deployment.url}`,
    readyState: deployment.readyState,
    regions: deployment.regions,
    errorMessage: deployment.errorMessage,
  };
}

/**
 * Delete a deployment from Vercel
 */
export async function deleteVercelDeployment(deploymentId: string): Promise<void> {
  const { token, teamId } = getEnvConfig();

  const params = new URLSearchParams();
  if (teamId) params.set('teamId', teamId);

  const response = await fetch(
    `${VERCEL_API_BASE}/v13/deployments/${deploymentId}?${params}`,
    {
      method: 'DELETE',
      headers: {
        Authorization: `Bearer ${token}`,
      },
    }
  );

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to delete deployment: ${error}`);
  }
}

/**
 * Stream runtime logs for a deployment from Vercel
 * Returns a ReadableStream of JSON log objects
 */
export async function streamDeploymentLogs(
  deploymentId: string
): Promise<ReadableStream<Uint8Array>> {
  const { token, teamId, projectId } = getEnvConfig();

  const params = new URLSearchParams();
  if (teamId) params.set('teamId', teamId);

  const response = await fetch(
    `${VERCEL_API_BASE}/v1/projects/${projectId}/deployments/${deploymentId}/runtime-logs?${params}`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/stream+json',
      },
    }
  );

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to fetch deployment logs: ${error}`);
  }

  if (!response.body) {
    throw new Error('No response body for log stream');
  }

  return response.body;
}
