import * as fs from 'fs/promises';
import * as path from 'path';
import { CharacterSheet, CharacterSheetSchema } from './types.js';

/**
 * Persistent storage for character sheets using JSON files
 * Each character gets their own file
 */
export class CharacterStorage {
  private readonly storageDir: string;

  constructor(storageDir = './data/characters') {
    this.storageDir = storageDir;
  }

  /**
   * Ensure storage directory exists
   */
  private async ensureDirectory(): Promise<void> {
    try {
      await fs.mkdir(this.storageDir, { recursive: true });
    } catch (error) {
      throw new Error(
        `Failed to create storage directory: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * Get file path for a character
   */
  private getFilePath(characterName: string): string {
    const sanitized = characterName.toLowerCase().replace(/[^a-z0-9-_]/g, '_');
    return path.join(this.storageDir, `${sanitized}.json`);
  }

  /**
   * Save character sheet
   */
  async save(character: CharacterSheet): Promise<void> {
    await this.ensureDirectory();

    const filePath = this.getFilePath(character.name);

    try {
      await fs.writeFile(filePath, JSON.stringify(character, null, 2), 'utf-8');
    } catch (error) {
      throw new Error(
        `Failed to save character ${character.name}: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * Load character sheet
   */
  async load(characterName: string): Promise<CharacterSheet | null> {
    const filePath = this.getFilePath(characterName);

    try {
      const data = await fs.readFile(filePath, 'utf-8');
      const parsed = JSON.parse(data);
      return CharacterSheetSchema.parse(parsed);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return null; // Character doesn't exist
      }
      throw new Error(
        `Failed to load character ${characterName}: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * Check if character exists
   */
  async exists(characterName: string): Promise<boolean> {
    const filePath = this.getFilePath(characterName);

    try {
      await fs.access(filePath);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Delete character
   */
  async delete(characterName: string): Promise<boolean> {
    const filePath = this.getFilePath(characterName);

    try {
      await fs.unlink(filePath);
      return true;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return false;
      }
      throw new Error(
        `Failed to delete character ${characterName}: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * List all characters
   */
  async listAll(): Promise<string[]> {
    await this.ensureDirectory();

    try {
      const files = await fs.readdir(this.storageDir);
      return files
        .filter((file) => file.endsWith('.json'))
        .map((file) => file.replace('.json', '').replace(/_/g, ' '));
    } catch (error) {
      throw new Error(
        `Failed to list characters: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * Search characters by name (fuzzy match)
   */
  async search(query: string): Promise<string[]> {
    const all = await this.listAll();
    const lowerQuery = query.toLowerCase();

    return all.filter((name) => name.toLowerCase().includes(lowerQuery));
  }

  /**
   * Get storage statistics
   */
  async getStats(): Promise<{ totalCharacters: number; storageDir: string }> {
    const characters = await this.listAll();
    return {
      totalCharacters: characters.length,
      storageDir: this.storageDir,
    };
  }
}
