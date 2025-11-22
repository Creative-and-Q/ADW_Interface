import { ItemControllerClient } from '../src/client.js';

describe('ItemController Client Unit Tests', () => {
  let client: ItemControllerClient;

  beforeAll(() => {
    client = new ItemControllerClient('http://localhost:3034');
  });

  describe('Client Initialization', () => {
    it('should create client with default URL', () => {
      const defaultClient = new ItemControllerClient();
      expect(defaultClient).toBeDefined();
    });

    it('should create client with custom URL', () => {
      const customClient = new ItemControllerClient('http://custom:8080');
      expect(customClient).toBeDefined();
    });
  });

  describe('Request Creation', () => {
    it('should have createItem method', () => {
      expect(typeof client.createItem).toBe('function');
    });

    it('should have getItem method', () => {
      expect(typeof client.getItem).toBe('function');
    });

    it('should have createTemplate method', () => {
      expect(typeof client.createTemplate).toBe('function');
    });

    it('should have getTemplate method', () => {
      expect(typeof client.getTemplate).toBe('function');
    });

    it('should have pickupItem method', () => {
      expect(typeof client.pickupItem).toBe('function');
    });

    it('should have dropItem method', () => {
      expect(typeof client.dropItem).toBe('function');
    });

    it('should have equipItem method', () => {
      expect(typeof client.equipItem).toBe('function');
    });

    it('should have unequipItem method', () => {
      expect(typeof client.unequipItem).toBe('function');
    });

    it('should have getInventory method', () => {
      expect(typeof client.getInventory).toBe('function');
    });

    it('should have healthCheck method', () => {
      expect(typeof client.healthCheck).toBe('function');
    });
  });
});
