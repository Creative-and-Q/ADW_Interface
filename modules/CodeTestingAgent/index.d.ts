/**
 * CodeTestingAgent
 * Generates and executes tests for code
 * Read, write, and execute access - can read code, write tests, and execute tests
 *
 * Uses an agentic loop to:
 * 1. Read source code
 * 2. Write test files
 * 3. Execute tests
 * 4. Fix failing tests
 * 5. Repeat until tests pass
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
 * CodeTestingAgent
 */
export declare class CodeTestingAgent {
    private model;
    private apiKey;
    constructor();
    /**
     * Execute the testing agent with agentic loop
     */
    execute(input: AgentInput): Promise<AgentOutput>;
    /**
     * Parse AI response and execute any tool calls OR auto-extract test files
     */
    private parseAndExecuteTools;
    /**
     * Auto-extract test code blocks from AI response and write to files
     */
    private autoExtractAndWriteTests;
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
     * Truncate messages to fit within context window (keep first user message and last N messages)
     */
    private truncateMessages;
    /**
     * Call OpenRouter API
     */
    private callOpenRouter;
    /**
     * Execute a shell script tool
     */
    executeTool(toolName: string, args: string[], workingDir: string): Promise<string>;
}
export default CodeTestingAgent;
//# sourceMappingURL=index.d.ts.map