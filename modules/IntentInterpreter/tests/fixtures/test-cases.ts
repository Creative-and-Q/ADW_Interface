import { IntentType } from '../../src/types.js';

/**
 * Test case structure for intent classification
 */
export interface TestCase {
  /** The user message to test */
  message: string;

  /** Expected primary intent */
  expectedPrimaryIntent: IntentType;

  /** Expected secondary intents (optional) */
  expectedSecondaryIntents?: IntentType[];

  /** Description of the test case */
  description: string;

  /** Minimum expected confidence for primary intent */
  minConfidence?: number;
}

/**
 * Comprehensive test cases covering all intent types
 */
export const testCases: TestCase[] = [
  // ATTACK intents
  {
    message: 'I attack the goblin with my sword!',
    expectedPrimaryIntent: IntentType.ATTACK,
    expectedSecondaryIntents: [IntentType.ITEM_USE],
    description: 'Explicit attack with weapon',
    minConfidence: 0.9,
  },
  {
    message: 'Strike the enemy!',
    expectedPrimaryIntent: IntentType.ATTACK,
    description: 'Combat command',
    minConfidence: 0.8,
  },
  {
    message: 'I punch the orc in the face',
    expectedPrimaryIntent: IntentType.ATTACK,
    description: 'Unarmed attack',
    minConfidence: 0.9,
  },

  // DEFEND intents
  {
    message: 'I raise my shield to block the attack',
    expectedPrimaryIntent: IntentType.DEFEND,
    expectedSecondaryIntents: [IntentType.ITEM_USE],
    description: 'Defensive action with shield',
    minConfidence: 0.8,
  },
  {
    message: 'I dodge out of the way',
    expectedPrimaryIntent: IntentType.DEFEND,
    expectedSecondaryIntents: [IntentType.MOVEMENT],
    description: 'Evasive maneuver',
    minConfidence: 0.7,
  },

  // MOVEMENT intents
  {
    message: 'I walk north',
    expectedPrimaryIntent: IntentType.MOVEMENT,
    description: 'Simple directional movement',
    minConfidence: 0.9,
  },
  {
    message: 'Let\'s go to the castle',
    expectedPrimaryIntent: IntentType.MOVEMENT,
    description: 'Movement to location',
    minConfidence: 0.8,
  },
  {
    message: 'I climb up the wall',
    expectedPrimaryIntent: IntentType.MOVEMENT,
    description: 'Vertical movement',
    minConfidence: 0.85,
  },

  // INVESTIGATION intents
  {
    message: 'I examine the locked chest',
    expectedPrimaryIntent: IntentType.INVESTIGATION,
    description: 'Examining an object',
    minConfidence: 0.9,
  },
  {
    message: 'What does the inscription say?',
    expectedPrimaryIntent: IntentType.INVESTIGATION,
    expectedSecondaryIntents: [IntentType.DIALOGUE],
    description: 'Investigating text/information',
    minConfidence: 0.7,
  },
  {
    message: 'I search the room for traps',
    expectedPrimaryIntent: IntentType.INVESTIGATION,
    description: 'Active searching',
    minConfidence: 0.9,
  },

  // EMOTE intents
  {
    message: 'I smile at the merchant',
    expectedPrimaryIntent: IntentType.EMOTE,
    expectedSecondaryIntents: [IntentType.SOCIAL],
    description: 'Facial expression',
    minConfidence: 0.9,
  },
  {
    message: '*laughs heartily*',
    expectedPrimaryIntent: IntentType.EMOTE,
    description: 'Emotive action in asterisks',
    minConfidence: 0.95,
  },
  {
    message: 'I nod in agreement',
    expectedPrimaryIntent: IntentType.EMOTE,
    expectedSecondaryIntents: [IntentType.DIALOGUE],
    description: 'Gesture indicating response',
    minConfidence: 0.8,
  },

  // DIALOGUE intents
  {
    message: 'I ask the guard about the missing princess',
    expectedPrimaryIntent: IntentType.DIALOGUE,
    description: 'Asking for information',
    minConfidence: 0.9,
  },
  {
    message: '"Hello, how are you?" I say to the innkeeper',
    expectedPrimaryIntent: IntentType.DIALOGUE,
    expectedSecondaryIntents: [IntentType.SOCIAL],
    description: 'Direct speech in quotes',
    minConfidence: 0.95,
  },
  {
    message: 'I tell them about the dragon',
    expectedPrimaryIntent: IntentType.DIALOGUE,
    description: 'Sharing information',
    minConfidence: 0.85,
  },

  // CREATION intents
  {
    message: 'I craft a wooden sword',
    expectedPrimaryIntent: IntentType.CREATION,
    description: 'Crafting an item',
    minConfidence: 0.95,
  },
  {
    message: 'I build a campfire',
    expectedPrimaryIntent: IntentType.CREATION,
    description: 'Building a structure',
    minConfidence: 0.9,
  },
  {
    message: 'I forge a steel blade at the anvil',
    expectedPrimaryIntent: IntentType.CREATION,
    expectedSecondaryIntents: [IntentType.INTERACTION],
    description: 'Metalworking',
    minConfidence: 0.9,
  },

  // ITEM_USE intents
  {
    message: 'I drink the healing potion',
    expectedPrimaryIntent: IntentType.ITEM_USE,
    description: 'Consuming an item',
    minConfidence: 0.95,
  },
  {
    message: 'I equip the iron armor',
    expectedPrimaryIntent: IntentType.ITEM_USE,
    description: 'Equipping gear',
    minConfidence: 0.9,
  },
  {
    message: 'I use the key on the door',
    expectedPrimaryIntent: IntentType.ITEM_USE,
    expectedSecondaryIntents: [IntentType.INTERACTION],
    description: 'Using tool on object',
    minConfidence: 0.9,
  },

  // TRADE intents
  {
    message: 'I buy the health potion',
    expectedPrimaryIntent: IntentType.TRADE,
    description: 'Purchasing item',
    minConfidence: 0.95,
  },
  {
    message: 'I sell my old sword to the merchant',
    expectedPrimaryIntent: IntentType.TRADE,
    expectedSecondaryIntents: [IntentType.DIALOGUE],
    description: 'Selling item',
    minConfidence: 0.9,
  },
  {
    message: 'How much for the map?',
    expectedPrimaryIntent: IntentType.TRADE,
    expectedSecondaryIntents: [IntentType.DIALOGUE],
    description: 'Price inquiry',
    minConfidence: 0.8,
  },

  // MAGIC intents
  {
    message: 'I cast fireball at the enemies',
    expectedPrimaryIntent: IntentType.MAGIC,
    expectedSecondaryIntents: [IntentType.ATTACK],
    description: 'Offensive spell',
    minConfidence: 0.95,
  },
  {
    message: 'I use my healing spell on the wounded ally',
    expectedPrimaryIntent: IntentType.MAGIC,
    description: 'Support spell',
    minConfidence: 0.9,
  },
  {
    message: 'I enchant my weapon with fire damage',
    expectedPrimaryIntent: IntentType.MAGIC,
    expectedSecondaryIntents: [IntentType.ITEM_USE],
    description: 'Enchantment',
    minConfidence: 0.85,
  },

  // STEALTH intents
  {
    message: 'I sneak past the guards',
    expectedPrimaryIntent: IntentType.STEALTH,
    expectedSecondaryIntents: [IntentType.MOVEMENT],
    description: 'Sneaking movement',
    minConfidence: 0.95,
  },
  {
    message: 'I hide in the shadows',
    expectedPrimaryIntent: IntentType.STEALTH,
    description: 'Concealment',
    minConfidence: 0.9,
  },
  {
    message: 'I pickpocket the noble',
    expectedPrimaryIntent: IntentType.STEALTH,
    description: 'Covert theft',
    minConfidence: 0.9,
  },

  // REST intents
  {
    message: 'I rest at the campfire',
    expectedPrimaryIntent: IntentType.REST,
    description: 'Taking rest',
    minConfidence: 0.95,
  },
  {
    message: 'I sleep until morning',
    expectedPrimaryIntent: IntentType.REST,
    description: 'Sleeping',
    minConfidence: 0.9,
  },
  {
    message: 'I bandage my wounds',
    expectedPrimaryIntent: IntentType.REST,
    expectedSecondaryIntents: [IntentType.ITEM_USE],
    description: 'Self-healing',
    minConfidence: 0.8,
  },

  // INTERACTION intents
  {
    message: 'I pull the lever',
    expectedPrimaryIntent: IntentType.INTERACTION,
    description: 'Operating mechanism',
    minConfidence: 0.9,
  },
  {
    message: 'I open the door',
    expectedPrimaryIntent: IntentType.INTERACTION,
    description: 'Opening object',
    minConfidence: 0.9,
  },
  {
    message: 'I press the button on the wall',
    expectedPrimaryIntent: IntentType.INTERACTION,
    description: 'Activating control',
    minConfidence: 0.9,
  },

  // SOCIAL intents
  {
    message: 'I try to befriend the villager',
    expectedPrimaryIntent: IntentType.SOCIAL,
    expectedSecondaryIntents: [IntentType.DIALOGUE],
    description: 'Building relationship',
    minConfidence: 0.9,
  },
  {
    message: 'I persuade the guard to let me pass',
    expectedPrimaryIntent: IntentType.SOCIAL,
    expectedSecondaryIntents: [IntentType.DIALOGUE],
    description: 'Persuasion attempt',
    minConfidence: 0.85,
  },
  {
    message: 'I intimidate the bandit',
    expectedPrimaryIntent: IntentType.SOCIAL,
    description: 'Intimidation',
    minConfidence: 0.85,
  },

  // GATHER intents
  {
    message: 'I mine the iron ore',
    expectedPrimaryIntent: IntentType.GATHER,
    description: 'Mining resources',
    minConfidence: 0.95,
  },
  {
    message: 'I pick the herbs from the forest',
    expectedPrimaryIntent: IntentType.GATHER,
    description: 'Foraging',
    minConfidence: 0.9,
  },
  {
    message: 'I collect wood from the trees',
    expectedPrimaryIntent: IntentType.GATHER,
    description: 'Resource collection',
    minConfidence: 0.9,
  },

  // LEARN intents
  {
    message: 'I study the spellbook',
    expectedPrimaryIntent: IntentType.LEARN,
    expectedSecondaryIntents: [IntentType.INVESTIGATION],
    description: 'Learning from book',
    minConfidence: 0.9,
  },
  {
    message: 'I train with the sword master',
    expectedPrimaryIntent: IntentType.LEARN,
    expectedSecondaryIntents: [IntentType.SOCIAL],
    description: 'Skill training',
    minConfidence: 0.9,
  },
  {
    message: 'I practice my archery',
    expectedPrimaryIntent: IntentType.LEARN,
    description: 'Skill practice',
    minConfidence: 0.85,
  },

  // SYSTEM_COMMAND intents
  {
    message: 'show inventory',
    expectedPrimaryIntent: IntentType.SYSTEM_COMMAND,
    description: 'UI command',
    minConfidence: 0.95,
  },
  {
    message: 'check my stats',
    expectedPrimaryIntent: IntentType.SYSTEM_COMMAND,
    description: 'Status query',
    minConfidence: 0.9,
  },
  {
    message: '/help',
    expectedPrimaryIntent: IntentType.SYSTEM_COMMAND,
    description: 'Meta command',
    minConfidence: 0.95,
  },

  // USER_ACTION intents
  {
    message: 'Hello!',
    expectedPrimaryIntent: IntentType.USER_ACTION,
    expectedSecondaryIntents: [IntentType.DIALOGUE],
    description: 'Simple greeting',
    minConfidence: 0.7,
  },
  {
    message: 'I wait',
    expectedPrimaryIntent: IntentType.USER_ACTION,
    description: 'Passive action',
    minConfidence: 0.8,
  },

  // UNKNOWN/Complex intents
  {
    message: 'asdfghjkl',
    expectedPrimaryIntent: IntentType.UNKNOWN,
    description: 'Gibberish input',
    minConfidence: 0.1,
  },
];

/**
 * Gets test cases for a specific intent type
 * @param intentType - The intent type to filter by
 * @returns Array of matching test cases
 */
export function getTestCasesByIntent(intentType: IntentType): TestCase[] {
  return testCases.filter((tc) => tc.expectedPrimaryIntent === intentType);
}

/**
 * Gets all unique intent types covered by test cases
 * @returns Array of intent types
 */
export function getCoveredIntentTypes(): IntentType[] {
  return Array.from(new Set(testCases.map((tc) => tc.expectedPrimaryIntent)));
}
