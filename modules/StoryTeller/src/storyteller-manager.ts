/**
 * StoryTeller Manager
 *
 * Core business logic for narrative generation.
 * Orchestrates context gathering, AI generation, response building, and storage.
 */

import { AIClient } from './ai-client.js';
import { ContextGatherer } from './context-gatherer.js';
import { ResponseBuilder } from './response-builder.js';
import { MySQLStorage } from './mysql-storage.js';
import {
  GenerateNarrativeRequest,
  GenerateNarrativeResponse,
  ResponseType,
  StoryTemplate,
  NarrativeInteraction,
} from './types.js';

export class StoryTellerManager {
  private aiClient: AIClient;
  private contextGatherer: ContextGatherer;
  private responseBuilder: ResponseBuilder;
  private storage: MySQLStorage;
  private enableCache: boolean;
  private cacheTTL: number;

  constructor(storage: MySQLStorage) {
    this.storage = storage;
    this.aiClient = new AIClient();
    this.contextGatherer = new ContextGatherer(storage);
    this.responseBuilder = new ResponseBuilder();
    this.enableCache = process.env.ENABLE_RESPONSE_CACHE === 'true';
    this.cacheTTL = parseInt(process.env.CACHE_TTL_SECONDS || '3600');

    console.log('📖 StoryTeller Manager initialized');
    console.log(`   AI Client configured: ${this.aiClient.isConfigured()}`);
    console.log(`   Response caching: ${this.enableCache ? 'enabled' : 'disabled'}`);
  }

  /**
   * Main method: Generate narrative response
   */
  public async generateNarrative(
    request: GenerateNarrativeRequest
  ): Promise<GenerateNarrativeResponse> {
    const startTime = Date.now();

    try {
      // Check if AI is configured
      if (!this.aiClient.isConfigured()) {
        return {
          success: false,
          error: 'AI client not configured. Please set OPENROUTER_API_KEY.',
        };
      }

      const {
        user_id,
        character_id,
        character_name,
        scene_id,
        location_id,
        player_input,
        intent_type,
        character_context,
        scene_context,
        game_events,
        response_type_hint,
        options,
      } = request;

      // 1. Check cache if enabled
      if (this.enableCache && options?.use_cache !== false) {
        const cacheKey = this.storage.generateCacheKey(
          player_input,
          character_id,
          scene_id
        );
        const cached = await this.storage.getCachedResponse(cacheKey);

        if (cached) {
          console.log('✅ Cache hit for narrative generation');
          const processingTime = Date.now() - startTime;

          return {
            success: true,
            data: {
              interaction_id: 0, // Not a new interaction
              response_type: cached.response_type as ResponseType,
              response: cached.response_content,
              context_used: {},
              metadata: {
                ai_model: 'cached',
                tokens_used: 0,
                processing_time_ms: processingTime,
                cached: true,
              },
            },
          };
        }
      }

      // 2. Gather context from other modules
      console.log('🔍 Gathering context...');
      const context = await this.contextGatherer.gatherContext({
        user_id,
        character_id,
        character_name,
        character_context,
        scene_id,
        location_id,
        location_name: request.location_name,
        scene_context,
      });

      // 3. Determine response type
      const responseType = response_type_hint || this.inferResponseType(intent_type, game_events);

      // 4. Get appropriate template
      const template = await this.getTemplate(responseType, options?.template_name);

      if (!template) {
        throw new Error(`No template found for response type: ${responseType}`);
      }

      // 5. Build prompts
      const { systemPrompt, userPrompt } = this.buildPrompts(
        template,
        player_input,
        context,
        game_events
      );

      // 6. Generate AI response
      console.log('🤖 Generating AI response...');
      const aiResult = await this.aiClient.generateWithRetry({
        systemPrompt,
        userPrompt,
        temperature: options?.temperature ?? template.temperature,
        maxTokens: options?.max_tokens ?? template.max_tokens,
      });

      // 7. Parse and build typed response
      const responseContent = this.responseBuilder.parseAIResponse(
        aiResult.content,
        responseType,
        context
      );

      // 8. Validate response
      if (!this.responseBuilder.validateResponse(responseContent)) {
        console.warn('⚠️  Generated response failed validation');
      }

      // 9. Save interaction to database
      const processingTime = Date.now() - startTime;

      const interaction: NarrativeInteraction = {
        user_id,
        character_id,
        scene_id,
        intent_type,
        player_input,
        game_events,
        character_context: context.character,
        scene_context: context.scene,
        npc_context: context.npcs,
        ai_model: aiResult.model,
        ai_prompt: userPrompt,
        ai_tokens_used: aiResult.tokens_used,
        response_type: responseType,
        response_content: responseContent,
        processing_time_ms: processingTime,
      };

      const interactionId = await this.storage.saveInteraction(interaction);

      // 10. Cache the response if enabled
      if (this.enableCache) {
        const cacheKey = this.storage.generateCacheKey(player_input, character_id, scene_id);
        await this.storage.cacheResponse(
          cacheKey,
          responseType,
          responseContent,
          this.cacheTTL
        );
      }

      // 11. Return success response
      return {
        success: true,
        data: {
          interaction_id: interactionId,
          response_type: responseType,
          response: responseContent,
          context_used: {
            character_name: context.character?.name,
            location: context.scene?.name,
            npcs_present: context.npcs?.map((npc) => npc.name),
          },
          metadata: {
            ai_model: aiResult.model,
            tokens_used: aiResult.tokens_used,
            processing_time_ms: processingTime,
            cached: false,
          },
        },
      };
    } catch (error) {
      console.error('❌ Narrative generation failed:', error);

      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        message: 'Failed to generate narrative response',
      };
    }
  }

  /**
   * Infer response type from intent and game events
   */
  private inferResponseType(
    intent_type?: string,
    game_events?: any[]
  ): ResponseType {
    // Map common intent types to response types
    if (intent_type) {
      const intentLower = intent_type.toLowerCase();

      if (intentLower.includes('npc') || intentLower.includes('talk') || intentLower.includes('speak')) {
        return 'NPC_DIALOGUE';
      }
      if (intentLower.includes('attack') || intentLower.includes('combat') || intentLower.includes('fight')) {
        return 'COMBAT_RESULT';
      }
      if (intentLower.includes('quest')) {
        return 'QUEST_UPDATE';
      }
      if (intentLower.includes('item') || intentLower.includes('pickup') || intentLower.includes('use')) {
        return 'ITEM_INTERACTION';
      }
      if (intentLower.includes('look') || intentLower.includes('examine') || intentLower.includes('enter')) {
        return 'ENVIRONMENT';
      }
    }

    // Check game events
    if (game_events && game_events.length > 0) {
      const lastEvent = game_events[game_events.length - 1];
      const eventType = lastEvent.type?.toLowerCase();

      if (eventType?.includes('combat')) return 'COMBAT_RESULT';
      if (eventType?.includes('quest')) return 'QUEST_UPDATE';
      if (eventType?.includes('xp') || eventType?.includes('level')) return 'XP_REWARD';
      if (eventType?.includes('error')) return 'ERROR';
    }

    // Default to narrative
    return 'NARRATIVE';
  }

  /**
   * Get template for response type
   */
  private async getTemplate(
    responseType: ResponseType,
    templateName?: string
  ): Promise<StoryTemplate | null> {
    if (templateName) {
      return await this.storage.getTemplate(templateName);
    }

    // Get default template for response type
    const defaultTemplateName = `${responseType.toLowerCase()}_default`;
    let template = await this.storage.getTemplate(defaultTemplateName);

    // Fallback to any template of this type
    if (!template) {
      template = await this.storage.getTemplateByType(responseType);
    }

    return template;
  }

  /**
   * Build system and user prompts from template
   */
  private buildPrompts(
    template: StoryTemplate,
    player_input: string,
    context: any,
    game_events?: any[]
  ): { systemPrompt: string; userPrompt: string } {
    const systemPrompt = template.system_prompt;

    // Replace placeholders in user prompt template
    let userPrompt = template.user_prompt_template;

    // Build context summary
    const contextSummary = this.contextGatherer.buildContextSummary(context);
    const recentHistory = this.contextGatherer.getRecentInteractionsText(context, 3);

    // Common replacements
    const replacements: Record<string, string> = {
      '{{player_input}}': player_input,
      '{{context}}': contextSummary,
      '{{history}}': recentHistory,
      '{{character_name}}': context.character?.name || 'Player',
      '{{location}}': context.scene?.name || 'Unknown',
      '{{scene_description}}': context.scene?.description || '',
      '{{npc_name}}': context.npcs?.[0]?.name || 'NPC',
      '{{npc_role}}': context.npcs?.[0]?.role || 'character',
    };

    // Add game events if present
    if (game_events && game_events.length > 0) {
      const eventsText = game_events.map((e) => `${e.type}: ${JSON.stringify(e.data)}`).join('\n');
      replacements['{{events}}'] = eventsText;
      replacements['{{event_type}}'] = game_events[game_events.length - 1].type;
    }

    // Replace all placeholders
    for (const [placeholder, value] of Object.entries(replacements)) {
      userPrompt = userPrompt.replace(new RegExp(placeholder, 'g'), value);
    }

    return { systemPrompt, userPrompt };
  }

  // ==========================================================================
  // Template Management
  // ==========================================================================

  /**
   * Get all templates
   */
  public async getAllTemplates(): Promise<StoryTemplate[]> {
    return await this.storage.getAllTemplates();
  }

  /**
   * Get template by name
   */
  public async getTemplateByName(name: string): Promise<StoryTemplate | null> {
    return await this.storage.getTemplate(name);
  }

  /**
   * Create or update template
   */
  public async saveTemplate(template: StoryTemplate): Promise<number> {
    return await this.storage.saveTemplate(template);
  }

  /**
   * Delete template
   */
  public async deleteTemplate(id: number): Promise<void> {
    return await this.storage.deleteTemplate(id);
  }

  // ==========================================================================
  // Interaction History
  // ==========================================================================

  /**
   * Get interaction history for a user
   */
  public async getInteractionHistory(
    user_id: string,
    options?: {
      limit?: number;
      character_id?: number;
      response_type?: ResponseType;
    }
  ): Promise<NarrativeInteraction[]> {
    return await this.storage.getInteractionHistory(
      user_id,
      options?.limit || 50,
      options?.character_id,
      options?.response_type
    );
  }

  /**
   * Get specific interaction
   */
  public async getInteraction(id: number): Promise<NarrativeInteraction | null> {
    return await this.storage.getInteraction(id);
  }

  // ==========================================================================
  // Cache Management
  // ==========================================================================

  /**
   * Clear expired cache entries
   */
  public async clearExpiredCache(): Promise<number> {
    return await this.storage.clearExpiredCache();
  }

  /**
   * Clear all cache
   */
  public async clearAllCache(): Promise<number> {
    return await this.storage.clearAllCache();
  }

  // ==========================================================================
  // Health Check
  // ==========================================================================

  /**
   * Check if all components are healthy
   */
  public async healthCheck(): Promise<{
    healthy: boolean;
    components: {
      database: boolean;
      ai_client: boolean;
    };
  }> {
    const dbHealthy = await this.storage.testConnection();
    const aiConfigured = this.aiClient.isConfigured();

    return {
      healthy: dbHealthy && aiConfigured,
      components: {
        database: dbHealthy,
        ai_client: aiConfigured,
      },
    };
  }
}
