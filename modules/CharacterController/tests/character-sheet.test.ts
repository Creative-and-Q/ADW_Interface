import { CharacterSheetManager } from '../src/character-sheet';
import { ItemInput } from '../src/types';

describe('CharacterSheetManager', () => {
  describe('creation', () => {
    it('should create a blank character sheet', () => {
      const manager = new CharacterSheetManager('TestChar');
      const sheet = manager.getSheet();

      expect(sheet.name).toBe('TestChar');
      expect(sheet.items).toEqual([]);
      expect(sheet.proficiencies).toEqual([]);
    });

    it('should load existing character sheet', () => {
      const existing = new CharacterSheetManager('ExistingChar');
      existing.update({ race: 'elf', class: 'mage' });

      const loaded = new CharacterSheetManager('ExistingChar', existing.getSheet());
      const sheet = loaded.getSheet();

      expect(sheet.race).toBe('elf');
      expect(sheet.class).toBe('mage');
    });
  });

  describe('updates', () => {
    it('should update simple fields', () => {
      const manager = new CharacterSheetManager('TestChar');

      manager.update({
        race: 'dwarf',
        class: 'warrior',
        level: 5,
      });

      const sheet = manager.getSheet();
      expect(sheet.race).toBe('dwarf');
      expect(sheet.class).toBe('warrior');
      expect(sheet.level).toBe(5);
    });

    it('should merge arrays without duplicates', () => {
      const manager = new CharacterSheetManager('TestChar');

      manager.update({ proficiencies: ['swords', 'shields'] });
      manager.update({ proficiencies: ['shields', 'armor'] });

      const sheet = manager.getSheet();
      expect(sheet.proficiencies).toContain('swords');
      expect(sheet.proficiencies).toContain('shields');
      expect(sheet.proficiencies).toContain('armor');
      expect(sheet.proficiencies.length).toBe(3);
    });

    it('should merge objects', () => {
      const manager = new CharacterSheetManager('TestChar');

      manager.update({
        abilityScores: { strength: 16, dexterity: 14 },
      });

      manager.update({
        abilityScores: { constitution: 15 },
      });

      const sheet = manager.getSheet();
      expect(sheet.abilityScores?.strength).toBe(16);
      expect(sheet.abilityScores?.dexterity).toBe(14);
      expect(sheet.abilityScores?.constitution).toBe(15);
    });
  });

  describe('item management', () => {
    it('should add items to inventory', () => {
      const manager = new CharacterSheetManager('TestChar');

      const sword: ItemInput = {
        name: 'longsword',
        quantity: 1,
        equipped: true,
      };

      manager.update({ items: [sword] });

      const items = manager.getItems();
      expect(items).toHaveLength(1);
      expect(items[0].name).toBe('longsword');
    });

    it('should stack identical items', () => {
      const manager = new CharacterSheetManager('TestChar');

      manager.update({ items: [{ name: 'arrow', quantity: 10 }] });
      manager.update({ items: [{ name: 'arrow', quantity: 5 }] });

      const items = manager.getItems();
      expect(items).toHaveLength(1);
      expect(items[0].quantity).toBe(15);
    });

    it('should remove items', () => {
      const manager = new CharacterSheetManager('TestChar');

      manager.update({ items: [{ name: 'potion', quantity: 3 }] });
      manager.removeItem('potion', 1);

      const items = manager.getItems();
      expect(items[0].quantity).toBe(2);

      manager.removeItem('potion', 2);
      expect(manager.getItems()).toHaveLength(0);
    });

    it('should filter items', () => {
      const manager = new CharacterSheetManager('TestChar');

      manager.update({
        items: [
          { name: 'sword', quantity: 1, equipped: true },
          { name: 'shield', quantity: 1, equipped: true },
          { name: 'potion', quantity: 5, equipped: false },
        ],
      });

      const equipped = manager.getItems({ equipped: true });
      expect(equipped).toHaveLength(2);

      const notEquipped = manager.getItems({ equipped: false });
      expect(notEquipped).toHaveLength(1);
    });
  });

  describe('currency', () => {
    it('should add currency', () => {
      const manager = new CharacterSheetManager('TestChar');

      manager.addCurrency('gold', 50);
      manager.addCurrency('gold', 25);

      const sheet = manager.getSheet();
      expect(sheet.currency.gold).toBe(75);
    });
  });

  describe('conditions', () => {
    it('should add conditions', () => {
      const manager = new CharacterSheetManager('TestChar');

      manager.addCondition('poisoned');
      manager.addCondition('frightened');

      const sheet = manager.getSheet();
      expect(sheet.conditions).toContain('poisoned');
      expect(sheet.conditions).toContain('frightened');
    });

    it('should not add duplicate conditions', () => {
      const manager = new CharacterSheetManager('TestChar');

      manager.addCondition('poisoned');
      manager.addCondition('poisoned');

      const sheet = manager.getSheet();
      expect(sheet.conditions.filter((c) => c === 'poisoned')).toHaveLength(1);
    });

    it('should remove conditions', () => {
      const manager = new CharacterSheetManager('TestChar');

      manager.addCondition('poisoned');
      const removed = manager.removeCondition('poisoned');

      expect(removed).toBe(true);
      expect(manager.getSheet().conditions).toHaveLength(0);
    });
  });

  describe('utility methods', () => {
    it('should calculate ability modifiers', () => {
      expect(CharacterSheetManager.getAbilityModifier(10)).toBe(0);
      expect(CharacterSheetManager.getAbilityModifier(16)).toBe(3);
      expect(CharacterSheetManager.getAbilityModifier(8)).toBe(-1);
    });

    it('should calculate proficiency bonus', () => {
      expect(CharacterSheetManager.getProficiencyBonus(1)).toBe(2);
      expect(CharacterSheetManager.getProficiencyBonus(5)).toBe(3);
      expect(CharacterSheetManager.getProficiencyBonus(9)).toBe(4);
      expect(CharacterSheetManager.getProficiencyBonus(20)).toBe(6);
    });

    it('should generate summary', () => {
      const manager = new CharacterSheetManager('Thorin');
      manager.update({ race: 'dwarf', class: 'warrior', level: 5 });

      const summary = manager.getSummary();
      expect(summary).toContain('Thorin');
      expect(summary).toContain('dwarf');
      expect(summary).toContain('warrior');
      expect(summary).toContain('5');
    });
  });
});
