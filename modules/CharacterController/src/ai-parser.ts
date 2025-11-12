import { OpenRouterClient } from './openrouter-client.js';
import { getParserSystemPrompt, getContextSystemPrompt } from './prompts/parser-prompt.js';
import { AIParserOutput, CharacterSheet, CharacterContext, InputMetaData } from './types.js';

/**
 * AI-powered parser for extracting character information from natural language
 */
export class AIParser {
  constructor(private readonly client: OpenRouterClient) {}

  /**
   * Parse input and extract character information
   */
  async parseInput(input: string, userCharacter?: string, metaData?: InputMetaData): Promise<AIParserOutput> {
    const systemPrompt = getParserSystemPrompt();

    // Build user message with context
    const contextParts: string[] = [input];

    if (userCharacter) {
      contextParts.push(`\n\nUser Character: ${userCharacter}`);
    }

    if (metaData) {
      contextParts.push(`\n\nAdditional Context: ${JSON.stringify(metaData, null, 2)}`);
    }

    const userMessage = contextParts.join('');

    try {
      console.log('Calling OpenRouter API to parse input...');
      const response = await this.client.complete(systemPrompt, userMessage);
      console.log('Received AI response, parsing...');

      const parsed = JSON.parse(response) as AIParserOutput;

      // Validate response structure
      if (typeof parsed.characterName !== 'string' && parsed.characterName !== null) {
        throw new Error('Invalid characterName in response');
      }
      if (typeof parsed.updates !== 'object') {
        throw new Error('Invalid updates in response');
      }
      if (typeof parsed.confidence !== 'number' || parsed.confidence < 0 || parsed.confidence > 1) {
        throw new Error('Invalid confidence score');
      }

      console.log('AI parsing successful, confidence:', parsed.confidence);
      return parsed;
    } catch (error) {
      console.error('Failed to parse AI response:', error);
      throw new Error(`AI parsing failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Generate character context for a response
   */
  async generateContext(input: string, characterSheet: CharacterSheet, metaData?: InputMetaData): Promise<CharacterContext> {
    const systemPrompt = getContextSystemPrompt();

    const userMessageParts = [
      `Input: ${input}`,
      `\nCharacter Sheet: ${JSON.stringify(characterSheet)}`,
    ];

    if (metaData) {
      userMessageParts.push(`\nMetadata: ${JSON.stringify(metaData)}`);
    }

    const userMessage = userMessageParts.join('');

    try {
      const response = await this.client.complete(systemPrompt, userMessage);
      const parsed = JSON.parse(response) as {
        character: string;
        relevantInfo: CharacterContext['relevantInfo'];
        summary: string;
      };

      return {
        name: parsed.character,
        relevantInfo: parsed.relevantInfo,
      };
    } catch (error) {
      console.error('Failed to generate context:', error);
      // Return minimal context on error
      return {
        name: characterSheet.name,
        relevantInfo: {},
      };
    }
  }

  /**
   * Detect if input references a character by name
   * Returns best match from list of known characters
   */
  detectCharacter(input: string, knownCharacters: string[]): string | null {
    const inputLower = input.toLowerCase();

    for (const character of knownCharacters) {
      if (inputLower.includes(character.toLowerCase())) {
        return character;
      }
    }

    return null;
  }
}
