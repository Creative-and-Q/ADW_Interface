import { CharacterSheetManager } from './character-sheet.js';
import { MySQLStorage } from './mysql-storage.js';
import { AIParser } from './ai-parser.js';
import { OpenRouterClient } from './openrouter-client.js';
import { SceneControllerClient } from './scene-client.js';
import { CharacterSheet, CLIResponse, CharacterContext, CLIInput, NameConflictError, LocationContext } from './types.js';

/**
 * Main character manager coordinating storage, AI parsing, and character sheets
 */
export class CharacterManager {
  private storage: MySQLStorage;
  private aiParser: AIParser;
  private sceneClient?: SceneControllerClient;
  private characterCache: Map<string, CharacterSheetManager> = new Map();

  constructor(
    openRouterClient: OpenRouterClient,
    storage?: MySQLStorage,
    sceneClient?: SceneControllerClient
  ) {
    this.storage = storage || new MySQLStorage();
    this.aiParser = new AIParser(openRouterClient);
    this.sceneClient = sceneClient;
  }

  /**
   * Process user input with AI parsing
   */
  async processInput(cliInput: CLIInput): Promise<CLIResponse> {
    try {
      const { user_id, input, user_character, meta_data } = cliInput;
      console.log('processInput called with:', { user_id, input, user_character });

      // Clear cache to avoid corrupted cached data
      this.characterCache.clear();

      // Ensure user exists
      await this.storage.ensureUser(user_id);
      console.log('User ensured');

      // Parse input with AI
      console.log('Calling aiParser.parseInput...');
      const parseResult = await this.aiParser.parseInput(input, user_character, meta_data);
      console.log('AI parse result:', parseResult);

      // Determine character name - prefer user_character, then AI detection
      let characterName = user_character || parseResult.characterName;
      console.log('Character name determined:', characterName);

      // No character detected
      if (!characterName) {
        return {
          success: true,
          message: 'No character information detected in input',
          meta_data,
        };
      }

      // Determine if this is an auxiliary character (ally/enemy/NPC) or user's character
      // If user_character is provided, it's their character
      // If AI detected a different name, it's an auxiliary character
      const isAuxiliaryCharacter = !user_character && parseResult.characterName !== user_character;
      const ownerUserId = isAuxiliaryCharacter ? null : user_id;

      console.log(`Character type: ${isAuxiliaryCharacter ? 'auxiliary (unclaimed)' : 'user character'}`);

      // Load or create character
      const character = await this.getOrCreateCharacter(ownerUserId || user_id, characterName);
      const previousName = character.getName();

      // Apply updates
      const updatedSheet = character.update(parseResult.updates);

      // Check for name change
      const newName = updatedSheet.name;
      const isNameChange = previousName !== newName;

      // If name changed, check for conflicts
      if (isNameChange) {
        const isAvailable = await this.storage.isNameAvailable(ownerUserId, newName);

        if (!isAvailable) {
          const nameError: NameConflictError = {
            code: 'NAME_CONFLICT',
            attemptedName: newName,
            message: `Character name "${newName}" is already taken by another user`,
          };

          return {
            success: false,
            message: `Name change failed: "${newName}" is already taken`,
            error: nameError,
            meta_data,
          };
        }
      }

      // Save to storage with name conflict handling
      const saveResult = await this.storage.saveCharacter(
        ownerUserId,
        updatedSheet,
        isNameChange ? previousName : undefined
      );

      if (!saveResult.success) {
        const nameError: NameConflictError = {
          code: 'NAME_CONFLICT',
          attemptedName: newName,
          message: saveResult.error || 'Name conflict occurred',
        };

        return {
          success: false,
          message: saveResult.error || 'Failed to save character',
          error: nameError,
          meta_data,
        };
      }

      // If this was an auxiliary character, detect relationships and update user's character
      if (isAuxiliaryCharacter) {
        // Determine if this is an ally or enemy based on input keywords
        const inputLower = input.toLowerCase();
        const isAlly = inputLower.includes('ally') || inputLower.includes('friend');
        const isEnemy = inputLower.includes('enemy') || inputLower.includes('foe') || inputLower.includes('opponent');

        // If user_character provided OR user only has one character, update that character
        let targetCharacterName = user_character;
        if (!targetCharacterName) {
          const userChars = await this.storage.getUserCharacters(user_id);
          if (userChars.length === 1) {
            targetCharacterName = userChars[0];
            console.log(`No user_character specified, using ${targetCharacterName}`);
          }
        }

        if (targetCharacterName && (isAlly || isEnemy)) {
          const relationshipType = isAlly ? 'ally' : 'enemy';
          console.log(`Adding ${characterName} as ${relationshipType} to ${targetCharacterName}`);

          const userChar = await this.getOrCreateCharacter(user_id, targetCharacterName);
          const userSheet = userChar.getSheet();

          // Add to appropriate array if not already present
          const targetArray = isAlly ? userSheet.allies : userSheet.enemies;
          if (!targetArray.includes(characterName)) {
            const updates = isAlly
              ? { allies: [...userSheet.allies, characterName] }
              : { enemies: [...userSheet.enemies, characterName] };

            const updatedUserSheet = userChar.update(updates);
            await this.storage.saveCharacter(user_id, updatedUserSheet);
            console.log(`Successfully added ${characterName} to ${targetCharacterName}'s ${relationshipType} list`);
          }
        }
      }

      // Update cache with new name
      const cacheKey = this.getCacheKey(user_id, previousName);
      this.characterCache.delete(cacheKey);
      this.characterCache.set(this.getCacheKey(user_id, newName), character);

      // Check if we should provide context
      let context: CharacterContext | undefined;
      const knownCharacters = await this.storage.getUserCharacters(user_id);
      const mentionedCharacter = user_character || this.aiParser.detectCharacter(input, knownCharacters);

      if (mentionedCharacter) {
        const sheet = await this.storage.getCharacter(user_id, mentionedCharacter);
        if (sheet) {
          context = await this.aiParser.generateContext(input, sheet, meta_data);

          // Fetch location data from SceneController if available
          if (this.sceneClient) {
            try {
              const entityId = `char_${mentionedCharacter.toLowerCase().replace(/\s+/g, '_')}`;
              const position = await this.sceneClient.getEntityPosition(entityId);

              if (position) {
                const sceneContext = await this.sceneClient.getSceneContext(
                  position.x_coord,
                  position.y_coord,
                  50
                );

                // Build location context
                const locationContext: LocationContext = {
                  current_location: sceneContext.current_location
                    ? {
                        name: sceneContext.current_location.name,
                        description: sceneContext.current_location.description,
                        location_type: sceneContext.current_location.location_type,
                        coordinates: {
                          x: sceneContext.current_location.x_coord,
                          y: sceneContext.current_location.y_coord,
                        },
                      }
                    : undefined,
                  nearby_locations: sceneContext.nearby_locations.slice(0, 3).map((loc) => ({
                    name: loc.item.name,
                    location_type: loc.item.location_type,
                    distance: loc.distance,
                  })),
                  nearby_pois: sceneContext.nearby_pois.slice(0, 3).map((poi) => ({
                    name: poi.item.name,
                    poi_type: poi.item.poi_type,
                    distance: poi.distance,
                  })),
                  nearby_entities: sceneContext.nearby_entities
                    .filter((e) => e.item.entity_id !== entityId)
                    .slice(0, 3)
                    .map((entity) => ({
                      entity_name: entity.item.entity_name,
                      entity_type: entity.item.entity_type,
                      distance: entity.distance,
                    })),
                };

                context.location = locationContext;
              }
            } catch (error) {
              console.error('Failed to fetch location data from SceneController:', error);
              // Continue without location data
            }
          }
        }
      }

      return {
        success: true,
        characterUpdated: newName,
        changes: parseResult.updates,
        context,
        message: `Updated character: ${character.getSummary()}`,
        meta_data,
      };
    } catch (error) {
      console.error('Error in processInput:', error);
      console.error('Error type:', typeof error);
      console.error('Error message:', error instanceof Error ? error.message : String(error));
      console.error('Full error:', JSON.stringify(error, Object.getOwnPropertyNames(error)));
      const errorMessage = error instanceof Error ? error.message : String(error);
      const errorDetails = JSON.stringify(error, Object.getOwnPropertyNames(error));
      console.error('Error details:', errorDetails);

      return {
        success: false,
        message: 'Failed to process input',
        error: errorMessage,
        meta_data: cliInput.meta_data,
      };
    }
  }

  /**
   * Get cache key for user + character
   */
  private getCacheKey(userId: string, characterName: string): string {
    return `${userId}:${characterName}`;
  }

  /**
   * Get or create a character
   */
  private async getOrCreateCharacter(userId: string | null, name: string): Promise<CharacterSheetManager> {
    const cacheKey = this.getCacheKey(userId || 'unclaimed', name);

    // Check cache first
    if (this.characterCache.has(cacheKey)) {
      return this.characterCache.get(cacheKey)!;
    }

    // Try to load from storage
    const existing = await this.storage.getCharacter(userId, name);

    const character = new CharacterSheetManager(name, existing || undefined);
    this.characterCache.set(cacheKey, character);

    return character;
  }

  /**
   * Get character by name for specific user
   */
  async getCharacter(userId: string, name: string): Promise<CharacterSheet | null> {
    return await this.storage.getCharacter(userId, name);
  }

  /**
   * List all characters for a user
   */
  async listCharacters(userId: string): Promise<string[]> {
    return await this.storage.getUserCharacters(userId);
  }

  /**
   * Delete character
   */
  async deleteCharacter(userId: string, name: string): Promise<boolean> {
    const cacheKey = this.getCacheKey(userId, name);
    this.characterCache.delete(cacheKey);
    return await this.storage.deleteCharacter(userId, name);
  }

  /**
   * Search characters for a user
   */
  async searchCharacters(userId: string, query: string): Promise<string[]> {
    return await this.storage.searchCharacters(userId, query);
  }

  /**
   * Get storage statistics
   */
  async getStats(userId?: string): Promise<{
    totalUsers: number;
    totalCharacters: number;
    userCharacters?: number;
  }> {
    return await this.storage.getStats(userId);
  }

  /**
   * Get character name history
   */
  async getNameHistory(userId: string, characterName: string): Promise<
    Array<{ oldName: string; newName: string; changedAt: Date }>
  > {
    return await this.storage.getNameHistory(userId, characterName);
  }

  /**
   * Clear cache
   */
  clearCache(): void {
    this.characterCache.clear();
  }

  /**
   * Close storage connection
   */
  async close(): Promise<void> {
    await this.storage.close();
  }
}
