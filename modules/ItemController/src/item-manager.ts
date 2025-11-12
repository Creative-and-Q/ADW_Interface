import { MySQLItemStorage } from './mysql-storage.js';
import {
  Item,
  CreateItemRequest,
  UpdateItemRequest,
  SearchItemsRequest,
  ItemWithContents,
  AddToContainerRequest,
  RemoveFromContainerRequest,
} from './types.js';

/**
 * Item Manager - Handles item business logic
 *
 * Simplified to manage only the item catalog.
 * Position and possession tracking moved to SceneController.
 */
export class ItemManager {
  constructor(private storage: MySQLItemStorage) {}

  /**
   * Create a new item
   */
  async createItem(request: CreateItemRequest): Promise<Item> {
    const item: Item = {
      name: request.name,
      meta_data: request.meta_data,
    };

    const itemId = await this.storage.createItem(item);
    const createdItem = await this.storage.getItem(itemId);

    if (!createdItem) {
      throw new Error('Failed to retrieve created item');
    }

    return createdItem;
  }

  /**
   * Get item by ID
   */
  async getItem(itemId: number): Promise<Item | null> {
    return await this.storage.getItem(itemId);
  }

  /**
   * Update an item
   */
  async updateItem(itemId: number, request: UpdateItemRequest): Promise<Item> {
    const item = await this.storage.getItem(itemId);
    if (!item) {
      throw new Error(`Item ${itemId} not found`);
    }

    await this.storage.updateItem(itemId, request);

    const updatedItem = await this.storage.getItem(itemId);
    if (!updatedItem) {
      throw new Error('Failed to retrieve updated item');
    }

    return updatedItem;
  }

  /**
   * Delete an item
   */
  async deleteItem(itemId: number): Promise<void> {
    const item = await this.storage.getItem(itemId);
    if (!item) {
      throw new Error(`Item ${itemId} not found`);
    }

    await this.storage.deleteItem(itemId);
  }

  /**
   * Search items by name
   */
  async searchItems(request: SearchItemsRequest): Promise<{ items: Item[]; total: number }> {
    return await this.storage.searchItems(request);
  }

  /**
   * Add an item to a container
   */
  async addToContainer(request: AddToContainerRequest): Promise<Item> {
    const { item_id, container_id } = request;

    // Validate items exist
    const item = await this.storage.getItem(item_id);
    if (!item) {
      throw new Error(`Item ${item_id} not found`);
    }

    const container = await this.storage.getItem(container_id);
    if (!container) {
      throw new Error(`Container ${container_id} not found`);
    }

    // Prevent self-containment
    if (item_id === container_id) {
      throw new Error('An item cannot contain itself');
    }

    // Check if container is marked as a container
    const isContainer = container.meta_data?.is_container === true;
    if (!isContainer) {
      throw new Error(`Item ${container_id} is not a container`);
    }

    // Prevent circular references (check if container is contained in this item's hierarchy)
    const isCircular = await this.isContainedIn(container_id, item_id);
    if (isCircular) {
      throw new Error('Cannot create circular containment - container is already inside this item');
    }

    // Check if item is already in a container
    if (item.contained_in_item_id) {
      throw new Error(
        `Item ${item_id} is already in container ${item.contained_in_item_id}. Remove it first.`
      );
    }

    // Check container capacity if specified
    if (container.meta_data?.container_capacity) {
      const totalWeight = await this.calculateTotalWeight(container_id);
      const itemWeight = (item.meta_data?.weight as number) || 0;
      const capacity = container.meta_data.container_capacity as number;

      if (totalWeight + itemWeight > capacity) {
        throw new Error(
          `Container is at capacity. Current: ${totalWeight}, Item: ${itemWeight}, Max: ${capacity}`
        );
      }
    }

    // Add item to container
    await this.storage.updateItem(item_id, { contained_in_item_id: container_id });

    const updatedItem = await this.storage.getItem(item_id);
    if (!updatedItem) {
      throw new Error('Failed to retrieve updated item');
    }

    return updatedItem;
  }

  /**
   * Remove an item from its container
   */
  async removeFromContainer(request: RemoveFromContainerRequest): Promise<Item> {
    const { item_id } = request;

    const item = await this.storage.getItem(item_id);
    if (!item) {
      throw new Error(`Item ${item_id} not found`);
    }

    if (!item.contained_in_item_id) {
      throw new Error(`Item ${item_id} is not in a container`);
    }

    // Remove from container
    await this.storage.updateItem(item_id, { contained_in_item_id: null });

    const updatedItem = await this.storage.getItem(item_id);
    if (!updatedItem) {
      throw new Error('Failed to retrieve updated item');
    }

    return updatedItem;
  }

  /**
   * Get all items in a container (with optional recursive lookup)
   */
  async getContainerContents(containerId: number, recursive = false): Promise<ItemWithContents> {
    const container = await this.storage.getItem(containerId);
    if (!container) {
      throw new Error(`Container ${containerId} not found`);
    }

    const contents = await this.storage.getContainedItems(containerId);

    const containerWithContents: ItemWithContents = {
      ...container,
      contents: [],
      total_weight: await this.calculateTotalWeight(containerId),
    };

    if (recursive) {
      // Recursively load contents
      containerWithContents.contents = await Promise.all(
        contents.map(async (item) => {
          const isContainer = item.meta_data?.is_container === true;
          if (isContainer) {
            return await this.getContainerContents(item.id!, true);
          }
          return item;
        })
      );
    } else {
      containerWithContents.contents = contents;
    }

    return containerWithContents;
  }

  /**
   * Calculate total weight of an item including all contents
   */
  async calculateTotalWeight(itemId: number): Promise<number> {
    const item = await this.storage.getItem(itemId);
    if (!item) {
      return 0;
    }

    let totalWeight = (item.meta_data?.weight as number) || 0;

    // Add weight of all contained items
    const contents = await this.storage.getContainedItems(itemId);
    for (const containedItem of contents) {
      totalWeight += await this.calculateTotalWeight(containedItem.id!);
    }

    return totalWeight;
  }

  /**
   * Check if an item is contained within another item's hierarchy
   * Used to prevent circular references
   */
  private async isContainedIn(itemId: number, potentialContainerId: number): Promise<boolean> {
    const item = await this.storage.getItem(itemId);
    if (!item || !item.contained_in_item_id) {
      return false;
    }

    if (item.contained_in_item_id === potentialContainerId) {
      return true;
    }

    // Recursively check parent containers
    return await this.isContainedIn(item.contained_in_item_id, potentialContainerId);
  }
}
