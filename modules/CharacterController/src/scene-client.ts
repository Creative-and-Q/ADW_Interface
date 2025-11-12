import axios, { AxiosInstance } from 'axios';

/**
 * Types for SceneController responses
 */
export interface EntityPosition {
  id?: number;
  entity_id: string;
  entity_type: string;
  entity_name: string;
  x_coord: number;
  y_coord: number;
  location_id: number | null;
  user_id: string | null;
  facing_direction: number | null;
  is_active: boolean;
  last_movement_at?: string;
  created_at?: string;
  updated_at?: string;
}

export interface Location {
  id?: number;
  name: string;
  description?: string;
  location_type: string;
  x_coord: number;
  y_coord: number;
  parent_location_id?: number | null;
  created_at?: string;
  updated_at?: string;
}

export interface POI {
  id?: number;
  name: string;
  description?: string;
  poi_type: string;
  location_id: number;
  x_coord: number;
  y_coord: number;
  metadata?: Record<string, unknown>;
  created_at?: string;
  updated_at?: string;
}

export interface ProximityResult<T> {
  item: T;
  distance: number;
}

export interface SceneContext {
  current_location?: Location;
  nearby_locations: ProximityResult<Location>[];
  nearby_pois: ProximityResult<POI>[];
  nearby_entities: ProximityResult<EntityPosition>[];
  connections: any[];
}

/**
 * Client for communicating with SceneController API
 */
export class SceneControllerClient {
  private client: AxiosInstance;

  constructor(baseUrl: string = 'http://localhost:3033') {
    this.client = axios.create({
      baseURL: baseUrl,
      timeout: 10000,
      headers: {
        'Content-Type': 'application/json',
      },
    });
  }

  /**
   * Get entity position by ID
   */
  async getEntityPosition(
    entityId: string,
    entityType: string = 'player_character'
  ): Promise<EntityPosition | null> {
    try {
      const response = await this.client.get(`/position/${entityId}`, {
        params: { type: entityType },
      });

      if (response.data.success) {
        return response.data.position;
      }

      return null;
    } catch (error) {
      if (axios.isAxiosError(error) && error.response?.status === 404) {
        return null;
      }
      console.error('Error getting entity position:', error);
      throw error;
    }
  }

  /**
   * Get nearby locations
   */
  async getNearbyLocations(
    x: number,
    y: number,
    radius: number = 50
  ): Promise<ProximityResult<Location>[]> {
    try {
      const response = await this.client.get('/nearby', {
        params: { x, y, radius, type: 'location' },
      });

      if (response.data.success) {
        return response.data.results;
      }

      return [];
    } catch (error) {
      console.error('Error getting nearby locations:', error);
      return [];
    }
  }

  /**
   * Get nearby POIs
   */
  async getNearbyPOIs(
    x: number,
    y: number,
    radius: number = 50
  ): Promise<ProximityResult<POI>[]> {
    try {
      const response = await this.client.get('/nearby', {
        params: { x, y, radius, type: 'poi' },
      });

      if (response.data.success) {
        return response.data.results;
      }

      return [];
    } catch (error) {
      console.error('Error getting nearby POIs:', error);
      return [];
    }
  }

  /**
   * Get nearby entities
   */
  async getNearbyEntities(
    x: number,
    y: number,
    radius: number = 50
  ): Promise<ProximityResult<EntityPosition>[]> {
    try {
      const response = await this.client.get('/nearby', {
        params: { x, y, radius, type: 'entity' },
      });

      if (response.data.success) {
        return response.data.results;
      }

      return [];
    } catch (error) {
      console.error('Error getting nearby entities:', error);
      return [];
    }
  }

  /**
   * Get location by ID
   */
  async getLocation(locationId: number): Promise<{ location: Location; connections: any[] } | null> {
    try {
      const response = await this.client.get(`/location/${locationId}`);

      if (response.data.success) {
        return {
          location: response.data.location,
          connections: response.data.connections || [],
        };
      }

      return null;
    } catch (error) {
      if (axios.isAxiosError(error) && error.response?.status === 404) {
        return null;
      }
      console.error('Error getting location:', error);
      throw error;
    }
  }

  /**
   * Get location by name
   */
  async getLocationByName(name: string): Promise<{ location: Location; connections: any[] } | null> {
    try {
      const response = await this.client.get(`/location/name/${encodeURIComponent(name)}`);

      if (response.data.success) {
        return {
          location: response.data.location,
          connections: response.data.connections || [],
        };
      }

      return null;
    } catch (error) {
      if (axios.isAxiosError(error) && error.response?.status === 404) {
        return null;
      }
      console.error('Error getting location by name:', error);
      throw error;
    }
  }

  /**
   * Process scene input (natural language)
   */
  async processInput(
    userId: string,
    entityId: string,
    input: string,
    metaData?: Record<string, unknown>
  ): Promise<any> {
    try {
      const response = await this.client.post('/process', {
        user_id: userId,
        entity_id: entityId,
        input,
        meta_data: metaData,
      });

      return response.data;
    } catch (error) {
      console.error('Error processing scene input:', error);
      throw error;
    }
  }

  /**
   * Move entity to specific coordinates
   */
  async moveEntity(
    entityId: string,
    entityType: string,
    x: number,
    y: number,
    movementType: string = 'walk'
  ): Promise<EntityPosition | null> {
    try {
      const response = await this.client.post('/move', {
        entity_id: entityId,
        entity_type: entityType,
        x,
        y,
        movement_type: movementType,
      });

      if (response.data.success) {
        return response.data.position;
      }

      return null;
    } catch (error) {
      console.error('Error moving entity:', error);
      throw error;
    }
  }

  /**
   * Get scene context for a position
   */
  async getSceneContext(x: number, y: number, radius: number = 50): Promise<SceneContext> {
    const [locations, pois, entities] = await Promise.all([
      this.getNearbyLocations(x, y, radius),
      this.getNearbyPOIs(x, y, radius),
      this.getNearbyEntities(x, y, radius),
    ]);

    // Get current location if we're inside one
    let currentLocation: Location | undefined;
    if (locations.length > 0 && locations[0].distance < 5) {
      currentLocation = locations[0].item;
    }

    return {
      current_location: currentLocation,
      nearby_locations: locations,
      nearby_pois: pois,
      nearby_entities: entities,
      connections: [],
    };
  }

  /**
   * Create a new location
   */
  async createLocation(location: Omit<Location, 'id' | 'created_at' | 'updated_at'>): Promise<Location | null> {
    try {
      const response = await this.client.post('/location', location);

      if (response.data.success) {
        return response.data.location;
      }

      return null;
    } catch (error) {
      console.error('Error creating location:', error);
      throw error;
    }
  }

  /**
   * Create a new POI
   */
  async createPOI(poi: Omit<POI, 'id' | 'created_at' | 'updated_at'>): Promise<POI | null> {
    try {
      const response = await this.client.post('/poi', poi);

      if (response.data.success) {
        return response.data.poi;
      }

      return null;
    } catch (error) {
      console.error('Error creating POI:', error);
      throw error;
    }
  }

  /**
   * Get POIs by location
   */
  async getPOIsByLocation(locationId: number): Promise<POI[]> {
    try {
      const response = await this.client.get(`/location/${locationId}/pois`);

      if (response.data.success) {
        return response.data.pois;
      }

      return [];
    } catch (error) {
      console.error('Error getting POIs by location:', error);
      return [];
    }
  }

  /**
   * Get entities in location
   */
  async getEntitiesInLocation(locationId: number, activeOnly: boolean = true): Promise<EntityPosition[]> {
    try {
      const response = await this.client.get(`/location/${locationId}/entities`, {
        params: { activeOnly },
      });

      if (response.data.success) {
        return response.data.entities;
      }

      return [];
    } catch (error) {
      console.error('Error getting entities in location:', error);
      return [];
    }
  }

  /**
   * Get movement history for entity position
   */
  async getMovementHistory(entityPositionId: number, limit: number = 100): Promise<any[]> {
    try {
      const response = await this.client.get(`/movement-history/${entityPositionId}`, {
        params: { limit },
      });

      if (response.data.success) {
        return response.data.history;
      }

      return [];
    } catch (error) {
      console.error('Error getting movement history:', error);
      return [];
    }
  }

  /**
   * Get system statistics
   */
  async getStats(): Promise<{
    totalLocations: number;
    totalPOIs: number;
    activeEntities: number;
    totalMovements: number;
  } | null> {
    try {
      const response = await this.client.get('/stats');

      if (response.data.success) {
        return response.data.stats;
      }

      return null;
    } catch (error) {
      console.error('Error getting stats:', error);
      return null;
    }
  }

  /**
   * Health check
   */
  async healthCheck(): Promise<boolean> {
    try {
      const response = await this.client.get('/health');
      return response.data.success === true;
    } catch (error) {
      return false;
    }
  }
}
