/**
 * CodingAgent
 * Implements code changes based on plans
 * Read and write access - can read files, write files, create directories, and copy files
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
 * CodingAgent
 */
export declare class CodingAgent {
    private model;
    private apiKey;
    constructor();
    /**
     * Execute the coding agent
     */
    execute(input: AgentInput): Promise<AgentOutput>;
    /**
     * Parse AI response and execute any tool calls OR auto-extract code blocks
     */
    private parseAndExecuteTools;
    /**
     * Auto-extract code blocks from AI response and write to files
     * Handles formats like:
     * ```tsx:path/to/file.tsx
     * // code here
     * ```
     * OR
     * // path/to/file.tsx
     * ```tsx
     * // code here
     * ```
     */
    private autoExtractAndWriteCode;
    /**
     * Deep merge two JSON objects
     * newObj properties override existingObj, but existingObj properties are preserved if not in newObj
     */
    private deepMergeJson;
    /**
     * Scan working directory to get file structure with better context
     */
    private scanWorkingDirectory;
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
    /**
     * Verify build by running TypeScript compilation check
     * Checks both root tsconfig.json and frontend/tsconfig.json if they exist
     */
    private verifyBuild;
}
export default CodingAgent;
//# sourceMappingURL=index.d.ts.map