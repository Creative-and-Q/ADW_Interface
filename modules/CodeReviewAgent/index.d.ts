/**
 * CodeReviewAgent
 * Reviews code and generates review reports
 * Read-only access - can read files and analyze code but not write
 *
 * Uses an agentic loop to:
 * 1. Read source code files
 * 2. Analyze code quality and security
 * 3. Generate structured review report
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
 * CodeReviewAgent
 */
export declare class CodeReviewAgent {
    private model;
    private apiKey;
    constructor();
    /**
     * Execute the review agent with agentic loop
     */
    execute(input: AgentInput): Promise<AgentOutput>;
    /**
     * Parse AI response and execute any tool calls
     */
    private parseAndExecuteTools;
    /**
     * Extract structured review report from AI response
     */
    private extractReviewReport;
    /**
     * Extract suggestions from review
     */
    private extractSuggestions;
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
export default CodeReviewAgent;
//# sourceMappingURL=index.d.ts.map