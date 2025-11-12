import { z } from 'zod';

/**
 * Item: A single physical item in the world
 * Each row represents one item - if 10 "Great Swords" exist, there are 10 rows
 * Supports hierarchical containment (items can contain other items)
 */
export const ItemSchema = z.object({
  id: z.number().optional(),
  name: z.string(),

  // Flexible JSON metadata - can contain any item-specific details
  // Examples: description, stats, abilities, item_type, rarity, weight,
  // damage, armor_class, magical_properties, enchantments, condition, etc.
  // For containers, should include: is_container, container_capacity, container_volume
  meta_data: z.record(z.unknown()).optional(),

  // Container hierarchy - if this item is contained in another item
  contained_in_item_id: z.number().nullable().optional(),

  // Metadata
  created_at: z.string().datetime().optional(),
  updated_at: z.string().datetime().optional(),
});

export type Item = z.infer<typeof ItemSchema>;

/**
 * Item with its contained items (recursive structure)
 */
export interface ItemWithContents extends Item {
  contents?: ItemWithContents[];
  total_weight?: number;  // Calculated weight including all contained items
}

/**
 * API Request/Response Types
 */

// Create item request
export const CreateItemRequestSchema = z.object({
  name: z.string(),
  meta_data: z.record(z.unknown()).optional(),
});

export type CreateItemRequest = z.infer<typeof CreateItemRequestSchema>;

// Update item request
export const UpdateItemRequestSchema = z.object({
  name: z.string().optional(),
  meta_data: z.record(z.unknown()).optional(),
});

export type UpdateItemRequest = z.infer<typeof UpdateItemRequestSchema>;

// Search items request
export const SearchItemsRequestSchema = z.object({
  name: z.string().optional(),
  limit: z.number().int().default(50),
  offset: z.number().int().default(0),
});

export type SearchItemsRequest = z.infer<typeof SearchItemsRequestSchema>;

/**
 * Response Types
 */

export interface ItemResponse {
  success: boolean;
  item?: Item;
  message?: string;
  error?: string;
}

export interface ItemsResponse {
  success: boolean;
  items?: Item[];
  total?: number;
  message?: string;
  error?: string;
}

/**
 * Container operation requests
 */

// Add item to container
export const AddToContainerRequestSchema = z.object({
  item_id: z.number(),
  container_id: z.number(),
});

export type AddToContainerRequest = z.infer<typeof AddToContainerRequestSchema>;

// Remove item from container
export const RemoveFromContainerRequestSchema = z.object({
  item_id: z.number(),
});

export type RemoveFromContainerRequest = z.infer<typeof RemoveFromContainerRequestSchema>;

// Get container contents
export const GetContainerContentsRequestSchema = z.object({
  container_id: z.number(),
  recursive: z.boolean().optional().default(false),  // Include nested containers
});

export type GetContainerContentsRequest = z.infer<typeof GetContainerContentsRequestSchema>;

/**
 * Container operation responses
 */

export interface ContainerContentsResponse {
  success: boolean;
  container?: ItemWithContents;
  message?: string;
  error?: string;
}
