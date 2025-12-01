/**
 * ModuleScaffoldAgent
 * Creates module scaffolds and uses AI to decompose requirements into sub-workflows
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
    env?: Record<string, string>;
    metadata?: {
        moduleType?: 'service' | 'library';
        port?: number;
        hasFrontend?: boolean;
        frontendPort?: number;
        relatedModules?: string[];
    };
}
/**
 * Sub-task for workflow decomposition
 */
export interface SubTask {
    title: string;
    description: string;
    workflowType: 'feature' | 'bugfix' | 'documentation' | 'refactor';
    targetModule: string;
    priority: number;
    estimatedComplexity: 'low' | 'medium' | 'high';
    dependsOn: number[];
    acceptanceCriteria?: string[];
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
    private apiKey;
    private model;
    constructor();
    /**
     * Execute the scaffolding agent
     */
    execute(input: AgentInput): Promise<AgentOutput>;
    /**
     * Use AI to decompose the task description into focused sub-tasks
     */
    private decomposeTaskWithAI;
    /**
     * Parse sub-tasks from AI response
     */
    private parseSubTasksFromResponse;
    /**
     * Basic decomposition fallback when AI is unavailable
     */
    private basicDecomposition;
}
export default ModuleScaffoldAgent;
