/**
 * ModuleImportAgent
 *
 * AI-powered agent that analyzes newly imported modules and automatically
 * generates appropriate module.json configuration files.
 */
/**
 * Agent input structure
 */
export interface AgentInput {
    modulePath: string;
    moduleName: string;
    workingDir: string;
    taskDescription?: string;
    workflowId?: number;
}
/**
 * Script validation result
 */
interface ScriptValidationResult {
    script: string;
    command: string;
    success: boolean;
    error?: string;
    output?: string;
}
/**
 * Validation summary
 */
interface ValidationSummary {
    allPassed: boolean;
    results: ScriptValidationResult[];
    workflowTriggered?: boolean;
    workflowId?: number;
}
/**
 * Agent output structure
 */
export interface AgentOutput {
    success: boolean;
    message: string;
    artifacts: Artifact[];
    error?: string;
    validation?: ValidationSummary;
}
/**
 * Artifact structure for generated files
 */
export interface Artifact {
    type: string;
    content: string;
    filePath?: string;
    metadata?: Record<string, any>;
}
/**
 * ModuleImportAgent class
 */
declare class ModuleImportAgent {
    private apiKey;
    private model;
    private apiUrl;
    constructor();
    /**
     * Execute the agent to analyze a module and generate module.json
     */
    execute(input: AgentInput): Promise<AgentOutput>;
    /**
     * Analyze the module directory to gather information
     */
    private analyzeModule;
    /**
     * Find all nested package.json files (excluding node_modules)
     */
    private findNestedPackageJsons;
    /**
     * Recursively scan source files for process.env usage
     */
    private scanForEnvVariables;
    /**
     * Use AI to generate module.json configuration based on analysis
     */
    private generateModuleConfig;
    /**
     * Build the analysis prompt for the AI
     */
    private buildAnalysisPrompt;
    /**
     * Validate that scripts in module.json actually work
     */
    private validateScripts;
    /**
     * Run a single script and capture result
     */
    private runScript;
    /**
     * Trigger a bugfix workflow to fix validation issues
     */
    private triggerBugfixWorkflow;
}
export default ModuleImportAgent;
//# sourceMappingURL=index.d.ts.map