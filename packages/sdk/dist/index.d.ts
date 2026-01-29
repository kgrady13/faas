/**
 * @faas/sdk - Notion FaaS Worker SDK
 *
 * This SDK provides the Worker class and capability types for building
 * serverless functions that integrate with Notion.
 */
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
 * Sync capability for importing external data into Notion.
 * Use this when you need to periodically sync data from external sources.
 */
export interface SyncCapability extends Capability {
    type: "sync";
    /** Function that performs the sync operation */
    sync: () => Promise<void>;
}
/**
 * Automation capability for responding to Notion events.
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
 * Skill capability for exposing custom tools to Notion agents.
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
export interface SkillCapability<TInput = any, TOutput = any> extends Capability {
    type: "skill";
    /** Function that executes the skill and returns a result */
    execute: (input: TInput) => Promise<TOutput>;
}
/**
 * Union type of all capability types.
 */
export type WorkerCapability = SyncCapability | AutomationCapability | SkillCapability<any, any>;
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
export declare class Worker {
    private capabilities;
    /**
     * Add a capability to this worker.
     * @param capability The capability to add
     * @returns This worker instance for chaining
     */
    addCapability(capability: WorkerCapability): this;
    /**
     * Get all capabilities registered with this worker.
     * @returns Array of capabilities
     */
    getCapabilities(): WorkerCapability[];
    /**
     * Get a specific capability by name.
     * @param name The name of the capability to find
     * @returns The capability if found, undefined otherwise
     */
    getCapability(name: string): WorkerCapability | undefined;
    /**
     * Check if this worker has a specific capability.
     * @param name The name of the capability to check
     * @returns True if the capability exists
     */
    hasCapability(name: string): boolean;
}
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
export declare function createWorker(): Worker;
//# sourceMappingURL=index.d.ts.map