/**
 * Response Builder
 *
 * Constructs typed response objects from AI-generated content.
 * Parses and validates responses according to defined schemas.
 */

import {
  ResponseType,
  ResponseContent,
  NPCDialogueResponse,
  SystemMessageResponse,
  NarrativeResponse,
  ErrorResponse,
  CombatResultResponse,
  QuestUpdateResponse,
  EnvironmentResponse,
  ItemInteractionResponse,
  XPRewardResponse,
  GatheredContext,
} from './types.js';

export class ResponseBuilder {
  /**
   * Parse AI response and build typed response object
   */
  public parseAIResponse(
    aiContent: string,
    responseType: ResponseType,
    context: GatheredContext
  ): ResponseContent {
    try {
      // Try to parse as JSON first (if AI returned structured data)
      const parsed = this.tryParseJSON(aiContent);

      switch (responseType) {
        case 'NPC_DIALOGUE':
          return this.buildNPCDialogue(parsed || aiContent, context);
        case 'SYSTEM_MESSAGE':
          return this.buildSystemMessage(parsed || aiContent);
        case 'NARRATIVE':
          return this.buildNarrative(parsed || aiContent);
        case 'COMBAT_RESULT':
          return this.buildCombatResult(parsed || aiContent);
        case 'QUEST_UPDATE':
          return this.buildQuestUpdate(parsed || aiContent);
        case 'ENVIRONMENT':
          return this.buildEnvironment(parsed || aiContent, context);
        case 'ITEM_INTERACTION':
          return this.buildItemInteraction(parsed || aiContent);
        case 'XP_REWARD':
          return this.buildXPReward(parsed || aiContent);
        case 'ERROR':
          return this.buildError(aiContent);
        default:
          // Fallback to narrative
          return this.buildNarrative(aiContent);
      }
    } catch (error) {
      console.error('Error parsing AI response:', error);
      // Return error response
      return this.buildError(
        `Failed to parse AI response: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * Build NPC Dialogue Response
   */
  private buildNPCDialogue(
    content: any,
    context: GatheredContext
  ): NPCDialogueResponse {
    if (typeof content === 'object' && content.dialogue) {
      // AI returned structured data
      return {
        type: 'NPC_DIALOGUE',
        npc: content.npc || this.extractNPCFromContext(context),
        dialogue: content.dialogue,
        emotion: content.emotion,
        actions: content.actions,
      };
    }

    // AI returned plain text - wrap it
    return {
      type: 'NPC_DIALOGUE',
      npc: this.extractNPCFromContext(context),
      dialogue: String(content),
      emotion: 'neutral',
    };
  }

  /**
   * Build System Message Response
   */
  private buildSystemMessage(content: any): SystemMessageResponse {
    if (typeof content === 'object' && content.message) {
      return {
        type: 'SYSTEM_MESSAGE',
        message: content.message,
        severity: content.severity || 'info',
        icon: content.icon,
      };
    }

    return {
      type: 'SYSTEM_MESSAGE',
      message: String(content),
      severity: 'info',
    };
  }

  /**
   * Build Narrative Response
   */
  private buildNarrative(content: any): NarrativeResponse {
    if (typeof content === 'object' && content.text) {
      return {
        type: 'NARRATIVE',
        text: content.text,
        mood: content.mood,
      };
    }

    return {
      type: 'NARRATIVE',
      text: String(content),
    };
  }

  /**
   * Build Error Response
   */
  private buildError(content: any): ErrorResponse {
    if (typeof content === 'object' && content.error) {
      return {
        type: 'ERROR',
        error: content.error,
        details: content.details,
      };
    }

    return {
      type: 'ERROR',
      error: String(content),
    };
  }

  /**
   * Build Combat Result Response
   */
  private buildCombatResult(content: any): CombatResultResponse {
    if (typeof content === 'object') {
      return {
        type: 'COMBAT_RESULT',
        attacker: content.attacker || 'Unknown',
        defender: content.defender || 'Unknown',
        action: content.action || 'attacks',
        damage: content.damage,
        outcome: content.outcome || 'hit',
        description: content.description || String(content),
        status_effects: content.status_effects,
      };
    }

    // Parse plain text combat description
    return {
      type: 'COMBAT_RESULT',
      attacker: 'Character',
      defender: 'Enemy',
      action: 'attacks',
      outcome: 'hit',
      description: String(content),
    };
  }

  /**
   * Build Quest Update Response
   */
  private buildQuestUpdate(content: any): QuestUpdateResponse {
    if (typeof content === 'object') {
      return {
        type: 'QUEST_UPDATE',
        quest_name: content.quest_name || 'Quest',
        status: content.status || 'updated',
        description: content.description || String(content),
        rewards: content.rewards,
      };
    }

    return {
      type: 'QUEST_UPDATE',
      quest_name: 'Quest',
      status: 'updated',
      description: String(content),
    };
  }

  /**
   * Build Environment Description Response
   */
  private buildEnvironment(
    content: any,
    context: GatheredContext
  ): EnvironmentResponse {
    const location = context.scene?.name || 'Unknown Location';

    if (typeof content === 'object') {
      return {
        type: 'ENVIRONMENT',
        location: content.location || location,
        description: content.description || String(content),
        atmosphere: content.atmosphere,
        exits: content.exits,
        entities_present: content.entities_present,
      };
    }

    return {
      type: 'ENVIRONMENT',
      location,
      description: String(content),
    };
  }

  /**
   * Build Item Interaction Response
   */
  private buildItemInteraction(content: any): ItemInteractionResponse {
    if (typeof content === 'object') {
      return {
        type: 'ITEM_INTERACTION',
        item_name: content.item_name || 'Item',
        action: content.action || 'use',
        description: content.description || String(content),
        result: content.result,
      };
    }

    return {
      type: 'ITEM_INTERACTION',
      item_name: 'Item',
      action: 'use',
      description: String(content),
    };
  }

  /**
   * Build XP Reward Response
   */
  private buildXPReward(content: any): XPRewardResponse {
    if (typeof content === 'object') {
      return {
        type: 'XP_REWARD',
        amount: content.amount || 0,
        reason: content.reason || 'Unknown',
        new_level: content.new_level,
        message: content.message || `You gained ${content.amount || 0} XP!`,
      };
    }

    return {
      type: 'XP_REWARD',
      amount: 0,
      reason: 'Action completed',
      message: String(content),
    };
  }

  /**
   * Extract NPC information from context
   */
  private extractNPCFromContext(context: GatheredContext): {
    id?: number;
    name: string;
    role?: string;
  } {
    if (context.npcs && context.npcs.length > 0) {
      const npc = context.npcs[0]; // Use first NPC
      return {
        id: npc.id,
        name: npc.name,
        role: npc.role,
      };
    }

    return {
      name: 'NPC',
      role: 'character',
    };
  }

  /**
   * Try to parse string as JSON, return null if fails
   */
  private tryParseJSON(content: string): any | null {
    try {
      // Check if content looks like JSON
      const trimmed = content.trim();
      if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
        return JSON.parse(trimmed);
      }
    } catch {
      // Not JSON, that's fine
    }
    return null;
  }

  /**
   * Validate response content matches schema
   */
  public validateResponse(response: ResponseContent): boolean {
    try {
      // Basic validation - check that required fields exist
      if (!response.type) return false;

      switch (response.type) {
        case 'NPC_DIALOGUE':
          return !!(response as NPCDialogueResponse).dialogue;
        case 'SYSTEM_MESSAGE':
          return !!(response as SystemMessageResponse).message;
        case 'NARRATIVE':
          return !!(response as NarrativeResponse).text;
        case 'ERROR':
          return !!(response as ErrorResponse).error;
        case 'COMBAT_RESULT':
          return !!(response as CombatResultResponse).description;
        case 'QUEST_UPDATE':
          return !!(response as QuestUpdateResponse).quest_name;
        case 'ENVIRONMENT':
          return !!(response as EnvironmentResponse).description;
        case 'ITEM_INTERACTION':
          return !!(response as ItemInteractionResponse).description;
        case 'XP_REWARD':
          return !!(response as XPRewardResponse).message;
        default:
          return false;
      }
    } catch {
      return false;
    }
  }
}
