/**
 * CodeDocumentationAgent
 * Generates documentation for code
 * Read and write access - can read code and write documentation files
 *
 * Uses an agentic loop to:
 * 1. Read source code files
 * 2. Understand the codebase structure
 * 3. Generate and write documentation files
 */
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
 * CodeDocumentationAgent
 */
export declare class CodeDocumentationAgent {
    private model;
    private apiKey;
    constructor();
    /**
     * Execute the documentation agent with agentic loop
     */
    execute(input: AgentInput): Promise<AgentOutput>;
    /**
     * Parse AI response and execute any tool calls OR auto-extract documentation files
     */
    private parseAndExecuteTools;
    /**
     * Auto-extract documentation from AI response and write to files
     */
    private autoExtractAndWriteDocs;
    /**
     * Load tools.md documentation
     */
    private loadToolsDocumentation;
    /**
     * Build system prompt
     */
    private buildSystemPrompt;
    /**
     * Build user prompt
     */
    private buildUserPrompt;
    /**
     * Call OpenRouter API
     */
    private callOpenRouter;
    /**
     * Execute a shell script tool
     */
    executeTool(toolName: string, args: string[], workingDir: string): Promise<string>;
}
export default CodeDocumentationAgent;
//# sourceMappingURL=index.d.ts.map