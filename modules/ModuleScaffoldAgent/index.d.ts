/**
 * ModuleScaffoldAgent
 * Creates module scaffolds and returns a plan for implementation
 */
/**
 * Agent Input Interface
 */
export interface AgentInput {
    workflowId: number;
    workflowType?: string;
    targetModule?: string;
    taskDescription?: string;
    workingDir: string;
    metadata?: {
        moduleType?: 'service' | 'library';
        port?: number;
        hasFrontend?: boolean;
        frontendPort?: number;
        relatedModules?: string[];
    };
}
/**
 * Agent Output Interface
 */
export interface AgentOutput {
    success: boolean;
    artifacts: Array<{
        type: string;
        content: string;
        filePath?: string;
        metadata?: Record<string, any>;
    }>;
    summary: string;
    suggestions?: string[];
    requiresRetry?: boolean;
    retryReason?: string;
    metadata?: Record<string, any>;
}
/**
 * ModuleScaffoldAgent
 */
export declare class ModuleScaffoldAgent {
    constructor();
    /**
     * Execute the scaffolding agent
     */
    execute(input: AgentInput): Promise<AgentOutput>;
}
export default ModuleScaffoldAgent;
