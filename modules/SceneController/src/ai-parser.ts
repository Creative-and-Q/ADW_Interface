import { OpenRouterClient } from './openrouter-client.js';
import { SceneParserOutput, Coordinate } from './types.js';

/**
 * AI-powered scene parser for natural language understanding
 */
export class SceneAIParser {
  constructor(private readonly client: OpenRouterClient) {}

  /**
   * Parse scene-related input and extract movement/interaction intent
   */
  async parseSceneInput(
    input: string,
    currentPosition?: Coordinate,
    metaData?: Record<string, unknown>
  ): Promise<SceneParserOutput> {
    const systemPrompt = this.getSceneParserSystemPrompt();

    // Build user message with context
    const contextParts: string[] = [];

    if (currentPosition) {
      contextParts.push(`Current Position: (${currentPosition.x}, ${currentPosition.y})`);
    }

    if (metaData?.intent) {
      contextParts.push(`Detected Intent: ${metaData.intent}`);
    }

    if (metaData?.entities) {
      contextParts.push(`Entities: ${JSON.stringify(metaData.entities)}`);
    }

    contextParts.push(`\nUser Input: ${input}`);

    const userMessage = contextParts.join('\n');

    try {
      const response = await this.client.complete(systemPrompt, userMessage);
      const parsed = JSON.parse(response) as SceneParserOutput;

      // Validate response structure
      this.validateParserOutput(parsed);

      return parsed;
    } catch (error) {
      console.error('Failed to parse scene input:', error);
      // Return default "no action" response
      return {
        action: 'none',
        confidence: 0,
        explanation: 'Failed to parse input: ' + (error instanceof Error ? error.message : String(error)),
      };
    }
  }

  /**
   * Generate scene description for current location
   */
  async generateSceneDescription(
    locationName?: string,
    nearbyPOIs?: string[],
    nearbyEntities?: string[],
    exits?: string[]
  ): Promise<string> {
    const systemPrompt = `You are a narrative scene describer for an RPG game. Create vivid, concise descriptions (2-3 sentences) of locations based on the information provided. Focus on atmosphere and key details.`;

    const userMessage = `
Location: ${locationName || 'Unknown location'}
Nearby POIs: ${nearbyPOIs?.join(', ') || 'None'}
Nearby Entities: ${nearbyEntities?.join(', ') || 'None'}
Exits: ${exits?.join(', ') || 'None visible'}

Generate a scene description.`;

    try {
      const response = await this.client.complete(systemPrompt, userMessage);
      return response.trim();
    } catch (error) {
      console.error('Failed to generate scene description:', error);
      return `You are at ${locationName || 'an unknown location'}.`;
    }
  }

  /**
   * System prompt for scene parsing
   */
  private getSceneParserSystemPrompt(): string {
    return `You are a scene parser for an RPG game. Your job is to analyze user input and determine their intended action regarding movement and location interaction.

## Your Task

Extract the following from user input:

1. **action**: One of: "move", "look", "interact", "travel", "none"
   - move: Short-distance movement (walk, run, step)
   - travel: Long-distance movement (teleport, fast travel)
   - look: Examining surroundings or searching
   - interact: Interacting with a location or POI
   - none: No location-related action

2. **destination**: If moving, extract:
   - name: Named location (e.g., "tavern", "town square")
   - coordinates: Explicit coordinates if mentioned
   - direction: Cardinal direction (north, south, east, west, etc.)
   - distance: How far (in units, default 10)

3. **target**: If looking or interacting:
   - type: "location", "poi", or "entity"
   - name: What they're targeting

4. **confidence**: 0-1 scale of certainty

5. **explanation**: Brief explanation of your parsing

## Response Format

Return ONLY valid JSON:

\`\`\`json
{
  "action": "move",
  "destination": {
    "name": "tavern",
    "direction": "north",
    "distance": 15
  },
  "confidence": 0.9,
  "explanation": "User wants to move north toward the tavern"
}
\`\`\`

## Examples

Input: "I move north to the tavern"
Output:
{
  "action": "move",
  "destination": {
    "name": "tavern",
    "direction": "north",
    "distance": 10
  },
  "confidence": 0.95,
  "explanation": "Clear movement north to tavern"
}

Input: "I look around"
Output:
{
  "action": "look",
  "confidence": 1.0,
  "explanation": "User wants to examine surroundings"
}

Input: "I enter the blacksmith shop"
Output:
{
  "action": "interact",
  "target": {
    "type": "poi",
    "name": "blacksmith shop"
  },
  "confidence": 0.9,
  "explanation": "User wants to interact with the blacksmith shop"
}

Input: "I walk 50 units east"
Output:
{
  "action": "move",
  "destination": {
    "direction": "east",
    "distance": 50
  },
  "confidence": 1.0,
  "explanation": "Explicit movement 50 units east"
}

Input: "I teleport to coordinates 100, 200"
Output:
{
  "action": "travel",
  "destination": {
    "coordinates": {"x": 100, "y": 200}
  },
  "confidence": 0.95,
  "explanation": "Teleportation to specific coordinates"
}

Input: "I attack the goblin"
Output:
{
  "action": "none",
  "confidence": 1.0,
  "explanation": "Combat action, not location-related"
}

## Rules

- Be precise: Only extract explicitly stated information
- Default distance: 10 units if not specified
- Direction parsing: Accept variations (n, north, up, forward)
- Coordinates: Look for explicit numbers like "100, 200" or "(100, 200)"
- If no location action is present, return action: "none"
- Confidence: Higher for explicit actions, lower for ambiguous ones

Now parse the user's input.`;
  }

  /**
   * Validate parser output structure
   */
  private validateParserOutput(output: SceneParserOutput): void {
    if (!output.action) {
      throw new Error('Missing action in parser output');
    }

    const validActions = ['move', 'look', 'interact', 'travel', 'none'];
    if (!validActions.includes(output.action)) {
      throw new Error(`Invalid action: ${output.action}`);
    }

    if (typeof output.confidence !== 'number' || output.confidence < 0 || output.confidence > 1) {
      throw new Error('Invalid confidence score');
    }

    if (!output.explanation) {
      throw new Error('Missing explanation');
    }

    // Validate destination structure if present
    if (output.destination) {
      if (output.destination.coordinates) {
        if (
          typeof output.destination.coordinates.x !== 'number' ||
          typeof output.destination.coordinates.y !== 'number'
        ) {
          throw new Error('Invalid coordinates structure');
        }
      }

      if (output.destination.distance !== undefined && output.destination.distance < 0) {
        throw new Error('Distance cannot be negative');
      }
    }

    // Validate target structure if present
    if (output.target) {
      const validTypes = ['location', 'poi', 'entity'];
      if (!validTypes.includes(output.target.type)) {
        throw new Error(`Invalid target type: ${output.target.type}`);
      }

      if (!output.target.name) {
        throw new Error('Target must have a name');
      }
    }
  }
}
