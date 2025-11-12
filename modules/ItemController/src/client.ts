import axios, { AxiosInstance } from 'axios';
import {
  // Item,
  CreateItemRequest,
  // ItemWithContents,
} from './types.js';

// Legacy types for compatibility - to be removed when other services are updated
type ItemTemplate = any;
type ItemWithTemplate = any;
type ItemMovementHistory = any;
type PickupItemRequest = any;
type DropItemRequest = any;
type TradeItemRequest = any;
type MoveItemRequest = any;

/**
 * ItemController HTTP Client
 *
 * Use this client from other modules (CharacterController, SceneController, etc.)
 * to interact with the ItemController service.
 *
 * @example
 * ```typescript
 * const itemClient = new ItemControllerClient('http://localhost:3034');
 *
 * // Create an item
 * const sword = await itemClient.createItem({
 *   template_id: 1,
 *   owner_type: 'character',
 *   owner_id: 'character_123',
 *   quantity: 1
 * });
 *
 * // Get character inventory
 * const inventory = await itemClient.getInventory('character_123');
 * ```
 */
export class ItemControllerClient {
  private client: AxiosInstance;

  constructor(baseURL: string = 'http://localhost:3034') {
    this.client = axios.create({
      baseURL,
      timeout: 10000,
      headers: {
        'Content-Type': 'application/json',
      },
    });
  }

  /**
   * Template Management
   */

  async createTemplate(template: Omit<ItemTemplate, 'id' | 'created_at' | 'updated_at'>): Promise<ItemTemplate> {
    const response = await this.client.post('/template', template);
    return response.data.template;
  }

  async getTemplate(id: number): Promise<ItemTemplate | null> {
    try {
      const response = await this.client.get(`/template/${id}`);
      return response.data.template;
    } catch (error: any) {
      if (error.response?.status === 404) return null;
      throw error;
    }
  }

  async searchTemplates(params: {
    query?: string;
    item_type?: string;
    rarity?: string;
    limit?: number;
    offset?: number;
  }): Promise<{ templates: ItemTemplate[]; total: number }> {
    const response = await this.client.get('/templates', { params });
    return {
      templates: response.data.templates,
      total: response.data.total,
    };
  }

  /**
   * Item Instance Management
   */

  async createItem(request: CreateItemRequest): Promise<ItemWithTemplate> {
    const response = await this.client.post('/item', request);
    return response.data.item;
  }

  async getItem(id: number): Promise<ItemWithTemplate | null> {
    try {
      const response = await this.client.get(`/item/${id}`);
      return response.data.item;
    } catch (error: any) {
      if (error.response?.status === 404) return null;
      throw error;
    }
  }

  async pickupItem(itemId: number, request: PickupItemRequest): Promise<ItemWithTemplate> {
    const response = await this.client.post(`/item/${itemId}/pickup`, request);
    return response.data.item;
  }

  async dropItem(itemId: number, request: DropItemRequest): Promise<ItemWithTemplate> {
    const response = await this.client.post(`/item/${itemId}/drop`, request);
    return response.data.item;
  }

  async tradeItem(itemId: number, request: TradeItemRequest): Promise<ItemWithTemplate> {
    const response = await this.client.post(`/item/${itemId}/trade`, request);
    return response.data.item;
  }

  async moveItem(itemId: number, request: MoveItemRequest): Promise<ItemWithTemplate> {
    const response = await this.client.post(`/item/${itemId}/move`, request);
    return response.data.item;
  }

  async equipItem(itemId: number, characterId: string): Promise<ItemWithTemplate> {
    const response = await this.client.post(`/item/${itemId}/equip`, { character_id: characterId });
    return response.data.item;
  }

  async unequipItem(itemId: number, characterId: string): Promise<ItemWithTemplate> {
    const response = await this.client.post(`/item/${itemId}/unequip`, { character_id: characterId });
    return response.data.item;
  }

  async destroyItem(itemId: number): Promise<void> {
    await this.client.delete(`/item/${itemId}`);
  }

  async getItemHistory(itemId: number, limit: number = 100): Promise<ItemMovementHistory[]> {
    const response = await this.client.get(`/item/${itemId}/history`, {
      params: { limit },
    });
    return response.data.history;
  }

  /**
   * Container Management
   */

  /**
   * Add an item to a container
   */
  async addToContainer(itemId: number, containerId: number): Promise<any> {
    const response = await this.client.post(`/item/${itemId}/add-to-container`, {
      container_id: containerId,
    });
    return response.data.item;
  }

  /**
   * Remove an item from its container
   */
  async removeFromContainer(itemId: number): Promise<any> {
    const response = await this.client.post(`/item/${itemId}/remove-from-container`);
    return response.data.item;
  }

  /**
   * Get all items contained in a container
   * @param containerId - The container item ID
   * @param recursive - If true, recursively load nested containers
   */
  async getContainerContents(containerId: number, recursive: boolean = false): Promise<any> {
    const response = await this.client.get(`/item/${containerId}/contents`, {
      params: { recursive },
    });
    return response.data.container;
  }

  /**
   * Calculate total weight of an item (including all contained items)
   */
  async getTotalWeight(itemId: number): Promise<number> {
    const response = await this.client.get(`/item/${itemId}/weight`);
    return response.data.total_weight;
  }

  /**
   * Inventory Management
   */

  async getInventory(characterId: string): Promise<{
    items: ItemWithTemplate[];
    equipped: ItemWithTemplate[];
    totalWeight: number;
    totalValue: number;
  }> {
    const response = await this.client.get(`/inventory/${characterId}`);
    return {
      items: response.data.items,
      equipped: response.data.equipped,
      totalWeight: response.data.totalWeight,
      totalValue: response.data.totalValue,
    };
  }

  /**
   * Location-based Queries
   */

  async getItemsAtPOI(poiId: number): Promise<ItemWithTemplate[]> {
    const response = await this.client.get(`/items/at-poi/${poiId}`);
    return response.data.items;
  }

  async getItemsNearby(x: number, y: number, radius: number = 50): Promise<ItemWithTemplate[]> {
    const response = await this.client.get('/items/nearby', {
      params: { x, y, radius },
    });
    return response.data.items;
  }

  /**
   * Statistics
   */

  async getStats(): Promise<{
    totalTemplates: number;
    totalItems: number;
    itemsByOwnerType: Record<string, number>;
    totalRecipes: number;
  }> {
    const response = await this.client.get('/stats');
    return response.data.stats;
  }

  /**
   * Health Check
   */

  async healthCheck(): Promise<{ status: string; service: string }> {
    const response = await this.client.get('/health');
    return response.data;
  }

  /**
   * Convenience Methods
   */

  /* LEGACY: Template-based methods commented out for simplified API

  async giveItemToCharacter(templateId: number, characterId: string, quantity: number = 1): Promise<ItemWithTemplate> {
    return await this.createItem({
      template_id: templateId,
      quantity,
      owner_type: 'character',
      owner_id: characterId,
    });
  }

  async spawnItemInWorld(
    templateId: number,
    x: number,
    y: number,
    poiId?: number,
    quantity: number = 1
  ): Promise<ItemWithTemplate> {
    return await this.createItem({
      template_id: templateId,
      quantity,
      owner_type: poiId ? 'poi' : 'world',
      x,
      y,
      poi_id: poiId,
    });
  }
  */


  /**
   * Transfer item from one character to another
   */
  async transferItem(itemId: number, fromCharacterId: string, toCharacterId: string): Promise<ItemWithTemplate> {
    return await this.tradeItem(itemId, {
      from_character_id: fromCharacterId,
      to_character_id: toCharacterId,
    });
  }

  /**
   * Check if character has enough inventory space
   */
  async canCarry(characterId: string, additionalWeight: number, maxWeight: number = 100): Promise<boolean> {
    const inventory = await this.getInventory(characterId);
    return inventory.totalWeight + additionalWeight <= maxWeight;
  }

  /**
   * Get total value of character's possessions
   */
  async getCharacterWealth(characterId: string): Promise<number> {
    const inventory = await this.getInventory(characterId);
    return inventory.totalValue;
  }
}

/**
 * Create a singleton instance for convenience
 */
let defaultClient: ItemControllerClient | null = null;

export function getItemClient(baseURL?: string): ItemControllerClient {
  if (!defaultClient) {
    defaultClient = new ItemControllerClient(baseURL);
  }
  return defaultClient;
}

export function setItemClient(client: ItemControllerClient): void {
  defaultClient = client;
}
