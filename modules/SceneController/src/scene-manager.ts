import { MySQLSceneStorage } from './mysql-storage.js';
import { SceneAIParser } from './ai-parser.js';
import {
  SceneInput,
  SceneResponse,
  SceneContext,
  EntityPosition,
  Location,
  Coordinate,
} from './types.js';
import { CoordinateUtils } from './coordinate-utils.js';

/**
 * Main scene manager coordinating storage, AI parsing, and scene state
 */
export class SceneManager {
  constructor(
    private storage: MySQLSceneStorage,
    private aiParser: SceneAIParser,
    private defaultSearchRadius: number = 50
  ) {}

  /**
   * Process user input for scene-related actions
   */
  async processInput(input: SceneInput): Promise<SceneResponse> {
    try {
      const { user_id, entity_id, input: userInput, meta_data } = input;

      // Get or create entity position
      let entityPosition = await this.storage.getEntityPosition(entity_id, 'player_character');

      if (!entityPosition) {
        // Create initial position at origin if entity doesn't exist
        entityPosition = {
          entity_id,
          entity_type: 'player_character',
          entity_name: entity_id,
          x_coord: 0,
          y_coord: 0,
          user_id,
          is_active: true,
        };

        const positionId = await this.storage.upsertEntityPosition(entityPosition);
        entityPosition.id = positionId;
      }

      const currentPos: Coordinate = {
        x: entityPosition.x_coord,
        y: entityPosition.y_coord,
      };

      // Parse input with AI
      const parsed = await this.aiParser.parseSceneInput(userInput, currentPos, meta_data);

      let changes: SceneResponse['changes'] = {};
      let message = '';

      // Handle different actions
      switch (parsed.action) {
        case 'move':
          if (parsed.destination) {
            const result = await this.handleMovement(entityPosition, parsed.destination, currentPos);
            entityPosition = result.entityPosition;
            changes = result.changes;
            message = result.message;
          } else {
            message = 'Movement action detected but no destination specified';
          }
          break;

        case 'travel':
          if (parsed.destination?.coordinates) {
            const result = await this.handleTravel(entityPosition, parsed.destination.coordinates);
            entityPosition = result.entityPosition;
            changes = result.changes;
            message = result.message;
          } else {
            message = 'Travel action detected but no coordinates specified';
          }
          break;

        case 'look':
          message = 'You look around...';
          break;

        case 'interact':
          if (parsed.target) {
            message = `You interact with ${parsed.target.name}`;
          } else {
            message = 'Interaction detected but no target specified';
          }
          break;

        case 'none':
        default:
          message = 'No scene action detected';
          break;
      }

      // Build scene context
      const sceneContext = await this.buildSceneContext(
        entityPosition.x_coord,
        entityPosition.y_coord,
        entityPosition.location_id || undefined
      );

      return {
        success: true,
        entity_position: entityPosition,
        scene_context: sceneContext,
        changes,
        message,
        meta_data,
      };
    } catch (error) {
      return {
        success: false,
        message: 'Failed to process scene input',
        error: error instanceof Error ? error.message : String(error),
        meta_data: input.meta_data,
      };
    }
  }

  /**
   * Handle movement action
   */
  private async handleMovement(
    entityPosition: EntityPosition,
    destination: NonNullable<SceneResponse['scene_context']>['nearby_locations'][0] | any,
    currentPos: Coordinate
  ): Promise<{
    entityPosition: EntityPosition;
    changes: SceneResponse['changes'];
    message: string;
  }> {
    let newPos: Coordinate = { ...currentPos };
    let targetLocation: Location | null = null;

    // Determine new position based on destination
    if (destination.name) {
      // Try to find location by name
      targetLocation = await this.storage.getLocationByName(destination.name);

      if (targetLocation) {
        // Move toward the location
        newPos = { x: targetLocation.x_coord, y: targetLocation.y_coord };
      } else if (destination.direction) {
        // No location found, but has direction - move in that direction
        const distance = destination.distance || 10;
        newPos = CoordinateUtils.applyMovement(currentPos.x, currentPos.y, destination.direction, distance);
      }
    } else if (destination.direction) {
      // Movement by direction
      const distance = destination.distance || 10;
      newPos = CoordinateUtils.applyMovement(currentPos.x, currentPos.y, destination.direction, distance);

      // Check if there's a location at the destination
      targetLocation = await this.storage.getLocationByCoordinates(newPos.x, newPos.y, 5);
    } else if (destination.coordinates) {
      // Explicit coordinates
      newPos = destination.coordinates;
      targetLocation = await this.storage.getLocationByCoordinates(newPos.x, newPos.y, 5);
    }

    // Round coordinates
    newPos = CoordinateUtils.roundCoordinate(newPos, 2);

    // Record movement in history if we have the position ID
    if (entityPosition.id) {
      await this.storage.recordMovement({
        entity_position_id: entityPosition.id,
        from_x: currentPos.x,
        from_y: currentPos.y,
        to_x: newPos.x,
        to_y: newPos.y,
        from_location_id: entityPosition.location_id || null,
        to_location_id: targetLocation?.id || null,
        movement_type: 'walk',
      });
    }

    // Update entity position
    entityPosition.x_coord = newPos.x;
    entityPosition.y_coord = newPos.y;
    entityPosition.location_id = targetLocation?.id || null;

    await this.storage.upsertEntityPosition(entityPosition);

    const distance = CoordinateUtils.calculateDistance(currentPos.x, currentPos.y, newPos.x, newPos.y);

    let message = `Moved ${distance.toFixed(1)} units to ${CoordinateUtils.formatCoordinate(newPos)}`;
    if (targetLocation) {
      message += ` (${targetLocation.name})`;
    }

    return {
      entityPosition,
      changes: {
        position_updated: true,
        new_location: targetLocation?.name,
        moved_from: currentPos,
        moved_to: newPos,
      },
      message,
    };
  }

  /**
   * Handle travel/teleport action
   */
  private async handleTravel(
    entityPosition: EntityPosition,
    coordinates: Coordinate
  ): Promise<{
    entityPosition: EntityPosition;
    changes: SceneResponse['changes'];
    message: string;
  }> {
    const currentPos: Coordinate = {
      x: entityPosition.x_coord,
      y: entityPosition.y_coord,
    };

    const newPos = CoordinateUtils.roundCoordinate(coordinates, 2);
    const targetLocation = await this.storage.getLocationByCoordinates(newPos.x, newPos.y, 5);

    // Record movement
    if (entityPosition.id) {
      await this.storage.recordMovement({
        entity_position_id: entityPosition.id,
        from_x: currentPos.x,
        from_y: currentPos.y,
        to_x: newPos.x,
        to_y: newPos.y,
        from_location_id: entityPosition.location_id || null,
        to_location_id: targetLocation?.id || null,
        movement_type: 'teleport',
      });
    }

    // Update position
    entityPosition.x_coord = newPos.x;
    entityPosition.y_coord = newPos.y;
    entityPosition.location_id = targetLocation?.id || null;

    await this.storage.upsertEntityPosition(entityPosition);

    let message = `Teleported to ${CoordinateUtils.formatCoordinate(newPos)}`;
    if (targetLocation) {
      message += ` (${targetLocation.name})`;
    }

    return {
      entityPosition,
      changes: {
        position_updated: true,
        new_location: targetLocation?.name,
        moved_from: currentPos,
        moved_to: newPos,
      },
      message,
    };
  }

  /**
   * Build scene context for current position
   */
  private async buildSceneContext(
    x: number,
    y: number,
    currentLocationId?: number
  ): Promise<SceneContext> {
    const radius = this.defaultSearchRadius;

    // Get nearby locations
    const nearbyLocations = await this.storage.getNearbyLocations(x, y, radius);

    // Get nearby POIs
    const nearbyPOIs = await this.storage.getNearbyPOIs(x, y, radius);

    // Get nearby entities
    const nearbyEntities = await this.storage.getNearbyEntities(x, y, radius);

    // Get current location if available
    let currentLocation: Location | undefined;
    if (currentLocationId) {
      currentLocation = (await this.storage.getLocation(currentLocationId)) || undefined;
    }

    // Get connections from current location
    const connections = currentLocationId
      ? await this.storage.getConnectionsFromLocation(currentLocationId)
      : [];

    return {
      current_location: currentLocation,
      nearby_locations: nearbyLocations,
      nearby_pois: nearbyPOIs,
      nearby_entities: nearbyEntities,
      connections,
    };
  }

  /**
   * Get entity position by ID
   */
  async getEntityPosition(entityId: string, entityType: string = 'player_character'): Promise<EntityPosition | null> {
    return await this.storage.getEntityPosition(entityId, entityType);
  }

  /**
   * Move entity to specific coordinates
   */
  async moveEntity(
    entityId: string,
    entityType: string,
    newX: number,
    newY: number,
    movementType: string = 'walk'
  ): Promise<EntityPosition | null> {
    const entityPosition = await this.storage.getEntityPosition(entityId, entityType);

    if (!entityPosition) {
      return null;
    }

    const oldX = entityPosition.x_coord;
    const oldY = entityPosition.y_coord;

    // Record movement
    if (entityPosition.id) {
      await this.storage.recordMovement({
        entity_position_id: entityPosition.id,
        from_x: oldX,
        from_y: oldY,
        to_x: newX,
        to_y: newY,
        from_location_id: entityPosition.location_id || null,
        to_location_id: null,
        movement_type: movementType as any,
      });
    }

    // Update position
    entityPosition.x_coord = newX;
    entityPosition.y_coord = newY;

    // Check for location at new position
    const location = await this.storage.getLocationByCoordinates(newX, newY, 5);
    entityPosition.location_id = location?.id || null;

    await this.storage.upsertEntityPosition(entityPosition);

    return entityPosition;
  }

  /**
   * Get statistics
   */
  async getStats() {
    return await this.storage.getStats();
  }

  /**
   * Close storage connection
   */
  async close(): Promise<void> {
    await this.storage.close();
  }
}
