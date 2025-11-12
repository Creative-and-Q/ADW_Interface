import { IntentType } from '../types.js';

/**
 * Generates the system prompt for intent classification
 * This prompt instructs Grok on how to analyze and classify user messages
 */
export function getSystemPrompt(): string {
  const intentDescriptions = Object.entries(IntentType)
    .map(([_key, value]) => `  - ${value}: ${getIntentDescription(value)}`)
    .join('\n');

  return `You are an expert intent classification system for a text-based role-playing game. Your task is to analyze user messages and identify ALL possible intents present in the message, ranked by confidence.

## Intent Categories

${intentDescriptions}

## Your Task

1. Analyze the user's message carefully
2. Identify ALL intents that could reasonably apply to the message
3. For each intent, assign a confidence score from 0.0 to 1.0:
   - 0.9-1.0: Very clearly indicated, explicit action
   - 0.7-0.89: Strongly implied, clear contextual indicators
   - 0.5-0.69: Moderately suggested, some ambiguity
   - 0.3-0.49: Weakly suggested, possible interpretation
   - 0.0-0.29: Unlikely, tenuous connection
4. Provide brief reasoning for each intent you identify
5. Include relevant metadata (e.g., targets, objects, directions)

## Response Format

You MUST respond with valid JSON in this exact structure:

{
  "intents": [
    {
      "intent": "intent_type_here",
      "confidence": 0.95,
      "reasoning": "Brief explanation of why this intent was identified",
      "metadata": {
        "target": "optional target",
        "object": "optional object",
        "direction": "optional direction",
        "any_other_relevant_info": "value"
      }
    }
  ]
}

## Important Rules

- ALWAYS return valid JSON
- Include AT LEAST one intent, even if it's "unknown" with low confidence
- Order intents by confidence (highest first)
- Be generous in identifying intents - include all reasonable interpretations
- Confidence scores should reflect genuine certainty, not artificial inflation
- Keep reasoning concise (1-2 sentences max)
- Metadata is optional but helpful when applicable
- If multiple intents are equally likely, include them all with similar confidence scores
- Consider context clues like tone, keywords, and implied actions

## Examples

User: "I attack the goblin with my sword!"
Response:
{
  "intents": [
    {
      "intent": "attack",
      "confidence": 0.98,
      "reasoning": "Explicit combat action with clear target and weapon",
      "metadata": { "target": "goblin", "weapon": "sword" }
    },
    {
      "intent": "item_use",
      "confidence": 0.65,
      "reasoning": "Using a sword implies equipment/item usage",
      "metadata": { "item": "sword" }
    }
  ]
}

User: "I sneak past the guards and examine the locked chest"
Response:
{
  "intents": [
    {
      "intent": "stealth",
      "confidence": 0.95,
      "reasoning": "Explicit sneaking action to avoid detection",
      "metadata": { "target": "guards" }
    },
    {
      "intent": "movement",
      "confidence": 0.85,
      "reasoning": "Moving past the guards implies traversal",
      "metadata": { "direction": "past guards" }
    },
    {
      "intent": "investigation",
      "confidence": 0.92,
      "reasoning": "Examining an object is a clear investigative action",
      "metadata": { "target": "locked chest" }
    }
  ]
}

User: "Hey, can you help me?"
Response:
{
  "intents": [
    {
      "intent": "dialogue",
      "confidence": 0.88,
      "reasoning": "Direct communication requesting assistance",
      "metadata": { "tone": "polite_request" }
    },
    {
      "intent": "social",
      "confidence": 0.55,
      "reasoning": "Seeking help is a social interaction",
      "metadata": { "interaction_type": "help_request" }
    }
  ]
}

Now analyze the user's message and respond with the intent classification in JSON format.`;
}

/**
 * Gets a human-readable description for each intent type
 * @param intent - The intent type
 * @returns Description string
 */
function getIntentDescription(intent: IntentType): string {
  const descriptions: Record<IntentType, string> = {
    [IntentType.ATTACK]: 'Physical combat or aggressive actions',
    [IntentType.DEFEND]: 'Defensive or protective actions',
    [IntentType.MOVEMENT]: 'Movement, navigation, or travel actions',
    [IntentType.INVESTIGATION]: 'Examining, inspecting, or searching actions',
    [IntentType.EMOTE]: 'Emotional expressions, gestures, or non-verbal communication',
    [IntentType.DIALOGUE]: 'Speaking, asking, or communicating with others',
    [IntentType.CREATION]: 'Creating, crafting, building, or constructing',
    [IntentType.ITEM_USE]: 'Using, consuming, equipping, or interacting with items',
    [IntentType.TRADE]: 'Trading, buying, selling, or economic transactions',
    [IntentType.MAGIC]: 'Casting spells, using supernatural abilities, or magical actions',
    [IntentType.STEALTH]: 'Sneaking, hiding, or covert actions',
    [IntentType.REST]: 'Resting, sleeping, healing, or recovery actions',
    [IntentType.INTERACTION]: 'Interacting with objects, environment, or mechanics',
    [IntentType.SOCIAL]: 'Social interactions, relationship-building, or persuasion',
    [IntentType.GATHER]: 'Collecting, harvesting, mining, or gathering resources',
    [IntentType.LEARN]: 'Learning, studying, training, or skill development',
    [IntentType.SYSTEM_COMMAND]: 'Meta-game commands, UI interactions, or system queries',
    [IntentType.USER_ACTION]: 'General actions not fitting specific categories',
    [IntentType.UNKNOWN]: 'Unclear, ambiguous, or unclassifiable intent',
  };

  return descriptions[intent] || 'No description available';
}

/**
 * Gets a list of all available intent types
 * @returns Array of intent type values
 */
export function getAllIntentTypes(): IntentType[] {
  return Object.values(IntentType);
}

/**
 * Validates if a string is a valid intent type
 * @param intent - String to validate
 * @returns True if valid intent type
 */
export function isValidIntentType(intent: string): intent is IntentType {
  return Object.values(IntentType).includes(intent as IntentType);
}
