/**
 * Type Definitions for StoryTeller Module
 *
 * Uses Zod for runtime validation and TypeScript type inference.
 */

import { z } from 'zod';

// ============================================================================
// Response Types Enum
// ============================================================================

export const ResponseTypeEnum = z.enum([
  'NPC_DIALOGUE',
  'SYSTEM_MESSAGE',
  'NARRATIVE',
  'ERROR',
  'COMBAT_RESULT',
  'QUEST_UPDATE',
  'ENVIRONMENT',
  'ITEM_INTERACTION',
  'XP_REWARD',
  'MULTI_RESPONSE',
]);

export type ResponseType = z.infer<typeof ResponseTypeEnum>;

// ============================================================================
// Response Content Schemas
// ============================================================================

// NPC Dialogue Response
export const NPCDialogueResponseSchema = z.object({
  type: z.literal('NPC_DIALOGUE'),
  npc: z.object({
    id: z.number().optional(),
    name: z.string(),
    role: z.string().optional(),
  }),
  dialogue: z.string(),
  emotion: z.enum(['neutral', 'happy', 'angry', 'sad', 'surprised', 'fearful', 'disgusted']).optional(),
  actions: z.array(z.string()).optional(), // e.g., ["nods", "smiles"]
});

export type NPCDialogueResponse = z.infer<typeof NPCDialogueResponseSchema>;

// System Message Response
export const SystemMessageResponseSchema = z.object({
  type: z.literal('SYSTEM_MESSAGE'),
  message: z.string(),
  severity: z.enum(['info', 'success', 'warning', 'error']),
  icon: z.string().optional(),
});

export type SystemMessageResponse = z.infer<typeof SystemMessageResponseSchema>;

// Narrative Response
export const NarrativeResponseSchema = z.object({
  type: z.literal('NARRATIVE'),
  text: z.string(),
  mood: z.string().optional(), // e.g., "dark", "cheerful", "tense"
});

export type NarrativeResponse = z.infer<typeof NarrativeResponseSchema>;

// Error Response
export const ErrorResponseSchema = z.object({
  type: z.literal('ERROR'),
  error: z.string(),
  details: z.string().optional(),
});

export type ErrorResponse = z.infer<typeof ErrorResponseSchema>;

// Combat Result Response
export const CombatResultResponseSchema = z.object({
  type: z.literal('COMBAT_RESULT'),
  attacker: z.string(),
  defender: z.string(),
  action: z.string(),
  damage: z.number().optional(),
  outcome: z.enum(['hit', 'miss', 'critical', 'blocked', 'dodged']),
  description: z.string(),
  status_effects: z.array(z.string()).optional(),
});

export type CombatResultResponse = z.infer<typeof CombatResultResponseSchema>;

// Quest Update Response
export const QuestUpdateResponseSchema = z.object({
  type: z.literal('QUEST_UPDATE'),
  quest_name: z.string(),
  status: z.enum(['started', 'updated', 'completed', 'failed']),
  description: z.string(),
  rewards: z
    .object({
      xp: z.number().optional(),
      items: z
        .array(
          z.object({
            id: z.number(),
            name: z.string(),
            quantity: z.number(),
          })
        )
        .optional(),
      currency: z.number().optional(),
    })
    .optional(),
});

export type QuestUpdateResponse = z.infer<typeof QuestUpdateResponseSchema>;

// Environment Description Response
export const EnvironmentResponseSchema = z.object({
  type: z.literal('ENVIRONMENT'),
  location: z.string(),
  description: z.string(),
  atmosphere: z.string().optional(),
  exits: z.array(z.string()).optional(),
  entities_present: z.array(z.string()).optional(),
});

export type EnvironmentResponse = z.infer<typeof EnvironmentResponseSchema>;

// Item Interaction Response
export const ItemInteractionResponseSchema = z.object({
  type: z.literal('ITEM_INTERACTION'),
  item_name: z.string(),
  action: z.enum(['pickup', 'use', 'equip', 'drop', 'examine']),
  description: z.string(),
  result: z.string().optional(),
});

export type ItemInteractionResponse = z.infer<typeof ItemInteractionResponseSchema>;

// XP Reward Response
export const XPRewardResponseSchema = z.object({
  type: z.literal('XP_REWARD'),
  amount: z.number(),
  reason: z.string(),
  new_level: z.number().optional(),
  message: z.string(),
});

export type XPRewardResponse = z.infer<typeof XPRewardResponseSchema>;

// Multi-Response (combines multiple response types)
export const MultiResponseSchema = z.object({
  type: z.literal('MULTI_RESPONSE'),
  responses: z.array(
    z.union([
      NPCDialogueResponseSchema,
      SystemMessageResponseSchema,
      NarrativeResponseSchema,
      CombatResultResponseSchema,
      QuestUpdateResponseSchema,
      EnvironmentResponseSchema,
      ItemInteractionResponseSchema,
      XPRewardResponseSchema,
    ])
  ),
});

export type MultiResponse = z.infer<typeof MultiResponseSchema>;

// Union of all response types
export const ResponseContentSchema = z.union([
  NPCDialogueResponseSchema,
  SystemMessageResponseSchema,
  NarrativeResponseSchema,
  ErrorResponseSchema,
  CombatResultResponseSchema,
  QuestUpdateResponseSchema,
  EnvironmentResponseSchema,
  ItemInteractionResponseSchema,
  XPRewardResponseSchema,
  MultiResponseSchema,
]);

export type ResponseContent = z.infer<typeof ResponseContentSchema>;

// ============================================================================
// Game Event Schema
// ============================================================================

export const GameEventSchema = z.object({
  type: z.string(),
  data: z.record(z.any()),
  timestamp: z.string().optional(),
});

export type GameEvent = z.infer<typeof GameEventSchema>;

// ============================================================================
// Request Schemas
// ============================================================================

// Generate Narrative Request
export const GenerateNarrativeRequestSchema = z.object({
  user_id: z.string().min(1, 'User ID required'),
  // Character identification - provide EITHER character_id OR character_name
  character_id: z.number().optional(),
  character_name: z.string().optional(),
  // Scene identification - provide EITHER scene_id OR location_id OR location_name
  scene_id: z.number().optional(),
  location_id: z.number().optional(),
  location_name: z.string().optional(),
  // Core request data
  player_input: z.string().min(1, 'Player input required'),
  intent_type: z.string().optional(),
  intent_data: z.preprocess(
    (val) => {
      // If it's a string (stringified JSON), parse it
      if (typeof val === 'string' && val.trim().startsWith('{')) {
        try { return JSON.parse(val); } catch { return val; }
      }
      return val;
    },
    z.record(z.any()).optional()
  ), // Full intent result from IntentInterpreter
  character_context: z.preprocess(
    (val) => {
      // If it's a string (stringified JSON), parse it
      if (typeof val === 'string' && val.trim().startsWith('{')) {
        try { return JSON.parse(val); } catch { return val; }
      }
      return val;
    },
    z.record(z.any()).optional()
  ), // Pre-fetched character data from chains
  scene_context: z.preprocess(
    (val) => {
      // If it's a string (stringified JSON), parse it
      if (typeof val === 'string' && val.trim().startsWith('{')) {
        try { return JSON.parse(val); } catch { return val; }
      }
      return val;
    },
    z.record(z.any()).optional()
  ), // Pre-fetched scene data from chains
  game_events: z.array(GameEventSchema).optional(),
  response_type_hint: z.preprocess(
    (val) => val === '' ? undefined : val,
    ResponseTypeEnum.optional()
  ),
  options: z
    .object({
      temperature: z.number().min(0).max(2).optional(),
      max_tokens: z.number().min(1).max(4000).optional(),
      use_cache: z.boolean().optional(),
      template_name: z.string().optional(),
    })
    .optional(),
});

export type GenerateNarrativeRequest = z.infer<typeof GenerateNarrativeRequestSchema>;

// ============================================================================
// Context Schemas
// ============================================================================

export const CharacterContextSchema = z.object({
  id: z.number(),
  name: z.string(),
  level: z.number().optional(),
  class: z.string().optional(),
  hp: z.number().optional(),
  max_hp: z.number().optional(),
  location: z.string().optional(),
  stats: z.record(z.any()).optional(),
});

export type CharacterContext = z.infer<typeof CharacterContextSchema>;

export const SceneContextSchema = z.object({
  id: z.number(),
  name: z.string(),
  description: z.string().optional(),
  type: z.string().optional(),
  entities: z.array(z.any()).optional(),
  coordinates: z
    .object({
      x: z.number(),
      y: z.number(),
      z: z.number().optional(),
    })
    .optional(),
});

export type SceneContext = z.infer<typeof SceneContextSchema>;

export const NPCContextSchema = z.object({
  id: z.number(),
  name: z.string(),
  role: z.string().optional(),
  personality: z.string().optional(),
  relationship: z.string().optional(),
});

export type NPCContext = z.infer<typeof NPCContextSchema>;

export const GatheredContextSchema = z.object({
  character: CharacterContextSchema.optional(),
  scene: SceneContextSchema.optional(),
  npcs: z.array(NPCContextSchema).optional(),
  recent_interactions: z.array(z.any()).optional(),
});

export type GatheredContext = z.infer<typeof GatheredContextSchema>;

// ============================================================================
// Storage Schemas
// ============================================================================

export const NarrativeInteractionSchema = z.object({
  id: z.number().optional(),
  user_id: z.string(),
  character_id: z.number().nullable().optional(),
  scene_id: z.number().nullable().optional(),
  intent_type: z.string().nullable().optional(),
  player_input: z.string(),
  game_events: z.any().optional(), // JSON
  character_context: z.any().optional(), // JSON
  scene_context: z.any().optional(), // JSON
  npc_context: z.any().optional(), // JSON
  ai_model: z.string().optional(),
  ai_prompt: z.string().optional(),
  ai_tokens_used: z.number().optional(),
  response_type: ResponseTypeEnum,
  response_content: z.any(), // JSON
  created_at: z.date().optional(),
  processing_time_ms: z.number().optional(),
});

export type NarrativeInteraction = z.infer<typeof NarrativeInteractionSchema>;

export const StoryTemplateSchema = z.object({
  id: z.number().optional(),
  name: z.string(),
  description: z.string().optional(),
  response_type: z.string(),
  system_prompt: z.string(),
  user_prompt_template: z.string(),
  temperature: z.number().optional(),
  max_tokens: z.number().optional(),
  is_active: z.boolean().optional(),
  created_at: z.date().optional(),
  updated_at: z.date().optional(),
});

export type StoryTemplate = z.infer<typeof StoryTemplateSchema>;

export const ResponseCacheSchema = z.object({
  id: z.number().optional(),
  cache_key: z.string(),
  response_type: z.string(),
  response_content: z.any(), // JSON
  hit_count: z.number().optional(),
  created_at: z.date().optional(),
  last_used_at: z.date().optional(),
  expires_at: z.date().optional(),
});

export type ResponseCache = z.infer<typeof ResponseCacheSchema>;

// ============================================================================
// API Response Schema
// ============================================================================

export const GenerateNarrativeResponseSchema = z.object({
  success: z.boolean(),
  data: z
    .object({
      interaction_id: z.number(),
      response_type: ResponseTypeEnum,
      response: ResponseContentSchema,
      context_used: z.object({
        character_name: z.string().optional(),
        location: z.string().optional(),
        npcs_present: z.array(z.string()).optional(),
      }),
      metadata: z.object({
        ai_model: z.string(),
        tokens_used: z.number(),
        processing_time_ms: z.number(),
        cached: z.boolean(),
      }),
    })
    .optional(),
  error: z.string().optional(),
  message: z.string().optional(),
});

export type GenerateNarrativeResponse = z.infer<typeof GenerateNarrativeResponseSchema>;

// ============================================================================
// AI Client Types
// ============================================================================

export interface AIGenerateParams {
  systemPrompt: string;
  userPrompt: string;
  temperature?: number;
  maxTokens?: number;
}

export interface AIGenerateResult {
  content: string;
  tokens_used: number;
  model: string;
}
