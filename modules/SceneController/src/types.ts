import { z } from 'zod';

/**
 * Coordinate schema
 */
export const CoordinateSchema = z.object({
  x: z.number(),
  y: z.number(),
});

export type Coordinate = z.infer<typeof CoordinateSchema>;

/**
 * Continent schema - Top-level geographic division
 */
export const ContinentSchema = z.object({
  id: z.number().optional(),
  name: z.string().min(1),
  description: z.string().optional(),
  map_data: z.record(z.unknown()).optional(),
  created_at: z.string().optional(),
  updated_at: z.string().optional(),
});

export type Continent = z.infer<typeof ContinentSchema>;

/**
 * Region schema - Geographic area within a continent
 */
export const RegionSchema = z.object({
  id: z.number().optional(),
  continent_id: z.number(),
  name: z.string().min(1),
  description: z.string().optional(),
  min_x: z.number().optional(),
  min_y: z.number().optional(),
  max_x: z.number().optional(),
  max_y: z.number().optional(),
  terrain_type: z.string().optional(),
  climate: z.string().optional(),
  danger_level: z.number().int().min(1).max(10).default(1),
  metadata: z.record(z.unknown()).optional(),
  created_at: z.string().optional(),
  updated_at: z.string().optional(),
});

export type Region = z.infer<typeof RegionSchema>;

/**
 * Location types
 */
export const LocationTypeSchema = z.enum([
  'city',
  'town',
  'village',
  'dungeon',
  'wilderness',
  'building',
  'room',
  'region',
  'other',
]);

export type LocationType = z.infer<typeof LocationTypeSchema>;

/**
 * Location schema
 */
export const LocationSchema = z.object({
  id: z.number().optional(),
  name: z.string().min(1),
  description: z.string().optional(),
  location_type: LocationTypeSchema,
  x_coord: z.number(),
  y_coord: z.number(),
  parent_location_id: z.number().nullable().optional(),
  region_id: z.number().nullable().optional(),
  continent_id: z.number().nullable().optional(),
  created_at: z.string().optional(),
  updated_at: z.string().optional(),
});

export type Location = z.infer<typeof LocationSchema>;

/**
 * POI types
 */
export const POITypeSchema = z.enum([
  'shop',
  'inn',
  'temple',
  'landmark',
  'npc',
  'quest',
  'danger',
  'resource',
  'other',
]);

export type POIType = z.infer<typeof POITypeSchema>;

/**
 * Point of Interest schema
 */
export const POISchema = z.object({
  id: z.number().optional(),
  name: z.string().min(1),
  description: z.string().optional(),
  poi_type: POITypeSchema,
  location_id: z.number(),
  region_id: z.number().nullable().optional(),
  x_coord: z.number(),
  y_coord: z.number(),
  metadata: z.record(z.unknown()).optional(),
  created_at: z.string().optional(),
  updated_at: z.string().optional(),
});

export type POI = z.infer<typeof POISchema>;

/**
 * Entity types
 */
export const EntityTypeSchema = z.enum([
  'player_character',
  'npc',
  'monster',
  'object',
]);

export type EntityType = z.infer<typeof EntityTypeSchema>;

/**
 * Movement types
 */
export const MovementTypeSchema = z.enum([
  'walk',
  'run',
  'teleport',
  'fly',
  'swim',
  'other',
]);

export type MovementType = z.infer<typeof MovementTypeSchema>;

/**
 * Entity position schema
 */
export const EntityPositionSchema = z.object({
  id: z.number().optional(),
  entity_id: z.string(),
  entity_type: EntityTypeSchema,
  entity_name: z.string(),
  x_coord: z.number(),
  y_coord: z.number(),
  location_id: z.number().nullable().optional(),
  region_id: z.number().nullable().optional(),
  continent_id: z.number().nullable().optional(),
  user_id: z.string().nullable().optional(),
  facing_direction: z.number().min(0).max(360).nullable().optional(),
  is_active: z.boolean().default(true),
  last_movement_at: z.string().optional(),
  created_at: z.string().optional(),
  updated_at: z.string().optional(),
});

export type EntityPosition = z.infer<typeof EntityPositionSchema>;

/**
 * Movement history schema
 */
export const MovementHistorySchema = z.object({
  id: z.number().optional(),
  entity_position_id: z.number(),
  from_x: z.number(),
  from_y: z.number(),
  to_x: z.number(),
  to_y: z.number(),
  from_location_id: z.number().nullable().optional(),
  from_region_id: z.number().nullable().optional(),
  from_continent_id: z.number().nullable().optional(),
  to_location_id: z.number().nullable().optional(),
  to_region_id: z.number().nullable().optional(),
  to_continent_id: z.number().nullable().optional(),
  movement_type: MovementTypeSchema,
  moved_at: z.string().optional(),
});

export type MovementHistory = z.infer<typeof MovementHistorySchema>;

/**
 * Connection types
 */
export const ConnectionTypeSchema = z.enum([
  'road',
  'path',
  'portal',
  'door',
  'stairs',
  'bridge',
  'secret',
  'other',
]);

export type ConnectionType = z.infer<typeof ConnectionTypeSchema>;

/**
 * Location connection schema
 */
export const LocationConnectionSchema = z.object({
  id: z.number().optional(),
  from_location_id: z.number(),
  to_location_id: z.number(),
  connection_type: ConnectionTypeSchema,
  description: z.string().optional(),
  is_bidirectional: z.boolean().default(true),
  requires_key: z.boolean().default(false),
  is_hidden: z.boolean().default(false),
  created_at: z.string().optional(),
});

export type LocationConnection = z.infer<typeof LocationConnectionSchema>;

/**
 * Proximity search result
 */
export interface ProximityResult<T> {
  item: T;
  distance: number;
}

/**
 * Scene input from user
 */
export const SceneInputSchema = z.object({
  user_id: z.string(),
  entity_id: z.string(),
  input: z.string(),
  meta_data: z
    .object({
      intent: z.string().optional(),
      confidence: z.number().optional(),
      entities: z.record(z.unknown()).optional(),
    })
    .passthrough()
    .optional(),
});

export type SceneInput = z.infer<typeof SceneInputSchema>;

/**
 * Scene context for response
 */
export interface SceneContext {
  current_location?: Location;
  current_region?: Region;
  current_continent?: Continent;
  nearby_locations: ProximityResult<Location>[];
  nearby_pois: ProximityResult<POI>[];
  nearby_entities: ProximityResult<EntityPosition>[];
  connections: LocationConnection[];
}

/**
 * Scene response
 */
export interface SceneResponse {
  success: boolean;
  entity_position?: EntityPosition;
  scene_context?: SceneContext;
  changes?: {
    position_updated?: boolean;
    new_location?: string;
    moved_from?: Coordinate;
    moved_to?: Coordinate;
  };
  message: string;
  error?: string;
  meta_data?: Record<string, unknown>;
}

/**
 * AI Parser output for scenes
 */
export interface SceneParserOutput {
  action: 'move' | 'look' | 'interact' | 'travel' | 'none';
  destination?: {
    name?: string;
    coordinates?: Coordinate;
    direction?: string;
    distance?: number;
  };
  target?: {
    type: 'location' | 'poi' | 'entity';
    name: string;
  };
  confidence: number;
  explanation: string;
}

/**
 * Item Entity - Tracks position and possession of items
 */
export const ItemOwnerTypeSchema = z.enum([
  'character',
  'npc',
  'monster',
  'poi',
  'location',
  'world',
]);

export type ItemOwnerType = z.infer<typeof ItemOwnerTypeSchema>;

export const ItemMovementTypeSchema = z.enum([
  'pickup',
  'drop',
  'trade',
  'steal',
  'spawn',
  'destroy',
  'loot',
  'transfer',
]);

export type ItemMovementType = z.infer<typeof ItemMovementTypeSchema>;

export const ItemEntitySchema = z.object({
  id: z.number().optional(),
  item_id: z.number(), // References ItemController items.id
  owner_type: ItemOwnerTypeSchema.default('world'),
  owner_id: z.string().optional(),
  x_coord: z.number().optional(),
  y_coord: z.number().optional(),
  location_id: z.number().optional(),
  poi_id: z.number().optional(),
  is_equipped: z.boolean().default(false),
  quantity: z.number().int().default(1),
  created_at: z.string().optional(),
  updated_at: z.string().optional(),
});

export type ItemEntity = z.infer<typeof ItemEntitySchema>;

/**
 * Item Movement History
 */
export const ItemMovementHistorySchema = z.object({
  id: z.number().optional(),
  item_entity_id: z.number(),
  from_owner_type: ItemOwnerTypeSchema.optional(),
  from_owner_id: z.string().optional(),
  from_x: z.number().optional(),
  from_y: z.number().optional(),
  from_location_id: z.number().optional(),
  from_poi_id: z.number().optional(),
  to_owner_type: ItemOwnerTypeSchema.optional(),
  to_owner_id: z.string().optional(),
  to_x: z.number().optional(),
  to_y: z.number().optional(),
  to_location_id: z.number().optional(),
  to_poi_id: z.number().optional(),
  movement_type: ItemMovementTypeSchema,
  quantity: z.number().int().default(1),
  notes: z.string().optional(),
  moved_at: z.string().optional(),
});

export type ItemMovementHistory = z.infer<typeof ItemMovementHistorySchema>;

/**
 * Item Entity Requests
 */
export const CreateItemEntityRequestSchema = z.object({
  item_id: z.number(),
  owner_type: ItemOwnerTypeSchema.optional(),
  owner_id: z.string().optional(),
  x: z.number().optional(),
  y: z.number().optional(),
  location_id: z.number().optional(),
  poi_id: z.number().optional(),
  quantity: z.number().int().default(1),
});

export type CreateItemEntityRequest = z.infer<typeof CreateItemEntityRequestSchema>;

export const UpdateItemEntityRequestSchema = z.object({
  owner_type: ItemOwnerTypeSchema.optional(),
  owner_id: z.string().optional(),
  x: z.number().optional(),
  y: z.number().optional(),
  location_id: z.number().optional(),
  poi_id: z.number().optional(),
  is_equipped: z.boolean().optional(),
  quantity: z.number().int().optional(),
});

export type UpdateItemEntityRequest = z.infer<typeof UpdateItemEntityRequestSchema>;

/**
 * Item Entity Responses
 */
export interface ItemEntityResponse {
  success: boolean;
  item_entity?: ItemEntity;
  message?: string;
  error?: string;
}

export interface ItemEntitiesResponse {
  success: boolean;
  item_entities?: ItemEntity[];
  total?: number;
  message?: string;
  error?: string;
}
