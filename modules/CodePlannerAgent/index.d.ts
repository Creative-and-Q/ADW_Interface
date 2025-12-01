/**
 * CodePlannerAgent
 * Analyzes codebase and creates implementation plans
 * Read-only access - can read files but not write or copy
 * Includes screenshot capability for visual analysis of existing UI
 */
import { type ScreenshotResult } from 'screenshot-tools';
/**
 * Agent Input Interface
 */
export interface AgentInput {
    workflowId: number;
    workflowType?: string;
    targetModule?: string;
    taskDescription?: string;
    branchName?: string;
    workingDir: string;
    metadata?: Record<string, any>;
    context?: Record<string, any>;
    env?: Record<string, string>;
    screenshotUrls?: string[];
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
    structuredPlan?: StructuredPlan;
    /** Full conversation history from the agent's API interactions */
    conversationHistory?: Array<{
        role: 'user' | 'assistant' | 'system';
        content: string;
        toolCalls?: Array<{
            name: string;
            input: any;
            result?: string;
        }>;
    }>;
}
/**
 * Structured Plan for Sub-Workflow Generation
 */
export interface StructuredPlan {
    objective: string;
    totalSteps: number;
    estimatedDuration?: string;
    subTasks: SubTask[];
    dependencies?: Record<number, number[]>;
}
/**
 * Sub-task definition
 */
export interface SubTask {
    id: number;
    title: string;
    description: string;
    workflowType: 'feature' | 'bugfix' | 'documentation' | 'refactor';
    targetModule?: string;
    priority: number;
    estimatedComplexity: 'low' | 'medium' | 'high';
    dependsOn?: number[];
    acceptanceCriteria?: string[];
    metadata?: Record<string, any>;
}
/**
 * CodePlannerAgent
 */
export declare class CodePlannerAgent {
    private model;
    private apiKey;
    private screenshotManager;
    constructor();
    /**
     * Execute the planner agent
     */
    execute(input: AgentInput): Promise<AgentOutput>;
    /**
     * Take a screenshot for planning reference
     */
    captureReferenceScreenshot(url: string, description: string, outputDir: string): Promise<{
        artifact: AgentOutput['artifacts'][0] | null;
        result: ScreenshotResult;
    }>;
    /**
     * Load tools.md documentation
     */
    private loadToolsDocumentation;
    /**
     * Build system prompt
     */
    private buildSystemPrompt;
    /**
     * Build user content (text + optional images)
     */
    private buildUserContent;
    /**
     * Call OpenRouter API with multimodal support
     */
    private callOpenRouter;
    /**
     * Execute a shell script tool
     */
    executeTool(toolName: string, args: string[], workingDir: string): Promise<string>;
    /**
     * Parse AI response and extract structured plan
     */
    private parseResponse;
}
export default CodePlannerAgent;
//# sourceMappingURL=index.d.ts.map