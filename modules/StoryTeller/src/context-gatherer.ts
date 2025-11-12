/**
 * Context Gatherer
 *
 * Fetches contextual information from other modules (CharacterController, SceneController, etc.)
 * to provide rich context for AI narrative generation.
 */

import axios, { AxiosError } from 'axios';
import { GatheredContext, CharacterContext, SceneContext, NPCContext } from './types.js';
import { MySQLStorage } from './mysql-storage.js';

export class ContextGatherer {
  private characterControllerURL: string;
  private sceneControllerURL: string;
  private storage: MySQLStorage;
  private maxHistoryItems: number;

  constructor(storage: MySQLStorage) {
    this.characterControllerURL =
      process.env.CHARACTER_CONTROLLER_URL || 'http://localhost:3031';
    this.sceneControllerURL = process.env.SCENE_CONTROLLER_URL || 'http://localhost:3032';
    this.storage = storage;
    this.maxHistoryItems = parseInt(process.env.MAX_CONTEXT_HISTORY || '10');
  }

  /**
   * Gather all available context for narrative generation
   */
  public async gatherContext(params: {
    user_id: string;
    character_id?: number;
    character_name?: string;
    character_context?: any;
    scene_id?: number;
    location_id?: number;
    location_name?: string;
    scene_context?: any;
  }): Promise<GatheredContext> {
    const {
      user_id,
      character_id,
      character_name,
      character_context: preloadedCharacter,
      scene_id,
      location_id,
      scene_context: preloadedScene
    } = params;

    const context: GatheredContext = {};

    // Gather context in parallel for performance
    const promises: Promise<void>[] = [];

    // Use preloaded character context if provided (from chain)
    if (preloadedCharacter) {
      context.character = this.normalizeCharacterContext(preloadedCharacter);
    }
    // Fetch character context by name (most common in ecosystem)
    else if (character_name) {
      promises.push(
        this.fetchCharacterByName(user_id, character_name)
          .then((char) => {
            context.character = char;
          })
          .catch((error) => {
            console.warn(`Failed to fetch character ${character_name}:`, error.message);
          })
      );
    }
    // Fetch character context by ID (legacy support)
    else if (character_id) {
      promises.push(
        this.fetchCharacterContext(character_id)
          .then((char) => {
            context.character = char;
          })
          .catch((error) => {
            console.warn(`Failed to fetch character ${character_id}:`, error.message);
          })
      );
    }

    // Use preloaded scene context if provided (from chain)
    if (preloadedScene) {
      context.scene = this.normalizeSceneContext(preloadedScene);
    }
    // Fetch scene context by location_id (SceneController pattern)
    else if (location_id) {
      promises.push(
        this.fetchSceneByLocationId(location_id)
          .then((scene) => {
            context.scene = scene;
          })
          .catch((error) => {
            console.warn(`Failed to fetch location ${location_id}:`, error.message);
          })
      );
    }
    // Fetch scene context by ID (legacy support)
    else if (scene_id) {
      promises.push(
        this.fetchSceneContext(scene_id)
          .then((scene) => {
            context.scene = scene;
          })
          .catch((error) => {
            console.warn(`Failed to fetch scene ${scene_id}:`, error.message);
          })
      );
    }

    // Fetch recent interaction history
    promises.push(
      this.fetchRecentInteractions(user_id, character_id)
        .then((interactions) => {
          context.recent_interactions = interactions;
        })
        .catch((error) => {
          console.warn('Failed to fetch recent interactions:', error.message);
        })
    );

    // Wait for all context gathering to complete
    await Promise.all(promises);

    // Extract NPCs from scene context if available
    if (context.scene?.entities) {
      context.npcs = this.extractNPCsFromScene(context.scene);
    }

    return context;
  }

  /**
   * Fetch character data by name from CharacterController
   * Uses the actual CharacterController endpoint: /character/:userId/:name
   */
  private async fetchCharacterByName(user_id: string, character_name: string): Promise<CharacterContext | undefined> {
    try {
      const response = await axios.get(
        `${this.characterControllerURL}/character/${user_id}/${character_name}`,
        { timeout: 5000 }
      );

      if (response.data.success && response.data.data) {
        const char = response.data.data;
        return this.normalizeCharacterContext(char);
      }
    } catch (error) {
      this.handleModuleError('CharacterController', error);
    }

    return undefined;
  }

  /**
   * Fetch character data from CharacterController by ID (legacy)
   */
  private async fetchCharacterContext(character_id: number): Promise<CharacterContext | undefined> {
    try {
      const response = await axios.get(`${this.characterControllerURL}/characters/${character_id}`, {
        timeout: 5000,
      });

      if (response.data.success && response.data.data) {
        const char = response.data.data;
        return this.normalizeCharacterContext(char);
      }
    } catch (error) {
      this.handleModuleError('CharacterController', error);
    }

    return undefined;
  }

  /**
   * Normalize character data from any source into consistent format
   */
  private normalizeCharacterContext(char: any): CharacterContext {
    return {
      id: char.id || 0,
      name: char.name || char.character_name || 'Unknown',
      level: char.level,
      class: char.class,
      hp: char.stats?.hp || char.hp,
      max_hp: char.stats?.max_hp || char.max_hp,
      location: char.location,
      stats: char.stats,
    };
  }

  /**
   * Fetch scene data by location_id from SceneController
   * Uses SceneController endpoint: /location/:locationId
   */
  private async fetchSceneByLocationId(location_id: number): Promise<SceneContext | undefined> {
    try {
      const response = await axios.get(`${this.sceneControllerURL}/location/${location_id}`, {
        timeout: 5000,
      });

      if (response.data.success && response.data.data) {
        const scene = response.data.data;
        return this.normalizeSceneContext(scene);
      }
    } catch (error) {
      this.handleModuleError('SceneController', error);
    }

    return undefined;
  }

  /**
   * Fetch scene data from SceneController by ID (legacy)
   */
  private async fetchSceneContext(scene_id: number): Promise<SceneContext | undefined> {
    try {
      const response = await axios.get(`${this.sceneControllerURL}/scenes/${scene_id}`, {
        timeout: 5000,
      });

      if (response.data.success && response.data.data) {
        const scene = response.data.data;
        return this.normalizeSceneContext(scene);
      }
    } catch (error) {
      this.handleModuleError('SceneController', error);
    }

    return undefined;
  }

  /**
   * Normalize scene data from any source into consistent format
   */
  private normalizeSceneContext(scene: any): SceneContext {
    return {
      id: scene.id || scene.location_id || 0,
      name: scene.name || scene.location_name || 'Unknown Location',
      description: scene.description,
      type: scene.type || scene.location_type,
      entities: scene.entities,
      coordinates: scene.coordinates || scene.position || {
        x: scene.x_coord,
        y: scene.y_coord,
        z: scene.z_coord,
      },
    };
  }

  /**
   * Fetch recent interaction history from storage
   */
  private async fetchRecentInteractions(
    user_id: string,
    character_id?: number
  ): Promise<any[] | undefined> {
    try {
      const interactions = await this.storage.getInteractionHistory(
        user_id,
        this.maxHistoryItems,
        character_id
      );

      // Return simplified version for context (just the responses)
      return interactions.map((interaction) => ({
        type: interaction.response_type,
        input: interaction.player_input,
        response: interaction.response_content,
        timestamp: interaction.created_at,
      }));
    } catch (error) {
      console.warn('Failed to fetch interaction history:', error);
      return undefined;
    }
  }

  /**
   * Extract NPC information from scene entities
   */
  private extractNPCsFromScene(scene: SceneContext): NPCContext[] {
    if (!scene.entities || !Array.isArray(scene.entities)) {
      return [];
    }

    return scene.entities
      .filter((entity: any) => entity.type === 'npc' || entity.entity_type === 'npc')
      .map((npc: any) => ({
        id: npc.id,
        name: npc.name || 'Unknown NPC',
        role: npc.role || npc.occupation,
        personality: npc.personality,
        relationship: npc.relationship,
      }));
  }

  /**
   * Handle errors from module API calls
   */
  private handleModuleError(moduleName: string, error: unknown): void {
    if (axios.isAxiosError(error)) {
      const axiosError = error as AxiosError;
      if (axiosError.code === 'ECONNREFUSED') {
        console.warn(`${moduleName} is not running or not reachable`);
      } else if (axiosError.response) {
        console.warn(
          `${moduleName} returned error: ${axiosError.response.status} - ${JSON.stringify(axiosError.response.data)}`
        );
      } else {
        console.warn(`${moduleName} request failed: ${axiosError.message}`);
      }
    } else {
      console.warn(`${moduleName} error:`, error);
    }
  }

  /**
   * Build a human-readable context summary for AI prompt
   */
  public buildContextSummary(context: GatheredContext): string {
    const parts: string[] = [];

    // Character context
    if (context.character) {
      const char = context.character;
      parts.push(`Character: ${char.name}`);
      if (char.class) parts.push(`Class: ${char.class}`);
      if (char.level) parts.push(`Level: ${char.level}`);
      if (char.hp !== undefined && char.max_hp !== undefined) {
        parts.push(`HP: ${char.hp}/${char.max_hp}`);
      }
    }

    // Scene context
    if (context.scene) {
      const scene = context.scene;
      parts.push(`Location: ${scene.name}`);
      if (scene.description) parts.push(`Description: ${scene.description}`);
      if (scene.type) parts.push(`Scene Type: ${scene.type}`);
    }

    // NPCs present
    if (context.npcs && context.npcs.length > 0) {
      const npcNames = context.npcs.map((npc) => npc.name).join(', ');
      parts.push(`NPCs Present: ${npcNames}`);
    }

    // Recent interactions summary
    if (context.recent_interactions && context.recent_interactions.length > 0) {
      parts.push(
        `Recent Interactions: ${context.recent_interactions.length} previous actions/responses`
      );
    }

    return parts.join('\n');
  }

  /**
   * Get detailed recent interaction history as text
   */
  public getRecentInteractionsText(context: GatheredContext, maxItems: number = 5): string {
    if (!context.recent_interactions || context.recent_interactions.length === 0) {
      return '';
    }

    const interactions = context.recent_interactions.slice(0, maxItems);
    const lines: string[] = ['Recent History:'];

    interactions.forEach((interaction, index) => {
      lines.push(`${index + 1}. Player: "${interaction.input}"`);
      if (interaction.response && typeof interaction.response === 'object') {
        // Extract meaningful text from response
        const responseText = this.extractResponseText(interaction.response);
        if (responseText) {
          lines.push(`   Response: ${responseText}`);
        }
      }
    });

    return lines.join('\n');
  }

  /**
   * Extract readable text from response object
   */
  private extractResponseText(response: any): string {
    if (response.dialogue) return response.dialogue;
    if (response.message) return response.message;
    if (response.text) return response.text;
    if (response.description) return response.description;
    return '';
  }
}
