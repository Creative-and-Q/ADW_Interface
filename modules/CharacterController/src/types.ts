import { z } from 'zod';

/**
 * Character ability scores
 */
export const AbilityScoresSchema = z.object({
  strength: z.number().min(1).max(30).optional(),
  dexterity: z.number().min(1).max(30).optional(),
  constitution: z.number().min(1).max(30).optional(),
  intelligence: z.number().min(1).max(30).optional(),
  wisdom: z.number().min(1).max(30).optional(),
  charisma: z.number().min(1).max(30).optional(),
});

export type AbilityScores = z.infer<typeof AbilityScoresSchema>;

/**
 * Hit points tracking
 */
export const HitPointsSchema = z.object({
  current: z.number().min(0).optional(),
  max: z.number().min(0).optional(),
  temporary: z.number().min(0).optional().default(0),
});

export type HitPoints = z.infer<typeof HitPointsSchema>;

/**
 * Currency tracking
 */
export const CurrencySchema = z.object({
  platinum: z.number().min(0).optional().default(0),
  gold: z.number().min(0).optional().default(0),
  silver: z.number().min(0).optional().default(0),
  copper: z.number().min(0).optional().default(0),
});

export type Currency = z.infer<typeof CurrencySchema>;

/**
 * Inventory item input (for updates)
 */
export const ItemInputSchema = z.object({
  name: z.string(),
  quantity: z.number().min(1).optional().default(1),
  description: z.string().optional(),
  weight: z.number().min(0).optional(),
  value: z.number().min(0).optional(),
  equipped: z.boolean().optional(),
  magical: z.boolean().optional(),
  attunement: z.boolean().optional(),
  properties: z.array(z.string()).optional(),
});

/**
 * Inventory item (stored)
 */
export const ItemSchema = z.object({
  name: z.string(),
  quantity: z.number().min(1).default(1),
  description: z.string().optional(),
  weight: z.number().min(0).optional(),
  value: z.number().min(0).optional(),
  equipped: z.boolean().default(false),
  magical: z.boolean().default(false),
  attunement: z.boolean().default(false),
  properties: z.array(z.string()).optional(),
});

export type ItemInput = z.infer<typeof ItemInputSchema>;
export type Item = z.infer<typeof ItemSchema>;

/**
 * Carrying capacity
 */
export const WeightSchema = z.object({
  current: z.number().min(0).default(0),
  max: z.number().min(0).optional(),
});

export type Weight = z.infer<typeof WeightSchema>;

/**
 * Physical appearance
 */
export const AppearanceSchema = z.object({
  age: z.union([z.number(), z.string()]).optional(),
  height: z.string().optional(),
  weight: z.string().optional(),
  eyes: z.string().optional(),
  hair: z.string().optional(),
  skin: z.string().optional(),
  gender: z.string().optional(),
  distinguishingFeatures: z.array(z.string()).default([]),
});

export type Appearance = z.infer<typeof AppearanceSchema>;

/**
 * Spell information
 */
export const SpellSchema = z.object({
  name: z.string(),
  level: z.number().min(0).max(9).optional().default(0),
  school: z.string().optional(),
  castingTime: z.string().optional(),
  range: z.string().optional(),
  components: z.string().optional(),
  duration: z.string().optional(),
  description: z.string().optional(),
  prepared: z.boolean().default(false),
});

export type Spell = z.infer<typeof SpellSchema>;

/**
 * Spell slots
 */
export const SpellSlotsSchema = z.object({
  level1: z.object({ current: z.number(), max: z.number() }).optional(),
  level2: z.object({ current: z.number(), max: z.number() }).optional(),
  level3: z.object({ current: z.number(), max: z.number() }).optional(),
  level4: z.object({ current: z.number(), max: z.number() }).optional(),
  level5: z.object({ current: z.number(), max: z.number() }).optional(),
  level6: z.object({ current: z.number(), max: z.number() }).optional(),
  level7: z.object({ current: z.number(), max: z.number() }).optional(),
  level8: z.object({ current: z.number(), max: z.number() }).optional(),
  level9: z.object({ current: z.number(), max: z.number() }).optional(),
});

export type SpellSlots = z.infer<typeof SpellSlotsSchema>;

/**
 * Complete character sheet
 */
export const CharacterSheetSchema = z.object({
  // Basic Information
  name: z.string().min(1),
  race: z.string().optional(),
  class: z.string().optional(),
  subclass: z.string().optional(),
  level: z.number().min(1).max(20).optional(),
  background: z.string().optional(),
  alignment: z.string().optional(),
  experience: z.number().min(0).optional(),

  // Ability Scores
  abilityScores: AbilityScoresSchema.optional(),

  // Combat Stats
  hitPoints: HitPointsSchema.optional(),
  armorClass: z.number().min(0).optional(),
  initiative: z.number().optional(),
  speed: z.number().min(0).optional(),
  proficiencyBonus: z.number().min(0).optional(),

  // Inventory
  items: z.array(ItemSchema).default([]),
  currency: CurrencySchema.default({}),
  weight: WeightSchema.optional(),

  // Appearance
  appearance: AppearanceSchema.optional(),

  // Background & Personality
  backstory: z.string().optional(),
  personalityTraits: z.array(z.string()).default([]),
  ideals: z.array(z.string()).default([]),
  bonds: z.array(z.string()).default([]),
  flaws: z.array(z.string()).default([]),

  // Skills & Proficiencies
  skills: z.record(z.string(), z.number()).optional(),
  savingThrows: z.record(z.string(), z.number()).optional(),
  proficiencies: z.array(z.string()).default([]),
  languages: z.array(z.string()).default([]),

  // Spellcasting
  spellcastingAbility: z.string().optional(),
  spellSaveDC: z.number().optional(),
  spellAttackBonus: z.number().optional(),
  spells: z.array(SpellSchema).default([]),
  spellSlots: SpellSlotsSchema.optional(),

  // Features & Abilities
  features: z.array(z.object({
    name: z.string(),
    description: z.string(),
    source: z.string().optional(),
  })).default([]),

  // Status & Conditions
  conditions: z.array(z.string()).default([]),
  exhaustion: z.number().min(0).max(6).default(0),
  inspiration: z.boolean().default(false),

  // Relationships & Notes
  relationships: z.record(z.string(), z.string()).default({}),
  allies: z.array(z.string()).default([]),
  enemies: z.array(z.string()).default([]),
  organizations: z.array(z.string()).default([]),
  notes: z.array(z.string()).default([]),

  // Metadata
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  lastModifiedBy: z.string().optional(),
});

export type CharacterSheet = z.infer<typeof CharacterSheetSchema>;

/**
 * Partial update for character sheet
 * Uses ItemInput for items to allow partial item objects
 */
export type CharacterSheetUpdate = Partial<Omit<CharacterSheet, 'items'>> & {
  items?: ItemInput[];
};

/**
 * Metadata from IntentInterpreter or other sources
 */
export interface InputMetaData {
  intent?: string;
  confidence?: number;
  entities?: Record<string, unknown>;
  [key: string]: unknown; // Allow arbitrary metadata
}

/**
 * CLI Input format
 */
export interface CLIInput {
  user_id: string; // Required: User ID for character ownership
  user_character?: string; // Optional character name override
  input: string; // Natural language input
  meta_data?: InputMetaData; // Additional context from IntentInterpreter
}

/**
 * AI Parser input
 */
export interface AIParserInput {
  input: string;
  existingCharacters?: string[];
  userCharacter?: string;
  metaData?: InputMetaData;
}

/**
 * AI Parser output
 */
export interface AIParserOutput {
  characterName: string | null;
  updates: CharacterSheetUpdate;
  confidence: number;
  explanation: string;
}

/**
 * Location context from SceneController
 */
export interface LocationContext {
  current_location?: {
    name: string;
    description?: string;
    location_type: string;
    coordinates: { x: number; y: number };
  };
  nearby_locations?: Array<{
    name: string;
    location_type: string;
    distance: number;
  }>;
  nearby_pois?: Array<{
    name: string;
    poi_type: string;
    distance: number;
  }>;
  nearby_entities?: Array<{
    entity_name: string;
    entity_type: string;
    distance: number;
  }>;
}

/**
 * Character context for responses
 */
export interface CharacterContext {
  name: string;
  relevantInfo: {
    stats?: Partial<AbilityScores>;
    items?: string[];
    spells?: string[];
    features?: string[];
    conditions?: string[];
    other?: Record<string, unknown>;
  };
  location?: LocationContext;
}

/**
 * Name conflict error details
 */
export interface NameConflictError {
  code: 'NAME_CONFLICT';
  attemptedName: string;
  conflictingUserId?: string;
  message: string;
}

/**
 * CLI Response format
 */
export interface CLIResponse {
  success: boolean;
  characterUpdated?: string;
  changes?: CharacterSheetUpdate;
  context?: CharacterContext;
  message: string;
  error?: string | NameConflictError;
  meta_data?: InputMetaData; // Echo back metadata for reference
}
