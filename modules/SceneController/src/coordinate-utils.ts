import { Coordinate } from './types.js';

/**
 * Utility functions for coordinate operations
 */
export class CoordinateUtils {
  /**
   * Calculate Euclidean distance between two points
   */
  static calculateDistance(x1: number, y1: number, x2: number, y2: number): number {
    return Math.sqrt(Math.pow(x2 - x1, 2) + Math.pow(y2 - y1, 2));
  }

  /**
   * Calculate distance between two coordinate objects
   */
  static getDistance(coord1: Coordinate, coord2: Coordinate): number {
    return this.calculateDistance(coord1.x, coord1.y, coord2.x, coord2.y);
  }

  /**
   * Parse direction string to movement vector
   */
  static parseDirection(direction: string): { dx: number; dy: number } {
    const normalized = direction.toLowerCase().trim();

    const directions: Record<string, { dx: number; dy: number }> = {
      // Cardinal directions
      north: { dx: 0, dy: 1 },
      south: { dx: 0, dy: -1 },
      east: { dx: 1, dy: 0 },
      west: { dx: -1, dy: 0 },

      // Ordinal directions
      northeast: { dx: 1, dy: 1 },
      northwest: { dx: -1, dy: 1 },
      southeast: { dx: 1, dy: -1 },
      southwest: { dx: -1, dy: -1 },

      // Abbreviations
      n: { dx: 0, dy: 1 },
      s: { dx: 0, dy: -1 },
      e: { dx: 1, dy: 0 },
      w: { dx: -1, dy: 0 },
      ne: { dx: 1, dy: 1 },
      nw: { dx: -1, dy: 1 },
      se: { dx: 1, dy: -1 },
      sw: { dx: -1, dy: -1 },

      // Alternative names
      up: { dx: 0, dy: 1 },
      down: { dx: 0, dy: -1 },
      left: { dx: -1, dy: 0 },
      right: { dx: 1, dy: 0 },
      forward: { dx: 0, dy: 1 },
      back: { dx: 0, dy: -1 },
      backward: { dx: 0, dy: -1 },
    };

    return directions[normalized] || { dx: 0, dy: 0 };
  }

  /**
   * Apply movement in a direction with given distance
   */
  static applyMovement(
    x: number,
    y: number,
    direction: string,
    distance: number = 10
  ): Coordinate {
    const { dx, dy } = this.parseDirection(direction);

    // Normalize the direction vector
    const magnitude = Math.sqrt(dx * dx + dy * dy);
    const normalizedDx = magnitude > 0 ? dx / magnitude : 0;
    const normalizedDy = magnitude > 0 ? dy / magnitude : 0;

    return {
      x: x + normalizedDx * distance,
      y: y + normalizedDy * distance,
    };
  }

  /**
   * Calculate bearing/angle between two points (in degrees, 0-360)
   */
  static calculateBearing(from: Coordinate, to: Coordinate): number {
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    let angle = Math.atan2(dy, dx) * (180 / Math.PI);

    // Normalize to 0-360
    if (angle < 0) angle += 360;

    return angle;
  }

  /**
   * Convert bearing to cardinal direction name
   */
  static bearingToDirection(bearing: number): string {
    const normalized = ((bearing % 360) + 360) % 360; // Normalize to 0-360

    if (normalized >= 337.5 || normalized < 22.5) return 'east';
    if (normalized >= 22.5 && normalized < 67.5) return 'northeast';
    if (normalized >= 67.5 && normalized < 112.5) return 'north';
    if (normalized >= 112.5 && normalized < 157.5) return 'northwest';
    if (normalized >= 157.5 && normalized < 202.5) return 'west';
    if (normalized >= 202.5 && normalized < 247.5) return 'southwest';
    if (normalized >= 247.5 && normalized < 292.5) return 'south';
    if (normalized >= 292.5 && normalized < 337.5) return 'southeast';

    return 'north'; // Fallback
  }

  /**
   * Check if a point is within a rectangular boundary
   */
  static isWithinBounds(
    point: Coordinate,
    minX: number,
    minY: number,
    maxX: number,
    maxY: number
  ): boolean {
    return point.x >= minX && point.x <= maxX && point.y >= minY && point.y <= maxY;
  }

  /**
   * Check if a point is within a circular radius
   */
  static isWithinRadius(center: Coordinate, point: Coordinate, radius: number): boolean {
    return this.getDistance(center, point) <= radius;
  }

  /**
   * Get the midpoint between two coordinates
   */
  static getMidpoint(coord1: Coordinate, coord2: Coordinate): Coordinate {
    return {
      x: (coord1.x + coord2.x) / 2,
      y: (coord1.y + coord2.y) / 2,
    };
  }

  /**
   * Interpolate between two points (t = 0 to 1)
   */
  static interpolate(from: Coordinate, to: Coordinate, t: number): Coordinate {
    const clampedT = Math.max(0, Math.min(1, t));
    return {
      x: from.x + (to.x - from.x) * clampedT,
      y: from.y + (to.y - from.y) * clampedT,
    };
  }

  /**
   * Round coordinates to given precision
   */
  static roundCoordinate(coord: Coordinate, precision: number = 2): Coordinate {
    const multiplier = Math.pow(10, precision);
    return {
      x: Math.round(coord.x * multiplier) / multiplier,
      y: Math.round(coord.y * multiplier) / multiplier,
    };
  }

  /**
   * Calculate Manhattan distance (grid-based movement)
   */
  static manhattanDistance(coord1: Coordinate, coord2: Coordinate): number {
    return Math.abs(coord2.x - coord1.x) + Math.abs(coord2.y - coord1.y);
  }

  /**
   * Get all points in a line between two coordinates (Bresenham's algorithm)
   */
  static getLinePoints(from: Coordinate, to: Coordinate): Coordinate[] {
    const points: Coordinate[] = [];

    let x0 = Math.round(from.x);
    let y0 = Math.round(from.y);
    const x1 = Math.round(to.x);
    const y1 = Math.round(to.y);

    const dx = Math.abs(x1 - x0);
    const dy = Math.abs(y1 - y0);
    const sx = x0 < x1 ? 1 : -1;
    const sy = y0 < y1 ? 1 : -1;
    let err = dx - dy;

    while (true) {
      points.push({ x: x0, y: y0 });

      if (x0 === x1 && y0 === y1) break;

      const e2 = 2 * err;
      if (e2 > -dy) {
        err -= dy;
        x0 += sx;
      }
      if (e2 < dx) {
        err += dx;
        y0 += sy;
      }
    }

    return points;
  }

  /**
   * Get all coordinates within a radius (circle)
   */
  static getCoordinatesInRadius(center: Coordinate, radius: number): Coordinate[] {
    const coordinates: Coordinate[] = [];
    const minX = Math.floor(center.x - radius);
    const maxX = Math.ceil(center.x + radius);
    const minY = Math.floor(center.y - radius);
    const maxY = Math.ceil(center.y + radius);

    for (let x = minX; x <= maxX; x++) {
      for (let y = minY; y <= maxY; y++) {
        const point = { x, y };
        if (this.isWithinRadius(center, point, radius)) {
          coordinates.push(point);
        }
      }
    }

    return coordinates;
  }

  /**
   * Format coordinate for display
   */
  static formatCoordinate(coord: Coordinate, precision: number = 2): string {
    return `(${coord.x.toFixed(precision)}, ${coord.y.toFixed(precision)})`;
  }

  /**
   * Parse coordinate string like "(100, 200)" or "100,200"
   */
  static parseCoordinate(str: string): Coordinate | null {
    const cleaned = str.replace(/[()]/g, '').trim();
    const parts = cleaned.split(',').map((p) => parseFloat(p.trim()));

    if (parts.length === 2 && !isNaN(parts[0]) && !isNaN(parts[1])) {
      return { x: parts[0], y: parts[1] };
    }

    return null;
  }
}
