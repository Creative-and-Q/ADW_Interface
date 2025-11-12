/**
 * Core type definitions for AIDeveloper
 */

// Workflow types
export enum WorkflowType {
  FEATURE = 'feature',
  BUGFIX = 'bugfix',
  REFACTOR = 'refactor',
  DOCUMENTATION = 'documentation',
  REVIEW = 'review',
}

// Workflow statuses
export enum WorkflowStatus {
  PENDING = 'pending',
  PLANNING = 'planning',
  CODING = 'coding',
  TESTING = 'testing',
  REVIEWING = 'reviewing',
  DOCUMENTING = 'documenting',
  COMPLETED = 'completed',
  FAILED = 'failed',
}

// Agent types
export enum AgentType {
  ORCHESTRATOR = 'orchestrator',
  PLAN = 'plan',
  CODE = 'code',
  TEST = 'test',
  REVIEW = 'review',
  DOCUMENT = 'document',
}

// Agent execution statuses
export enum AgentStatus {
  PENDING = 'pending',
  RUNNING = 'running',
  COMPLETED = 'completed',
  FAILED = 'failed',
}

// Artifact types
export enum ArtifactType {
  PLAN = 'plan',
  CODE = 'code',
  TEST = 'test',
  REVIEW_REPORT = 'review_report',
  DOCUMENTATION = 'documentation',
}

// Webhook payload structure
export interface WebhookPayload {
  source: 'github' | 'gitlab' | 'custom' | 'manual';
  eventType?: string;
  repository?: {
    name: string;
    fullName: string;
    url: string;
    defaultBranch: string;
  };
  commit?: {
    sha: string;
    message: string;
    author: string;
  };
  pullRequest?: {
    number: number;
    title: string;
    description: string;
    branch: string;
  };
  issue?: {
    number: number;
    title: string;
    body: string;
  };
  customData?: Record<string, any>;
}

// Workflow configuration
export interface WorkflowConfig {
  type: WorkflowType;
  agentSequence: AgentType[];
  retryLimits: Record<AgentType, number>;
  timeouts: Record<AgentType, number>;
  requiredArtifacts: ArtifactType[];
}

// Workflow execution state
export interface WorkflowExecution {
  id: number;
  webhookId?: string;
  type: WorkflowType;
  status: WorkflowStatus;
  payload: WebhookPayload;
  branchName?: string;
  createdAt: Date;
  updatedAt: Date;
  completedAt?: Date;
}

// Agent execution state
export interface AgentExecution {
  id: number;
  workflowId: number;
  agentType: AgentType;
  status: AgentStatus;
  input: AgentInput;
  output?: AgentOutput;
  errorMessage?: string;
  retryCount: number;
  startedAt?: Date;
  completedAt?: Date;
}

// Input provided to agents
export interface AgentInput {
  workflowId: number;
  workflowType?: WorkflowType;
  taskDescription?: string;
  webhookPayload?: WebhookPayload;
  codebaseContext?: CodebaseContext;
  previousArtifacts?: Artifact[];
  retryReason?: string;
  metadata?: Record<string, any>;
  context?: {
    previousResults?: AgentOutput[];
    [key: string]: any;
  };
}

// Output from agents
export interface AgentOutput {
  success: boolean;
  artifacts: Artifact[];
  summary: string;
  suggestions?: string[];
  requiresRetry?: boolean;
  retryReason?: string;
  metadata?: Record<string, any>;
}

// Artifact (generated code, tests, docs, etc.)
export interface Artifact {
  id?: number;
  workflowId: number;
  agentExecutionId?: number;
  type: ArtifactType;
  filePath?: string;
  content: string;
  metadata?: Record<string, any>;
  createdAt?: Date;
}

// Codebase context for agents
export interface CodebaseContext {
  projectRoot: string;
  projectStructure: ProjectStructure;
  relevantFiles: FileInfo[];
  dependencies: Record<string, string>;
  patterns: CodePatterns;
  statistics: CodebaseStatistics;
}

// Project structure
export interface ProjectStructure {
  directories: string[];
  filesByType: Record<string, string[]>;
  entryPoints: string[];
}

// File information
export interface FileInfo {
  path: string;
  relativePath: string;
  language: string;
  size: number;
  lastModified: Date;
  imports?: string[];
  exports?: string[];
}

// Code patterns detected in codebase
export interface CodePatterns {
  namingConventions: {
    files: string;
    variables: string;
    functions: string;
    classes: string;
  };
  testFramework?: string;
  buildTool?: string;
  packageManager?: string;
  architecturePattern?: string;
}

// Codebase statistics
export interface CodebaseStatistics {
  totalFiles: number;
  totalLines: number;
  filesByLanguage: Record<string, number>;
  averageFileSize: number;
}

// AI message format (for OpenRouter API)
export interface AIMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

// OpenRouter API request options
export interface OpenRouterRequestOptions {
  model: string;
  maxTokens?: number;
  temperature?: number;
  systemPrompt?: string;
  stopSequences?: string[];
}

// Git operation result
export interface GitOperationResult {
  success: boolean;
  branch?: string;
  commit?: string;
  message?: string;
  error?: string;
}

// Test execution result
export interface TestExecutionResult {
  success: boolean;
  totalTests: number;
  passedTests: number;
  failedTests: number;
  coverage?: number;
  failures?: TestFailure[];
  output: string;
}

// Test failure details
export interface TestFailure {
  testName: string;
  errorMessage: string;
  stackTrace?: string;
  filePath?: string;
  lineNumber?: number;
}

// Code review result
export interface CodeReviewResult {
  approved: boolean;
  securityIssues: ReviewIssue[];
  qualityIssues: ReviewIssue[];
  recommendations: string[];
  overallScore: number;
  summary: string;
}

// Review issue
export interface ReviewIssue {
  severity: 'critical' | 'high' | 'medium' | 'low';
  category: string;
  description: string;
  filePath?: string;
  lineNumber?: number;
  suggestion?: string;
}

// Plan structure
export interface ImplementationPlan {
  summary: string;
  approach: string;
  fileChanges: FileChange[];
  apiSpecifications?: APISpecification[];
  dataModelChanges?: DataModelChange[];
  estimatedEffort: string;
  risks?: string[];
  dependencies?: string[];
}

// File change specification
export interface FileChange {
  action: 'create' | 'modify' | 'delete';
  filePath: string;
  description: string;
  priority: 'high' | 'medium' | 'low';
}

// API specification
export interface APISpecification {
  endpoint: string;
  method: string;
  description: string;
  parameters?: Parameter[];
  requestBody?: any;
  responseBody?: any;
}

// Parameter definition
export interface Parameter {
  name: string;
  type: string;
  required: boolean;
  description: string;
}

// Data model change
export interface DataModelChange {
  table?: string;
  action: 'create' | 'modify' | 'delete';
  description: string;
  fields?: Field[];
}

// Field definition
export interface Field {
  name: string;
  type: string;
  constraints?: string[];
  description?: string;
}

// Webhook log entry
export interface WebhookLog {
  id: number;
  source: string;
  eventType?: string;
  payload: any;
  workflowId?: number;
  responseStatus?: number;
  receivedAt: Date;
}

// Application configuration
export interface AppConfig {
  nodeEnv: string;
  port: number;
  openrouter: {
    apiKey: string;
    models: {
      planning: string;
      coding: string;
      testing: string;
      review: string;
      docs: string;
    };
  };
  database: {
    host: string;
    port: number;
    user: string;
    password: string;
    name: string;
  };
  redis: {
    host: string;
    port: number;
    password?: string;
  };
  webhooks: {
    secrets: {
      github: string;
      gitlab: string;
      custom: string;
    };
  };
  git: {
    userName: string;
    userEmail: string;
    defaultBranch: string;
  };
  agents: {
    maxConcurrent: number;
    timeoutMs: number;
    maxRetryAttempts: number;
  };
  workspace: {
    root: string;
  };
  logging: {
    level: string;
    dir: string;
  };
}
