import { MySQLStorage } from './mysql-storage.js';
import { ExecutionEngine } from './execution-engine.js';
import {
  ChainConfiguration,
  CreateChainRequest,
  UpdateChainRequest,
  ExecutionContext,
  ExecutionResult,
  ChainConfigurationSchema,
  Statistics,
  ModuleMetadata,
  ModuleType,
} from './types.js';

export class ChainManager {
  constructor(
    private storage: MySQLStorage,
    private executionEngine: ExecutionEngine
  ) {
    console.log('🎮 ChainManager initialized');
  }

  // ==========================================================================
  // Chain Configuration Operations
  // ==========================================================================

  async createChain(request: CreateChainRequest): Promise<ChainConfiguration> {
    // Validate the chain configuration
    const chain = ChainConfigurationSchema.parse({
      user_id: request.user_id,
      name: request.name,
      description: request.description,
      steps: request.steps,
      meta_data: request.meta_data,
    });

    // Save to database
    return await this.storage.createChain(chain);
  }

  async getChain(id: number, userId?: string): Promise<ChainConfiguration> {
    const chain = await this.storage.getChain(id);

    // Check ownership if userId provided
    if (userId && chain.user_id !== userId) {
      throw new Error('Unauthorized: You do not own this chain');
    }

    // Validate and normalize the chain through the schema
    // This ensures defaults are applied and structure is correct
    return ChainConfigurationSchema.parse(chain);
  }

  async getUserChains(userId: string): Promise<ChainConfiguration[]> {
    const chains = await this.storage.getChainsByUser(userId);
    // Validate each chain to ensure correct structure
    return chains.map(chain => ChainConfigurationSchema.parse(chain));
  }

  async getAllChains(): Promise<ChainConfiguration[]> {
    const chains = await this.storage.getAllChains();
    // Validate each chain to ensure correct structure
    return chains.map(chain => ChainConfigurationSchema.parse(chain));
  }

  async updateChain(
    id: number,
    updates: UpdateChainRequest,
    userId?: string
  ): Promise<ChainConfiguration> {
    // Check ownership
    if (userId) {
      const owner = await this.storage.getChainOwner(id);
      if (owner !== userId) {
        throw new Error('Unauthorized: You do not own this chain');
      }
    }

    return await this.storage.updateChain(id, updates);
  }

  async deleteChain(id: number, userId?: string): Promise<void> {
    // Check ownership
    if (userId) {
      const owner = await this.storage.getChainOwner(id);
      if (owner !== userId) {
        throw new Error('Unauthorized: You do not own this chain');
      }
    }

    await this.storage.deleteChain(id);
  }

  // ==========================================================================
  // Chain Execution
  // ==========================================================================

  async executeChain(
    chainId: number,
    input: Record<string, any>,
    userId: string,
    env?: Record<string, string>
  ): Promise<ExecutionResult> {
    // Get the chain
    const chain = await this.getChain(chainId, userId);

    // Create execution context
    const context: ExecutionContext = {
      user_id: userId,
      chain_id: chainId,
      input,
      env,
    };

    // Execute the chain
    const result = await this.executionEngine.execute(chain, context);

    // Save execution history
    await this.storage.saveExecution(result);

    return result;
  }

  async executeAdHocChain(
    name: string,
    steps: any[],
    input: Record<string, any>,
    userId: string,
    outputTemplate?: Record<string, any>,
    env?: Record<string, string>
  ): Promise<ExecutionResult> {
    // Create temporary chain configuration
    const chain: ChainConfiguration = {
      user_id: userId,
      name: name || 'Ad-hoc Chain',
      steps: steps,
      output_template: outputTemplate,
    };

    // Validate
    ChainConfigurationSchema.parse(chain);

    // Create execution context
    const context: ExecutionContext = {
      user_id: userId,
      input,
      env,
    };

    // Execute the chain
    const result = await this.executionEngine.execute(chain, context);

    // Save execution history (without chain_id)
    await this.storage.saveExecution(result);

    return result;
  }

  // ==========================================================================
  // Execution History
  // ==========================================================================

  async getExecution(id: number, userId?: string): Promise<ExecutionResult> {
    const execution = await this.storage.getExecution(id);

    // Check ownership if userId provided
    if (userId && execution.user_id !== userId) {
      throw new Error('Unauthorized: You do not own this execution');
    }

    return execution;
  }

  async getUserExecutions(
    userId: string,
    limit: number = 100
  ): Promise<ExecutionResult[]> {
    return await this.storage.getExecutionsByUser(userId, limit);
  }

  async getChainExecutions(
    chainId: number,
    limit: number = 100
  ): Promise<ExecutionResult[]> {
    return await this.storage.getExecutionsByChain(chainId, limit);
  }

  // ==========================================================================
  // Statistics
  // ==========================================================================

  async getStatistics(): Promise<Statistics> {
    return await this.storage.getStatistics();
  }

  // ==========================================================================
  // Module Metadata
  // ==========================================================================

  getModules(): ModuleMetadata[] {
    return [
      {
        name: 'Intent Interpreter',
        type: 'intent',
        url: process.env.INTENT_INTERPRETER_URL || 'http://localhost:3032',
        port: 3032,
        description: 'AI-powered intent classification and natural language understanding',
        endpoints: [
          {
            path: '/interpret',
            method: 'POST',
            description: 'Classify user message intent with AI (Grok 2)',
            body: [
              {
                name: 'message',
                type: 'string',
                required: true,
                description: 'User message to interpret (e.g., "I attack the goblin")',
              },
            ],
            response: {
              description: 'Intent classification with confidence scores and entities',
              example: {
                success: true,
                result: {
                  primaryIntent: { type: 'combat', confidence: 0.95 },
                  allIntents: [{ type: 'combat', confidence: 0.95 }],
                  entities: { action: 'attack', target: 'goblin' },
                },
              },
            },
          },
          {
            path: '/interpret/batch',
            method: 'POST',
            description: 'Classify multiple messages in batch',
            body: [
              {
                name: 'messages',
                type: 'array',
                required: true,
                description: 'Array of messages to interpret',
              },
            ],
          },
        ],
      },
      {
        name: 'Character Controller',
        type: 'character',
        url: process.env.CHARACTER_CONTROLLER_URL || 'http://localhost:3031',
        port: 3031,
        description: 'D&D 5e character sheet management with location integration',
        endpoints: [
          {
            path: '/process',
            method: 'POST',
            description: 'Process character input with AI (Claude 3.5 Sonnet) and get context',
            body: [
              {
                name: 'user_id',
                type: 'string',
                required: true,
                description: 'User ID owning the character',
              },
              {
                name: 'user_character',
                type: 'string',
                required: true,
                description: 'Character name to process',
              },
              {
                name: 'input',
                type: 'string',
                required: true,
                description: 'User input or command for the character',
              },
              {
                name: 'meta_data',
                type: 'object',
                required: false,
                description: 'Additional metadata (e.g., intent data from IntentInterpreter)',
              },
            ],
            response: {
              description: 'Character context with location data automatically included',
              example: {
                success: true,
                characterUpdated: 'Thorin',
                context: { name: 'Thorin', location: { position: {}, nearby_locations: [] } },
              },
            },
          },
          {
            path: '/character/:userId/:name',
            method: 'GET',
            description: 'Get complete character sheet by user and name',
            params: [
              {
                name: 'userId',
                type: 'string',
                required: true,
                description: 'User ID owning the character',
              },
              {
                name: 'name',
                type: 'string',
                required: true,
                description: 'Character name',
              },
            ],
          },
          {
            path: '/characters/:userId',
            method: 'GET',
            description: 'Get all characters for a user',
            params: [
              {
                name: 'userId',
                type: 'string',
                required: true,
                description: 'User ID',
              },
            ],
          },
          {
            path: '/check-name/:name',
            method: 'GET',
            description: 'Check if character name is available (globally unique)',
            params: [
              {
                name: 'name',
                type: 'string',
                required: true,
                description: 'Character name to check',
              },
              {
                name: 'userId',
                type: 'string',
                required: false,
                description: 'User ID (query param)',
              },
            ],
          },
          {
            path: '/character/:userId/:name',
            method: 'DELETE',
            description: 'Delete a character',
            params: [
              {
                name: 'userId',
                type: 'string',
                required: true,
                description: 'User ID',
              },
              {
                name: 'name',
                type: 'string',
                required: true,
                description: 'Character name',
              },
            ],
          },
        ],
      },
      {
        name: 'Scene Controller',
        type: 'scene',
        url: process.env.SCENE_CONTROLLER_URL || 'http://localhost:3033',
        port: 3033,
        description: 'Location and scene management with X/Y coordinate grid system',
        endpoints: [
          {
            path: '/position/:entityId',
            method: 'GET',
            description: 'Get current position of an entity on the grid',
            params: [
              {
                name: 'entityId',
                type: 'string',
                required: true,
                description: 'Entity ID (e.g., char_thorin)',
              },
              {
                name: 'type',
                type: 'string',
                required: false,
                description: 'Entity type: player_character, npc, monster, item',
              },
            ],
          },
          {
            path: '/nearby',
            method: 'GET',
            description: 'Find nearby locations, POIs, or entities within radius',
            params: [
              {
                name: 'x',
                type: 'number',
                required: true,
                description: 'X coordinate center point',
              },
              {
                name: 'y',
                type: 'number',
                required: true,
                description: 'Y coordinate center point',
              },
              {
                name: 'radius',
                type: 'number',
                required: true,
                description: 'Search radius in units',
              },
              {
                name: 'type',
                type: 'string',
                required: true,
                description: 'Type to search: location, poi, or entity',
              },
            ],
          },
          {
            path: '/move',
            method: 'POST',
            description: 'Move an entity to new coordinates',
            body: [
              {
                name: 'entity_id',
                type: 'string',
                required: true,
                description: 'Entity ID to move',
              },
              {
                name: 'entity_type',
                type: 'string',
                required: true,
                description: 'Entity type: player_character, npc, monster',
              },
              {
                name: 'x',
                type: 'number',
                required: true,
                description: 'Target X coordinate',
              },
              {
                name: 'y',
                type: 'number',
                required: true,
                description: 'Target Y coordinate',
              },
              {
                name: 'movement_type',
                type: 'string',
                required: false,
                description: 'Movement type: walk, run, teleport, fly, swim',
              },
            ],
          },
          {
            path: '/location/:locationId',
            method: 'GET',
            description: 'Get location details by ID',
            params: [
              {
                name: 'locationId',
                type: 'number',
                required: true,
                description: 'Location ID',
              },
            ],
          },
          {
            path: '/location',
            method: 'POST',
            description: 'Create a new location',
            body: [
              {
                name: 'name',
                type: 'string',
                required: true,
                description: 'Location name',
              },
              {
                name: 'x_coord',
                type: 'number',
                required: true,
                description: 'X coordinate',
              },
              {
                name: 'y_coord',
                type: 'number',
                required: true,
                description: 'Y coordinate',
              },
              {
                name: 'location_type',
                type: 'string',
                required: false,
                description: 'Type: building, terrain, dungeon, etc',
              },
            ],
          },
        ],
      },
      {
        name: 'Item Controller',
        type: 'item',
        url: process.env.ITEM_CONTROLLER_URL || 'http://localhost:3034',
        port: 3034,
        description: 'Item and inventory management with container/nested item support',
        endpoints: [
          {
            path: '/item',
            method: 'POST',
            description: 'Create a new item',
            body: [
              {
                name: 'name',
                type: 'string',
                required: true,
                description: 'Item name',
              },
              {
                name: 'meta_data',
                type: 'object',
                required: false,
                description: 'Item properties (description, weight, value, damage, etc)',
              },
            ],
          },
          {
            path: '/item/:id',
            method: 'GET',
            description: 'Get item details by ID',
            params: [
              {
                name: 'id',
                type: 'number',
                required: true,
                description: 'Item ID',
              },
            ],
          },
          {
            path: '/item/:id',
            method: 'PATCH',
            description: 'Update an item',
            params: [
              {
                name: 'id',
                type: 'number',
                required: true,
                description: 'Item ID',
              },
            ],
            body: [
              {
                name: 'name',
                type: 'string',
                required: false,
                description: 'New item name',
              },
              {
                name: 'meta_data',
                type: 'object',
                required: false,
                description: 'Updated metadata',
              },
            ],
          },
          {
            path: '/item/:id',
            method: 'DELETE',
            description: 'Delete an item',
            params: [
              {
                name: 'id',
                type: 'number',
                required: true,
                description: 'Item ID',
              },
            ],
          },
          {
            path: '/items/search',
            method: 'GET',
            description: 'Search items by name',
            params: [
              {
                name: 'name',
                type: 'string',
                required: true,
                description: 'Item name to search',
              },
            ],
          },
          {
            path: '/item/:itemId/add-to-container',
            method: 'POST',
            description: 'Add item to a container (bag, chest, etc)',
            params: [
              {
                name: 'itemId',
                type: 'number',
                required: true,
                description: 'Item ID to add',
              },
            ],
            body: [
              {
                name: 'container_id',
                type: 'number',
                required: true,
                description: 'Container item ID',
              },
            ],
          },
          {
            path: '/item/:containerId/contents',
            method: 'GET',
            description: 'Get all items in a container (recursive)',
            params: [
              {
                name: 'containerId',
                type: 'number',
                required: true,
                description: 'Container item ID',
              },
              {
                name: 'recursive',
                type: 'boolean',
                required: false,
                description: 'Include nested containers (default: false)',
              },
            ],
          },
          {
            path: '/item/:itemId/weight',
            method: 'GET',
            description: 'Calculate total weight including contents',
            params: [
              {
                name: 'itemId',
                type: 'number',
                required: true,
                description: 'Item ID',
              },
            ],
          },
        ],
      },
      {
        name: 'StoryTeller',
        type: 'storyteller',
        url: process.env.STORYTELLER_URL || 'http://localhost:3037',
        port: 3037,
        description: 'AI-powered narrative generation with contextual storytelling',
        endpoints: [
          {
            path: '/generate',
            method: 'POST',
            description: 'Generate a contextual narrative response using AI',
            body: [
              {
                name: 'user_id',
                type: 'string',
                required: true,
                description: 'User ID',
              },
              {
                name: 'player_input',
                type: 'string',
                required: true,
                description: 'Player input or action description',
              },
              {
                name: 'character_id',
                type: 'number',
                required: false,
                description: 'Character ID for context (legacy - prefer character_name)',
              },
              {
                name: 'character_name',
                type: 'string',
                required: false,
                description: 'Character name for context (use with user_id)',
              },
              {
                name: 'character_context',
                type: 'object',
                required: false,
                description: 'Pre-fetched character data from chains (e.g., {{step_1.context}})',
              },
              {
                name: 'scene_id',
                type: 'number',
                required: false,
                description: 'Scene ID for context (legacy)',
              },
              {
                name: 'location_id',
                type: 'number',
                required: false,
                description: 'Location ID for context from SceneController',
              },
              {
                name: 'location_name',
                type: 'string',
                required: false,
                description: 'Location name for context',
              },
              {
                name: 'scene_context',
                type: 'object',
                required: false,
                description: 'Pre-fetched scene data from chains (e.g., {{step_2.result}})',
              },
              {
                name: 'intent_type',
                type: 'string',
                required: false,
                description: 'Intent type from IntentInterpreter (e.g., {{step_1.result.primaryIntent.type}})',
              },
              {
                name: 'intent_data',
                type: 'object',
                required: false,
                description: 'Full intent result from IntentInterpreter (e.g., {{step_1.result}})',
              },
              {
                name: 'response_type_hint',
                type: 'string',
                required: false,
                description: 'Suggested response type (NPC_DIALOGUE, NARRATIVE, COMBAT_RESULT, etc)',
              },
              {
                name: 'game_events',
                type: 'array',
                required: false,
                description: 'Array of game events for additional context',
              },
              {
                name: 'options',
                type: 'object',
                required: false,
                description: 'AI generation options (temperature, max_tokens, use_cache)',
              },
            ],
            response: {
              description: 'Structured narrative response with type and metadata',
              example: {
                success: true,
                data: {
                  interaction_id: 1523,
                  response_type: 'NPC_DIALOGUE',
                  response: {
                    type: 'NPC_DIALOGUE',
                    npc: { id: 42, name: 'Gareth', role: 'barkeep' },
                    dialogue: 'Welcome, traveler!',
                    emotion: 'friendly',
                  },
                  context_used: {},
                  metadata: {},
                },
              },
            },
          },
          {
            path: '/interactions/:user_id',
            method: 'GET',
            description: 'Get interaction history for a user',
            params: [
              {
                name: 'user_id',
                type: 'string',
                required: true,
                description: 'User ID',
              },
              {
                name: 'limit',
                type: 'number',
                required: false,
                description: 'Number of interactions to retrieve (default: 50)',
              },
              {
                name: 'character_id',
                type: 'number',
                required: false,
                description: 'Filter by character ID',
              },
              {
                name: 'response_type',
                type: 'string',
                required: false,
                description: 'Filter by response type',
              },
            ],
          },
          {
            path: '/templates',
            method: 'GET',
            description: 'List all story templates',
          },
          {
            path: '/templates/:name',
            method: 'GET',
            description: 'Get specific template by name',
            params: [
              {
                name: 'name',
                type: 'string',
                required: true,
                description: 'Template name',
              },
            ],
          },
          {
            path: '/templates',
            method: 'POST',
            description: 'Create or update a story template',
            body: [
              {
                name: 'name',
                type: 'string',
                required: true,
                description: 'Template name',
              },
              {
                name: 'content',
                type: 'string',
                required: true,
                description: 'Template content',
              },
              {
                name: 'variables',
                type: 'array',
                required: false,
                description: 'Template variables',
              },
            ],
          },
          {
            path: '/templates/:id',
            method: 'DELETE',
            description: 'Delete a template',
            params: [
              {
                name: 'id',
                type: 'number',
                required: true,
                description: 'Template ID',
              },
            ],
          },
          {
            path: '/cache/clear',
            method: 'POST',
            description: 'Clear response cache (all=true query param for full clear)',
          },
        ],
      },
    ];
  }

  getModule(type: ModuleType): ModuleMetadata | undefined {
    return this.getModules().find((m) => m.type === type);
  }
}
