import { z } from 'zod';

// ============================================================================
// Module Types
// ============================================================================

export const ModuleType = z.enum(['intent', 'character', 'scene', 'item', 'storyteller']);
export type ModuleType = z.infer<typeof ModuleType>;

export const HttpMethod = z.enum(['GET', 'POST', 'PATCH', 'DELETE', 'PUT']);
export type HttpMethod = z.infer<typeof HttpMethod>;

// ============================================================================
// Step Condition
// ============================================================================

export const ConditionOperator = z.enum([
  'equals',
  'not_equals',
  'contains',
  'not_contains',
  'greater_than',
  'less_than',
  'greater_or_equal',
  'less_or_equal',
  'exists',
  'not_exists',
]);
export type ConditionOperator = z.infer<typeof ConditionOperator>;

export const StepConditionSchema = z.object({
  enabled: z.boolean(),
  sourceStep: z.string(), // Step ID to check
  field: z.string(), // JSON path (e.g., "result.success")
  operator: ConditionOperator,
  value: z.any().optional(), // Value to compare (not needed for exists/not_exists)
});
export type StepCondition = z.infer<typeof StepConditionSchema>;

// ============================================================================
// Complex Conditional Logic (AND/OR)
// ============================================================================

export const LogicConditionSchema = z.object({
  field: z.string(), // Variable path (e.g., "step_1.result.success")
  operator: ConditionOperator,
  value: z.any().optional(),
});
export type LogicCondition = z.infer<typeof LogicConditionSchema>;

export const LogicGroupSchema: z.ZodType<any> = z.lazy(() =>
  z.object({
    logic: z.enum(['AND', 'OR']),
    conditions: z.array(
      z.union([LogicConditionSchema, LogicGroupSchema])
    ),
  })
);
export type LogicGroup = {
  logic: 'AND' | 'OR';
  conditions: Array<LogicCondition | LogicGroup>;
};

// ============================================================================
// Conditional Routing
// ============================================================================

export const RoutingAction = z.enum(['skip_to_step', 'jump_to_chain', 'stop_chain']);
export type RoutingAction = z.infer<typeof RoutingAction>;

export const RoutingRuleSchema = z.object({
  id: z.string().optional(),
  condition: z.union([LogicConditionSchema, LogicGroupSchema]),
  action: RoutingAction,
  target: z.union([z.string(), z.number()]).optional(), // step_id (string) or chain_id (number)
  targetName: z.string().optional(),
  description: z.string().optional(),
  input_mapping: z.record(z.any()).optional(), // For jump_to_chain: map data to chain input
});
export type RoutingRule = z.infer<typeof RoutingRuleSchema>;

// ============================================================================
// Chain Step Types
// ============================================================================

export const StepType = z.enum(['module_call', 'chain_call']);
export type StepType = z.infer<typeof StepType>;

// Module Call Step (default - calls a module endpoint)
export const ModuleCallStepSchema = z.object({
  type: z.literal('module_call').default('module_call'),
  id: z.string(),
  name: z.string().optional(),
  module: ModuleType,
  endpoint: z.string(),
  method: HttpMethod,
  params: z.record(z.any()).optional(),
  body: z.record(z.any()).optional(),
  headers: z.record(z.string()).optional(),
  timeout: z.number().optional(),
  conditionalRouting: z.array(RoutingRuleSchema).optional(),
});
export type ModuleCallStep = z.infer<typeof ModuleCallStepSchema>;

// Chain Call Step (invokes another chain)
export const ChainCallStepSchema = z.object({
  type: z.literal('chain_call'),
  id: z.string(),
  name: z.string().optional(),
  chain_id: z.number(),
  chain_name: z.string().optional(), // For display purposes
  input_mapping: z.record(z.any()), // Map current context to sub-chain input
  conditionalRouting: z.array(RoutingRuleSchema).optional(),
});
export type ChainCallStep = z.infer<typeof ChainCallStepSchema>;

// Union of all step types
export const ChainStepSchema: z.ZodType<any> = z.lazy(() =>
  z.union([
    ModuleCallStepSchema,
    ChainCallStepSchema,
  ])
);
export type ChainStep = ModuleCallStep | ChainCallStep;

// ============================================================================
// Chain Configuration
// ============================================================================

export const OutputTemplateSchema = z.record(z.any());
export type OutputTemplate = z.infer<typeof OutputTemplateSchema>;

export const ChainConfigurationSchema = z.object({
  id: z.number().optional(),
  user_id: z.string(),
  name: z.string().min(1).max(255),
  description: z.string().optional(),
  steps: z.array(ChainStepSchema).min(1),
  output_template: OutputTemplateSchema.optional(), // Define output structure
  meta_data: z.record(z.any()).optional(), // Additional metadata
  created_at: z.string().optional(),
  updated_at: z.string().optional(),
});
export type ChainConfiguration = z.infer<typeof ChainConfigurationSchema>;

// ============================================================================
// Chain Execution
// ============================================================================

export const ExecutionContextSchema = z.object({
  user_id: z.string(),
  chain_id: z.number().optional(), // Optional if ad-hoc execution
  input: z.record(z.any()), // Input variables for the chain
  env: z.record(z.string()).optional(), // Environment variables
});
export type ExecutionContext = z.infer<typeof ExecutionContextSchema>;

export const StepResultSchema = z.object({
  step_id: z.string(),
  step_name: z.string().optional(),
  step_type: StepType.optional(),
  module: ModuleType.optional(), // Optional for chain_call and conditional
  endpoint: z.string().optional(),
  method: HttpMethod.optional(),
  request: z.object({
    url: z.string().optional(),
    params: z.record(z.any()).optional(),
    body: z.record(z.any()).optional(),
    headers: z.record(z.string()).optional(),
  }).optional(),
  response: z.any(), // The actual response from the module or chain
  success: z.boolean(),
  error: z.string().optional(),
  duration_ms: z.number(),
  skipped: z.boolean().optional(), // If condition was not met
  timestamp: z.string(),
  // For conditional steps
  condition_result: z.boolean().optional(),
  executed_branch: z.enum(['ifTrue', 'ifFalse']).optional(),
  // For chain calls
  sub_chain_id: z.number().optional(),
  sub_chain_result: z.any().optional(),
  // For routing analytics
  routing_evaluated: z.boolean().optional(), // Whether routing rules were evaluated
  routing_matched: z.any().optional(), // The routing rule that matched (if any)
  routing_action_taken: z.string().optional(), // The action that was taken
});
export type StepResult = z.infer<typeof StepResultSchema>;

export const ExecutionResultSchema = z.object({
  id: z.number().optional(),
  user_id: z.string(),
  chain_id: z.number().optional(),
  chain_name: z.string().optional(),
  input: z.record(z.any()),
  steps: z.array(StepResultSchema),
  output: z.any().optional(), // Final output based on output_template
  success: z.boolean(),
  error: z.string().optional(),
  total_duration_ms: z.number(),
  started_at: z.string(),
  completed_at: z.string(),
});
export type ExecutionResult = z.infer<typeof ExecutionResultSchema>;

// ============================================================================
// Module Metadata
// ============================================================================

export interface ModuleEndpoint {
  path: string;
  method: HttpMethod;
  description: string;
  params?: {
    name: string;
    type: string;
    required: boolean;
    description: string;
  }[];
  body?: {
    name: string;
    type: string;
    required: boolean;
    description: string;
  }[];
  response?: {
    description: string;
    example: any;
  };
}

export interface ModuleMetadata {
  name: string;
  type: ModuleType;
  url: string;
  port: number;
  description: string;
  endpoints: ModuleEndpoint[];
}

// ============================================================================
// API Request/Response Types
// ============================================================================

export const CreateChainRequestSchema = z.object({
  user_id: z.string(),
  name: z.string().min(1).max(255),
  description: z.string().optional(),
  steps: z.array(ChainStepSchema).min(1),
  output_template: OutputTemplateSchema.optional(),
  meta_data: z.record(z.any()).optional(),
});
export type CreateChainRequest = z.infer<typeof CreateChainRequestSchema>;

export const UpdateChainRequestSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  description: z.string().optional(),
  steps: z.array(ChainStepSchema).min(1).optional(),
  output_template: OutputTemplateSchema.optional(),
  meta_data: z.record(z.any()).optional(),
});
export type UpdateChainRequest = z.infer<typeof UpdateChainRequestSchema>;

export const ExecuteChainRequestSchema = z.object({
  input: z.record(z.any()),
  env: z.record(z.string()).optional(),
});
export type ExecuteChainRequest = z.infer<typeof ExecuteChainRequestSchema>;

export const ExecuteAdHocChainRequestSchema = z.object({
  user_id: z.string(),
  name: z.string().optional(),
  steps: z.array(ChainStepSchema).min(1),
  input: z.record(z.any()),
  output_template: OutputTemplateSchema.optional(),
  env: z.record(z.string()).optional(),
});
export type ExecuteAdHocChainRequest = z.infer<typeof ExecuteAdHocChainRequestSchema>;

// ============================================================================
// Standard API Response
// ============================================================================

export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  message?: string;
  error?: string;
}

// ============================================================================
// Statistics
// ============================================================================

export interface Statistics {
  total_chains: number;
  total_executions: number;
  successful_executions: number;
  failed_executions: number;
  average_duration_ms: number;
  chains_by_user: { user_id: string; count: number }[];
  executions_by_module: { module: ModuleType; count: number }[];
  recent_executions: ExecutionResult[];
}

// ============================================================================
// Module Process Management
// ============================================================================

export const ModuleName = z.enum(['CharacterController', 'ItemController', 'SceneController', 'IntentInterpreter', 'StoryTeller']);
export type ModuleName = z.infer<typeof ModuleName>;

export type ProcessStatus = 'running' | 'stopped' | 'starting' | 'stopping' | 'error' | 'unknown';

export interface ModuleProcessInfo {
  name: ModuleName;
  status: ProcessStatus;
  pid?: number;
  port: number;
  startedAt?: string;
  uptime?: number; // in seconds
  restartCount: number;
  lastError?: string;
  healthy?: boolean; // from health check
  portConflict?: {
    inUse: boolean;
    pid?: number;
    canForceKill: boolean;
  };
}

export const StartModuleRequestSchema = z.object({
  name: ModuleName,
});
export type StartModuleRequest = z.infer<typeof StartModuleRequestSchema>;

export const StopModuleRequestSchema = z.object({
  name: ModuleName,
});
export type StopModuleRequest = z.infer<typeof StopModuleRequestSchema>;

export const RestartModuleRequestSchema = z.object({
  name: ModuleName,
});
export type RestartModuleRequest = z.infer<typeof RestartModuleRequestSchema>;
