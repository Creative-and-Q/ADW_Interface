import { CharacterSheet, CharacterSheetSchema, CharacterSheetUpdate, Item, ItemInput, ItemSchema } from './types.js';

/**
 * CharacterSheet class with intelligent merging and validation
 */
export class CharacterSheetManager {
  private sheet: CharacterSheet;

  /**
   * Creates a new character sheet or loads existing one
   */
  constructor(name: string, existing?: CharacterSheet) {
    if (existing) {
      this.sheet = CharacterSheetSchema.parse(existing);
    } else {
      // Create blank character sheet
      this.sheet = CharacterSheetSchema.parse({
        name,
        items: [],
        currency: {},
        proficiencies: [],
        languages: [],
        spells: [],
        features: [],
        conditions: [],
        relationships: {},
        allies: [],
        enemies: [],
        organizations: [],
        notes: [],
        personalityTraits: [],
        ideals: [],
        bonds: [],
        flaws: [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
    }
  }

  /**
   * Get the current character sheet
   */
  getSheet(): CharacterSheet {
    return { ...this.sheet };
  }

  /**
   * Update character sheet with intelligent merging
   * Arrays are merged (not replaced), numbers/strings are replaced
   */
  update(updates: CharacterSheetUpdate): CharacterSheet {
    // Update timestamp
    const updatedData: CharacterSheetUpdate = {
      ...updates,
      updatedAt: new Date().toISOString(),
    };

    // Merge simple fields
    Object.keys(updatedData).forEach((key) => {
      const value = updatedData[key as keyof CharacterSheetUpdate];

      if (value === undefined || value === null) return;

      // Handle arrays - merge instead of replace
      if (Array.isArray(value)) {
        const currentArray = this.sheet[key as keyof CharacterSheet] as unknown[];
        if (Array.isArray(currentArray)) {
          // Merge arrays, avoiding duplicates for simple types
          if (key === 'items') {
            this.mergeItems(value as ItemInput[]);
          } else {
            const merged = [...currentArray, ...value];
            try {
              // Try to deduplicate by JSON stringification
              const stringified = merged.map(v => JSON.stringify(v));
              const uniqueStrings = Array.from(new Set(stringified));
              const unique = uniqueStrings.map(s => {
                try {
                  return JSON.parse(s);
                } catch (parseError) {
                  console.error('Failed to parse deduplicated value:', s);
                  // Return the original value if parsing fails
                  return merged[stringified.indexOf(s)];
                }
              });
              (this.sheet as Record<string, unknown>)[key] = unique;
            } catch (error) {
              console.error('Failed to deduplicate array for key:', key, error);
              // Fallback: just append without deduplication
              (this.sheet as Record<string, unknown>)[key] = merged;
            }
          }
        } else {
          (this.sheet as Record<string, unknown>)[key] = value;
        }
      }
      // Handle objects - deep merge
      else if (typeof value === 'object' && value !== null) {
        const currentValue = this.sheet[key as keyof CharacterSheet];
        if (typeof currentValue === 'object' && currentValue !== null) {
          (this.sheet as Record<string, unknown>)[key] = {
            ...currentValue,
            ...value,
          };
        } else {
          (this.sheet as Record<string, unknown>)[key] = value;
        }
      }
      // Handle primitives - replace
      else {
        (this.sheet as Record<string, unknown>)[key] = value;
      }
    });

    // Validate updated sheet
    this.sheet = CharacterSheetSchema.parse(this.sheet);
    return this.getSheet();
  }

  /**
   * Merge items intelligently - stack quantities for same items
   * Converts ItemInput to Item with defaults applied
   */
  private mergeItems(newItems: ItemInput[]): void {
    newItems.forEach((newItemInput) => {
      // Parse through schema to apply defaults
      const newItem = ItemSchema.parse(newItemInput);

      const existingIndex = this.sheet.items.findIndex(
        (item) => item.name.toLowerCase() === newItem.name.toLowerCase()
      );

      if (existingIndex >= 0) {
        // Item exists - update quantity
        this.sheet.items[existingIndex].quantity += newItem.quantity;

        // Update other properties if provided
        if (newItem.description) {
          this.sheet.items[existingIndex].description = newItem.description;
        }
        if (newItem.equipped !== undefined) {
          this.sheet.items[existingIndex].equipped = newItem.equipped;
        }
        if (newItem.magical !== undefined) {
          this.sheet.items[existingIndex].magical = newItem.magical;
        }
        if (newItem.attunement !== undefined) {
          this.sheet.items[existingIndex].attunement = newItem.attunement;
        }
      } else {
        // New item - add to inventory
        this.sheet.items.push(newItem);
      }
    });
  }

  /**
   * Remove item from inventory
   */
  removeItem(itemName: string, quantity = 1): boolean {
    const index = this.sheet.items.findIndex(
      (item) => item.name.toLowerCase() === itemName.toLowerCase()
    );

    if (index < 0) return false;

    this.sheet.items[index].quantity -= quantity;

    if (this.sheet.items[index].quantity <= 0) {
      this.sheet.items.splice(index, 1);
    }

    this.sheet.updatedAt = new Date().toISOString();
    return true;
  }

  /**
   * Add or update currency
   */
  addCurrency(type: keyof typeof this.sheet.currency, amount: number): void {
    const current = this.sheet.currency[type] || 0;
    this.sheet.currency[type] = current + amount;
    this.sheet.updatedAt = new Date().toISOString();
  }

  /**
   * Get items by filter
   */
  getItems(filter?: { equipped?: boolean; magical?: boolean }): Item[] {
    let items = this.sheet.items;

    if (filter?.equipped !== undefined) {
      items = items.filter((item) => item.equipped === filter.equipped);
    }
    if (filter?.magical !== undefined) {
      items = items.filter((item) => item.magical === filter.magical);
    }

    return items;
  }

  /**
   * Add condition
   */
  addCondition(condition: string): void {
    if (!this.sheet.conditions.includes(condition)) {
      this.sheet.conditions.push(condition);
      this.sheet.updatedAt = new Date().toISOString();
    }
  }

  /**
   * Remove condition
   */
  removeCondition(condition: string): boolean {
    const index = this.sheet.conditions.indexOf(condition);
    if (index >= 0) {
      this.sheet.conditions.splice(index, 1);
      this.sheet.updatedAt = new Date().toISOString();
      return true;
    }
    return false;
  }

  /**
   * Get character name
   */
  getName(): string {
    return this.sheet.name;
  }

  /**
   * Get character level
   */
  getLevel(): number | undefined {
    return this.sheet.level;
  }

  /**
   * Calculate ability modifier
   */
  static getAbilityModifier(score: number): number {
    return Math.floor((score - 10) / 2);
  }

  /**
   * Get proficiency bonus based on level
   */
  static getProficiencyBonus(level: number): number {
    return Math.ceil(level / 4) + 1;
  }

  /**
   * Export sheet as JSON
   */
  toJSON(): CharacterSheet {
    return this.getSheet();
  }

  /**
   * Get character summary
   */
  getSummary(): string {
    const parts: string[] = [this.sheet.name];

    if (this.sheet.level) parts.push(`Level ${this.sheet.level}`);
    if (this.sheet.race) parts.push(this.sheet.race);
    if (this.sheet.class) parts.push(this.sheet.class);

    return parts.join(' ');
  }
}
