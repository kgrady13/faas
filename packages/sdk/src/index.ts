/**
 * @faas/sdk - FaaS Worker SDK
 *
 * This SDK provides the Worker class and capability types for building
 * serverless functions that integrate with the faas platform.
 */

// ============================================================================
// Capability Types
// ============================================================================

/**
 * Base capability interface shared by all capability types.
 */
export interface Capability {
  /** Unique name for this capability */
  name: string;
  /** Human-readable description of what this capability does */
  description?: string;
}

/**
 * Sync capability for importing external data into the faas platform.
 * Use this when you need to periodically sync data from external sources.
 */
export interface SyncCapability extends Capability {
  type: "sync";
  /** Function that performs the sync operation */
  sync: () => Promise<void>;
}

/**
 * Automation capability for responding to faas platform events.
 * Use this when you want to run code in response to page or database changes.
 */
export interface AutomationCapability extends Capability {
  type: "automation";
  /** The event that triggers this automation */
  trigger: "page_changed" | "database_changed";
  /** Function that runs when the trigger fires */
  run: (event: AutomationEvent) => Promise<void>;
}

/**
 * Skill capability for exposing custom tools to faas agents.
 * Use this when you want to provide a callable function that agents can use.
 *
 * @typeParam TInput - The type of input the skill accepts
 * @typeParam TOutput - The type of output the skill returns
 *
 * @example
 * ```typescript
 * worker.addCapability({
 *   type: "skill",
 *   name: "greet",
 *   execute: async (input: { name: string }) => {
 *     return { message: `Hello, ${input.name}!` };
 *   },
 * });
 * ```
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export interface SkillCapability<
  TInput = any,
  TOutput = any,
> extends Capability {
  type: "skill";
  /** Function that executes the skill and returns a result */
  execute: (input: TInput) => Promise<TOutput>;
}

/**
 * Union type of all capability types.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type WorkerCapability =
  | SyncCapability
  | AutomationCapability
  | SkillCapability<any, any>;

// ============================================================================
// Event Types
// ============================================================================

/**
 * Event payload for automation triggers.
 */
export interface AutomationEvent {
  /** The type of event that occurred */
  type: "page_changed" | "database_changed";
  /** ID of the page or database that changed */
  targetId: string;
  /** Timestamp of the event */
  timestamp: string;
  /** Additional event metadata */
  metadata?: Record<string, unknown>;
}

// ============================================================================
// Worker Class
// ============================================================================

/**
 * The main Worker class that defines your serverless function.
 *
 * Create a worker using `createWorker()` and add capabilities to define
 * what your worker can do.
 *
 * @example
 * ```typescript
 * import { createWorker } from '@faas/sdk';
 *
 * const worker = createWorker();
 *
 * worker.addCapability({
 *   type: 'skill',
 *   name: 'greet',
 *   description: 'Returns a greeting message',
 *   execute: async (input) => {
 *     return { message: `Hello, ${input.name}!` };
 *   }
 * });
 *
 * export default worker;
 * ```
 */
export class Worker {
  private capabilities: WorkerCapability[] = [];

  /**
   * Add a capability to this worker.
   * @param capability The capability to add
   * @returns This worker instance for chaining
   */
  addCapability(capability: WorkerCapability): this {
    this.capabilities.push(capability);
    return this;
  }

  /**
   * Get all capabilities registered with this worker.
   * @returns Array of capabilities
   */
  getCapabilities(): WorkerCapability[] {
    return [...this.capabilities];
  }

  /**
   * Get a specific capability by name.
   * @param name The name of the capability to find
   * @returns The capability if found, undefined otherwise
   */
  getCapability(name: string): WorkerCapability | undefined {
    return this.capabilities.find((c) => c.name === name);
  }

  /**
   * Check if this worker has a specific capability.
   * @param name The name of the capability to check
   * @returns True if the capability exists
   */
  hasCapability(name: string): boolean {
    return this.capabilities.some((c) => c.name === name);
  }

  /**
   * HTTP fetch handler for Vercel Bun runtime compatibility.
   * Routes requests to the appropriate capability based on the request.
   *
   * Endpoints:
   * - GET  /                → List all capabilities
   * - POST /skill/:name     → Execute a skill capability
   * - POST /sync/:name      → Trigger a sync capability
   * - POST /automation/:name → Trigger an automation (with event body)
   */
  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url, "http://localhost");
    const path = url.pathname;
    const method = request.method;

    // GET / - List capabilities
    if (method === "GET" && (path === "/" || path === "")) {
      return Response.json({
        capabilities: this.capabilities.map((c) => ({
          type: c.type,
          name: c.name,
          description: c.description,
        })),
      });
    }

    // Parse path: /:type/:name
    const match = path.match(/^\/(skill|sync|automation)\/(.+)$/);
    if (!match) {
      return Response.json(
        { error: "Not found", path },
        { status: 404 }
      );
    }

    const [, type, name] = match;
    const capability = this.capabilities.find(
      (c) => c.type === type && c.name === name
    );

    if (!capability) {
      return Response.json(
        { error: `Capability not found: ${type}/${name}` },
        { status: 404 }
      );
    }

    try {
      if (capability.type === "skill") {
        const input = method === "POST" ? await request.json() : {};
        const result = await capability.execute(input);
        return Response.json({ success: true, result });
      }

      if (capability.type === "sync") {
        await capability.sync();
        return Response.json({ success: true });
      }

      if (capability.type === "automation") {
        const event = await request.json() as AutomationEvent;
        await capability.run(event);
        return Response.json({ success: true });
      }

      return Response.json({ error: "Unknown capability type" }, { status: 400 });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      return Response.json({ error: message }, { status: 500 });
    }
  }
}

// ============================================================================
// Factory Function
// ============================================================================

/**
 * Create a new Worker instance.
 *
 * @example
 * ```typescript
 * import { createWorker } from '@faas/sdk';
 *
 * const worker = createWorker();
 * export default worker;
 * ```
 */
export function createWorker(): Worker {
  return new Worker();
}
