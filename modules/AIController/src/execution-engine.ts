import {
  ChainConfiguration,
  ChainStep,
  ModuleCallStep,
  ChainCallStep,
  ExecutionContext,
  ExecutionResult,
  StepResult,
  LogicCondition,
  LogicGroup,
  RoutingRule,
} from './types.js';
import { ModuleClients, ModuleRequest } from './module-clients.js';
import type { MySQLStorage } from './mysql-storage.js';

export class ExecutionEngine {
  private storage?: MySQLStorage;

  constructor(private moduleClients: ModuleClients) {}

  setStorage(storage: MySQLStorage) {
    this.storage = storage;
  }

  /**
   * Execute a chain configuration
   */
  async execute(
    chain: ChainConfiguration,
    context: ExecutionContext
  ): Promise<ExecutionResult> {
    const startTime = Date.now();
    const steps: StepResult[] = [];
    const responseContext: Record<string, any> = {
      input: context.input,
      env: context.env || {},
      context: {
        user_id: context.user_id,
        chain_id: chain.id,
      },
    };

    console.log(`\n🔗 Executing chain: ${chain.name}`);
    console.log(`📊 Steps: ${chain.steps.length}`);

    try {
      // Execute all steps
      await this.executeSteps(chain.steps, responseContext, steps);

      // Build output using output_template if provided
      let output: any = undefined;
      if (chain.output_template) {
        console.log(`\n📤 Processing output template:`, JSON.stringify(chain.output_template));
        console.log(`📤 Available context keys:`, Object.keys(responseContext));
        console.log(`📤 Response context input:`, JSON.stringify(responseContext.input));

        // Show step results available for template
        const stepKeys = Object.keys(responseContext).filter(k => k.startsWith('step_'));
        console.log(`📤 Available step results: ${stepKeys.join(', ')}`);

        // Log step contents to help debug
        stepKeys.forEach(key => {
          const stepData = responseContext[key];
          console.log(`📤 ${key} structure:`, typeof stepData === 'object' ? Object.keys(stepData).join(', ') : typeof stepData);
        });

        output = this.resolveVariables(chain.output_template, responseContext);
        console.log(`📤 Generated output from template:`, JSON.stringify(output));
        console.log(`📤 Output is resolved:`, JSON.stringify(output) !== JSON.stringify(chain.output_template));
      }

      const totalDuration = Date.now() - startTime;
      console.log(`\n✅ Chain completed successfully (${totalDuration}ms)`);
      if (output !== undefined) {
        console.log(`📤 Final output: ${JSON.stringify(output)}\n`);
      } else {
        console.log(`📤 No output generated\n`);
      }

      return {
        user_id: context.user_id,
        chain_id: chain.id,
        chain_name: chain.name,
        input: context.input,
        steps,
        output,
        success: true,
        total_duration_ms: totalDuration,
        started_at: new Date(startTime).toISOString(),
        completed_at: new Date().toISOString(),
      };
    } catch (error: any) {
      const totalDuration = Date.now() - startTime;
      console.log(`\n❌ Chain failed: ${error.message} (${totalDuration}ms)\n`);

      return {
        user_id: context.user_id,
        chain_id: chain.id,
        chain_name: chain.name,
        input: context.input,
        steps,
        success: false,
        error: error.message,
        total_duration_ms: totalDuration,
        started_at: new Date(startTime).toISOString(),
        completed_at: new Date().toISOString(),
      };
    }
  }

  /**
   * Execute a list of steps with routing support
   */
  private async executeSteps(
    steps: ChainStep[],
    responseContext: Record<string, any>,
    results: StepResult[]
  ): Promise<void> {
    let i = 0;
    while (i < steps.length) {
      const step = steps[i];
      await this.executeStep(step, responseContext, results, i + 1, steps.length);

      // Get the last step result to add routing analytics
      const lastResult = results[results.length - 1];

      // Check routing rules after step completes
      const routingAction = await this.evaluateRoutingRules(step, responseContext);

      // Record routing analytics in step result
      if ((step as any).conditionalRouting && (step as any).conditionalRouting.length > 0) {
        lastResult.routing_evaluated = true;
        if (routingAction) {
          lastResult.routing_matched = routingAction;
          lastResult.routing_action_taken = `${routingAction.action}${routingAction.target ? ` → ${routingAction.target}` : ''}`;
        }
      }

      if (routingAction) {
        if (routingAction.action === 'skip_to_step') {
          // Find target step and jump to it
          const targetIndex = steps.findIndex(s => s.id === routingAction.target);
          if (targetIndex !== -1) {
            console.log(`  🔀 Routing: Skipping to step ${targetIndex + 1} (${routingAction.target})`);
            i = targetIndex;
            continue;
          } else {
            console.warn(`  ⚠️  Routing target step not found: ${routingAction.target}`);
          }
        } else if (routingAction.action === 'jump_to_chain') {
          // Execute another chain and use its output as this step's result
          console.log(`  🔀 Routing: Jumping to chain ${routingAction.target}`);
          const jumpedChainOutput = await this.executeJumpToChain(
            routingAction.target as number,
            routingAction.input_mapping || {},
            responseContext
          );

          // Update the last step result to include the jumped chain output
          if (lastResult) {
            lastResult.response = jumpedChainOutput;
            lastResult.sub_chain_id = routingAction.target as number;
          }

          // Add jumped chain's output to context for next steps
          responseContext[step.id] = jumpedChainOutput;
          console.log(`  🔀 Jumped chain output added to context[${step.id}]`);
          // Continue to next step (don't return)
        } else if (routingAction.action === 'stop_chain') {
          console.log(`  🔀 Routing: Stopping chain execution`);
          return; // Stop executing
        }
      }

      i++;
    }
  }

  /**
   * Execute a single step (dispatches to appropriate handler)
   */
  private async executeStep(
    step: ChainStep,
    responseContext: Record<string, any>,
    results: StepResult[],
    stepNumber: number,
    totalSteps: number
  ): Promise<void> {
    const stepStartTime = Date.now();

    // Determine step type (default to module_call for backward compatibility)
    const stepType = (step as any).type || 'module_call';

    console.log(`\n  ⚙️  Step ${stepNumber}/${totalSteps}: ${step.id} (${stepType})`);

    try {
      switch (stepType) {
        case 'module_call':
          await this.executeModuleCallStep(step as ModuleCallStep, responseContext, results, stepStartTime);
          break;
        case 'chain_call':
          await this.executeChainCallStep(step as ChainCallStep, responseContext, results, stepStartTime);
          break;
        default:
          throw new Error(`Unknown step type: ${stepType}`);
      }
    } catch (error: any) {
      const duration = Date.now() - stepStartTime;
      console.log(`  ❌ Error: ${error.message}`);

      results.push({
        step_id: step.id,
        step_name: step.name,
        step_type: stepType,
        response: null,
        success: false,
        error: error.message,
        duration_ms: duration,
        timestamp: new Date().toISOString(),
      });

      throw error;
    }
  }

  /**
   * Execute a module call step
   */
  private async executeModuleCallStep(
    step: ModuleCallStep,
    responseContext: Record<string, any>,
    results: StepResult[],
    stepStartTime: number
  ): Promise<void> {
    // Resolve variables in the step
    console.log(`  📝 Original body:`, JSON.stringify(step.body).substring(0, 300));
    const resolvedParams = this.resolveVariables(step.params, responseContext);
    const resolvedBody = this.resolveVariables(step.body, responseContext);
    const resolvedHeaders = this.resolveVariables(step.headers, responseContext);

    console.log(`  📝 Resolved body:`, JSON.stringify(resolvedBody).substring(0, 300));
    console.log(`  📝 Body field types:`, Object.entries(resolvedBody || {}).map(([k, v]) => `${k}: ${typeof v}`).join(', '));

    const request: ModuleRequest = {
      module: step.module,
      endpoint: step.endpoint,
      method: step.method,
      params: resolvedParams,
      body: resolvedBody,
      headers: resolvedHeaders,
      timeout: step.timeout,
    };

    const response = await this.moduleClients.executeRequest(request);
    const duration = Date.now() - stepStartTime;

    console.log(`  ✅ Success (${duration}ms)`);
    console.log(`  📊 Response data type:`, typeof response.data);
    console.log(`  📊 Response data keys:`, typeof response.data === 'object' && response.data !== null ? Object.keys(response.data).join(', ') : 'N/A');
    console.log(`  📊 Response data sample:`, JSON.stringify(response.data).substring(0, 200));

    const stepResult: StepResult = {
      step_id: step.id,
      step_name: step.name,
      step_type: 'module_call',
      module: step.module,
      endpoint: step.endpoint,
      method: step.method,
      request: {
        url: this.buildFullURL(step.module, step.endpoint, resolvedParams),
        params: resolvedParams,
        body: resolvedBody,
        headers: resolvedHeaders,
      },
      response: response.data,
      success: response.status >= 200 && response.status < 300,
      duration_ms: duration,
      timestamp: new Date().toISOString(),
    };

    results.push(stepResult);

    // Add response to context for next steps
    console.log(`  📊 Adding to context[${step.id}]:`, typeof response.data === 'object' ? Object.keys(response.data).join(', ') : typeof response.data);
    responseContext[step.id] = response.data;
  }

  /**
   * Execute a chain call step (invoke another chain)
   */
  private async executeChainCallStep(
    step: ChainCallStep,
    responseContext: Record<string, any>,
    results: StepResult[],
    stepStartTime: number
  ): Promise<void> {
    if (!this.storage) {
      throw new Error('Storage not configured - cannot invoke sub-chains');
    }

    console.log(`  📞 Invoking chain ${step.chain_id}...`);

    // Resolve input mapping
    const subChainInput = this.resolveVariables(step.input_mapping, responseContext);

    // Load the sub-chain
    const subChain = await this.storage.getChain(step.chain_id);

    // Create sub-chain context
    const subContext: ExecutionContext = {
      user_id: responseContext.context.user_id,
      chain_id: step.chain_id,
      input: subChainInput,
      env: responseContext.env,
    };

    // Execute the sub-chain
    const subChainResult = await this.execute(subChain, subContext);

    const duration = Date.now() - stepStartTime;

    if (!subChainResult.success) {
      throw new Error(`Sub-chain ${step.chain_id} failed: ${subChainResult.error}`);
    }

    console.log(`  ✅ Chain call completed (${duration}ms)`);
    console.log(`  📊 Sub-chain output:`, JSON.stringify(subChainResult.output));
    console.log(`  📊 Sub-chain has ${subChainResult.steps.length} steps`);

    // Use the sub-chain's output if available (this is from output_template)
    // Otherwise fall back to the last step's response
    const chainCallOutput = subChainResult.output !== undefined
      ? subChainResult.output
      : subChainResult.steps[subChainResult.steps.length - 1]?.response;

    console.log(`  📊 Using output:`, JSON.stringify(chainCallOutput));

    const stepResult: StepResult = {
      step_id: step.id,
      step_name: step.name,
      step_type: 'chain_call',
      sub_chain_id: step.chain_id,
      sub_chain_result: subChainResult,
      response: chainCallOutput,
      success: true,
      duration_ms: duration,
      timestamp: new Date().toISOString(),
    };

    results.push(stepResult);

    // Add sub-chain result to context for use in subsequent steps
    responseContext[step.id] = chainCallOutput;
  }

  /**
   * Evaluate routing rules and return the first matching action
   */
  private async evaluateRoutingRules(
    step: ChainStep,
    responseContext: Record<string, any>
  ): Promise<RoutingRule | null> {
    const routingRules = (step as any).conditionalRouting as RoutingRule[] | undefined;

    if (!routingRules || routingRules.length === 0) {
      return null;
    }

    console.log(`  🔀 Evaluating ${routingRules.length} routing rule(s)...`);

    // Evaluate rules in order, return first match
    for (let i = 0; i < routingRules.length; i++) {
      const rule = routingRules[i];
      console.log(`  🔀 Rule ${i + 1}: ${rule.description || rule.action}`);

      const conditionMet = this.evaluateLogicCondition(rule.condition, responseContext);
      console.log(`  🔀 Rule ${i + 1} result: ${conditionMet ? '✅ MATCHED' : '❌ Not matched'}`);

      if (conditionMet) {
        console.log(`  ⚡ Routing rule matched: ${rule.description || rule.action}`);
        return rule;
      }
    }

    console.log(`  🔀 No routing rules matched`);
    return null;
  }

  /**
   * Execute jump to another chain
   * Returns the jumped chain's output for use in subsequent steps
   */
  private async executeJumpToChain(
    chainId: number,
    inputMapping: Record<string, any>,
    responseContext: Record<string, any>
  ): Promise<any> {
    if (!this.storage) {
      throw new Error('Storage not configured - cannot jump to chain');
    }

    console.log(`  📞 Jumping to chain ${chainId}...`);

    // Resolve input mapping
    const chainInput = this.resolveVariables(inputMapping, responseContext);

    // Load the target chain
    const targetChain = await this.storage.getChain(chainId);

    // Create context for target chain
    const targetContext: ExecutionContext = {
      user_id: responseContext.context.user_id,
      chain_id: chainId,
      input: chainInput,
      env: responseContext.env,
    };

    // Execute the target chain
    const chainResult = await this.execute(targetChain, targetContext);

    if (!chainResult.success) {
      throw new Error(`Jumped chain ${chainId} (${targetChain.name}) failed: ${chainResult.error}`);
    }

    console.log(`  ✅ Chain jump completed: ${targetChain.name}`);
    console.log(`  📊 Jumped chain output:`, JSON.stringify(chainResult.output));

    // Return the jumped chain's output (or last step's response if no output template)
    return chainResult.output !== undefined
      ? chainResult.output
      : chainResult.steps[chainResult.steps.length - 1]?.response;
  }

  /**
   * Resolve variables in a value
   * Supports {{input.field}}, {{step_1.result.field}}, {{env.VAR}}, etc.
   */
  private resolveVariables(value: any, context: Record<string, any>): any {
    if (typeof value === 'string') {
      // Check if the entire value is a single template variable (e.g., "{{step_1.result.intents}}")
      // In this case, return the actual value instead of stringifying it
      const singleVarMatch = value.match(/^\{\{([^}]+)\}\}$/);
      if (singleVarMatch) {
        const path = singleVarMatch[1].trim();
        const resolved = this.getValueByPath(context, path);
        return resolved !== undefined ? resolved : value;
      }

      // Otherwise, replace all {{variable}} patterns with stringified values
      return value.replace(/\{\{([^}]+)\}\}/g, (match, path) => {
        const resolved = this.getValueByPath(context, path.trim());
        return resolved !== undefined ? String(resolved) : match;
      });
    }

    if (Array.isArray(value)) {
      return value.map((item) => this.resolveVariables(item, context));
    }

    if (typeof value === 'object' && value !== null) {
      const resolved: Record<string, any> = {};
      for (const [key, val] of Object.entries(value)) {
        resolved[key] = this.resolveVariables(val, context);
      }
      return resolved;
    }

    return value;
  }

  /**
   * Get value from context by path (e.g., "step_1.result.primaryIntent.type" or "step_2.characters[0]")
   */
  private getValueByPath(obj: any, path: string): any {
    const parts = path.split('.');
    let current = obj;

    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];

      if (current === undefined || current === null) {
        console.log(`  ⚠️  Path resolution failed at '${parts.slice(0, i).join('.')}' - value is ${current}`);
        return undefined;
      }

      // Handle array indexing like "characters[0]"
      const arrayMatch = part.match(/^([^\[]+)\[(\d+)\]$/);
      if (arrayMatch) {
        const [, propName, indexStr] = arrayMatch;
        const index = parseInt(indexStr, 10);

        // Access the array property first
        current = current[propName];
        if (current === undefined || current === null) {
          console.log(`  ⚠️  Path resolution failed: '${parts.slice(0, i).join('.')}.${propName}' does not exist`);
          return undefined;
        }

        // Then access the array index
        if (!Array.isArray(current)) {
          console.log(`  ⚠️  Path resolution failed: '${parts.slice(0, i).join('.')}.${propName}' is not an array`);
          return undefined;
        }
        current = current[index];
      } else {
        // Regular property access
        const nextValue = current[part];

        if (nextValue === undefined) {
          // Log available keys to help debug
          if (typeof current === 'object' && current !== null) {
            const availableKeys = Object.keys(current).slice(0, 10).join(', ');
            console.log(`  ⚠️  Path resolution failed: '${part}' not found in '${parts.slice(0, i).join('.')}'. Available keys: ${availableKeys}`);
          } else {
            console.log(`  ⚠️  Path resolution failed: cannot access '${part}' on non-object`);
          }
          return undefined;
        }

        current = nextValue;
      }
    }

    return current;
  }

  /**
   * Evaluate a logic condition (single condition or AND/OR group)
   */
  private evaluateLogicCondition(
    condition: LogicCondition | LogicGroup,
    context: Record<string, any>
  ): boolean {
    // Check if it's a logic group (AND/OR)
    if ('logic' in condition) {
      const group = condition as LogicGroup;

      if (group.logic === 'AND') {
        // All conditions must be true
        return group.conditions.every(c => this.evaluateLogicCondition(c, context));
      } else {
        // At least one condition must be true
        return group.conditions.some(c => this.evaluateLogicCondition(c, context));
      }
    }

    // Single condition
    const singleCondition = condition as LogicCondition;
    const value = this.getValueByPath(context, singleCondition.field);

    console.log(`    🔍 Condition: ${singleCondition.field} ${singleCondition.operator} ${JSON.stringify(singleCondition.value)}`);
    console.log(`    🔍 Actual value: ${JSON.stringify(value)} (type: ${typeof value})`);
    console.log(`    🔍 Expected value: ${JSON.stringify(singleCondition.value)} (type: ${typeof singleCondition.value})`);

    const result = this.evaluateOperator(value, singleCondition.operator, singleCondition.value);
    console.log(`    🔍 Comparison result: ${result}`);

    return result;
  }

  /**
   * Evaluate a comparison operator
   */
  private evaluateOperator(
    sourceValue: any,
    operator: string,
    targetValue: any
  ): boolean {
    switch (operator) {
      case 'equals':
        // Handle boolean comparisons with type coercion
        if (typeof sourceValue === 'boolean' && typeof targetValue === 'string') {
          return sourceValue === (targetValue === 'true');
        }
        if (typeof sourceValue === 'string' && typeof targetValue === 'boolean') {
          return (sourceValue === 'true') === targetValue;
        }
        // Handle numeric string comparisons
        if (typeof sourceValue === 'number' && typeof targetValue === 'string') {
          return sourceValue === Number(targetValue);
        }
        if (typeof sourceValue === 'string' && typeof targetValue === 'number') {
          return Number(sourceValue) === targetValue;
        }
        return sourceValue === targetValue;

      case 'not_equals':
        // Handle boolean comparisons with type coercion
        if (typeof sourceValue === 'boolean' && typeof targetValue === 'string') {
          return sourceValue !== (targetValue === 'true');
        }
        if (typeof sourceValue === 'string' && typeof targetValue === 'boolean') {
          return (sourceValue === 'true') !== targetValue;
        }
        // Handle numeric string comparisons
        if (typeof sourceValue === 'number' && typeof targetValue === 'string') {
          return sourceValue !== Number(targetValue);
        }
        if (typeof sourceValue === 'string' && typeof targetValue === 'number') {
          return Number(sourceValue) !== targetValue;
        }
        return sourceValue !== targetValue;

      case 'contains':
        if (typeof sourceValue === 'string') {
          return sourceValue.includes(String(targetValue));
        }
        if (Array.isArray(sourceValue)) {
          return sourceValue.includes(targetValue);
        }
        return false;

      case 'not_contains':
        if (typeof sourceValue === 'string') {
          return !sourceValue.includes(String(targetValue));
        }
        if (Array.isArray(sourceValue)) {
          return !sourceValue.includes(targetValue);
        }
        return true;

      case 'greater_than':
        return Number(sourceValue) > Number(targetValue);

      case 'less_than':
        return Number(sourceValue) < Number(targetValue);

      case 'greater_or_equal':
        return Number(sourceValue) >= Number(targetValue);

      case 'less_or_equal':
        return Number(sourceValue) <= Number(targetValue);

      case 'exists':
        return sourceValue !== undefined && sourceValue !== null;

      case 'not_exists':
        return sourceValue === undefined || sourceValue === null;

      default:
        console.warn(`Unknown condition operator: ${operator}`);
        return false;
    }
  }

  /**
   * Build full URL for logging
   */
  private buildFullURL(module: string, endpoint: string, params?: Record<string, any>): string {
    const baseURL = this.moduleClients.getModuleURL(module as any);
    let url = baseURL + endpoint;

    // Replace path params
    if (params) {
      for (const [key, value] of Object.entries(params)) {
        url = url.replace(`:${key}`, String(value));
      }
    }

    return url;
  }
}
