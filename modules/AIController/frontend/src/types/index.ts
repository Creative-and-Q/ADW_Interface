// Types matching backend types.ts

export type ModuleType = 'intent' | 'character' | 'scene' | 'item' | 'storyteller';
export type HttpMethod = 'GET' | 'POST' | 'PATCH' | 'DELETE' | 'PUT';
export type ConditionOperator =
  | 'equals'
  | 'not_equals'
  | 'contains'
  | 'not_contains'
  | 'greater_than'
  | 'less_than'
  | 'greater_or_equal'
  | 'less_or_equal'
  | 'exists'
  | 'not_exists';

export type StepType = 'module_call' | 'chain_call';
export type RoutingAction = 'skip_to_step' | 'jump_to_chain' | 'stop_chain';

// Conditional logic for routing decisions
export interface LogicCondition {
  field: string; // Variable path (e.g., "step_1.result.success")
  operator: ConditionOperator;
  value?: any;
}

export interface LogicGroup {
  logic: 'AND' | 'OR';
  conditions: Array<LogicCondition | LogicGroup>;
}

// Routing rule that can be attached to any step
export interface RoutingRule {
  id?: string; // For UI tracking
  condition: LogicCondition | LogicGroup;
  action: RoutingAction;
  target?: string | number; // step_id (string) or chain_id (number)
  targetName?: string; // For display: step name or chain name
  description?: string; // User-friendly description of what this rule does
  input_mapping?: Record<string, any>; // For jump_to_chain: map data to chain input
}

// Module Call Step (default - calls a module endpoint)
export interface ModuleCallStep {
  type?: 'module_call';
  id: string;
  name?: string;
  module: ModuleType;
  endpoint: string;
  method: HttpMethod;
  params?: Record<string, any>;
  body?: Record<string, any>;
  headers?: Record<string, string>;
  timeout?: number;
  conditionalRouting?: RoutingRule[]; // New: routing logic for this step
}

// Chain Call Step (invokes another chain)
export interface ChainCallStep {
  type: 'chain_call';
  id: string;
  name?: string;
  chain_id: number;
  chain_name?: string;
  input_mapping: Record<string, any>;
  conditionalRouting?: RoutingRule[]; // New: routing logic for this step
}

// Union of all step types
export type ChainStep = ModuleCallStep | ChainCallStep;

export type OutputTemplate = Record<string, any>;

export interface ChainConfiguration {
  id?: number;
  user_id: string;
  name: string;
  description?: string;
  steps: ChainStep[];
  output_template?: OutputTemplate;
  meta_data?: Record<string, any>;
  created_at?: string;
  updated_at?: string;
}

export interface StepResult {
  step_id: string;
  step_name?: string;
  step_type?: StepType;
  module?: ModuleType;
  endpoint?: string;
  method?: HttpMethod;
  request?: {
    url?: string;
    params?: Record<string, any>;
    body?: Record<string, any>;
    headers?: Record<string, string>;
  };
  response: any;
  success: boolean;
  error?: string;
  duration_ms: number;
  skipped?: boolean;
  timestamp: string;
  // For conditional steps
  condition_result?: boolean;
  executed_branch?: 'ifTrue' | 'ifFalse';
  // For chain calls
  sub_chain_id?: number;
  sub_chain_result?: any;
  // For routing analytics
  routing_evaluated?: boolean;
  routing_matched?: any;
  routing_action_taken?: string;
}

export interface ExecutionResult {
  id?: number;
  user_id: string;
  chain_id?: number;
  chain_name?: string;
  input: Record<string, any>;
  steps: StepResult[];
  output?: any;
  success: boolean;
  error?: string;
  total_duration_ms: number;
  started_at: string;
  completed_at: string;
}

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

export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  message?: string;
  error?: string;
}

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

// Module Process Management
export type ModuleName = 'CharacterController' | 'ItemController' | 'SceneController' | 'IntentInterpreter' | 'StoryTeller';
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
