#!/usr/bin/env node
import * as readline from 'readline';
import axios from 'axios';
import * as dotenv from 'dotenv';

dotenv.config();

const API_URL = `http://localhost:${process.env.PORT || 3034}`;

interface ItemTemplate {
  id?: number;
  name: string;
  description?: string;
  item_type: string;
  item_subtype?: string;
  rarity?: string;
  weight?: number;
  base_value?: number;
  is_stackable?: boolean;
  max_stack_size?: number;
  damage_dice?: string;
  armor_class?: number;
  is_magical?: boolean;
  properties?: Record<string, unknown>;
}

interface Item {
  id?: number;
  item_template_id: number;
  unique_identifier: string;
  current_owner_type: string;
  current_owner_id?: string;
  x_coord?: number;
  y_coord?: number;
  poi_id?: number;
  custom_name?: string;
  quantity: number;
  condition_percent: number;
  is_equipped: boolean;
  template?: ItemTemplate;
}

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

function question(prompt: string): Promise<string> {
  return new Promise((resolve) => {
    rl.question(prompt, resolve);
  });
}

async function createTemplate() {
  console.log('\n=== Create Item Template ===');

  const name = await question('Name: ');
  const description = await question('Description: ');
  const item_type = await question('Type (weapon/armor/consumable/tool/treasure/quest_item/material/container/book/key/currency/misc): ');
  const rarity = await question('Rarity (common/uncommon/rare/epic/legendary/artifact) [common]: ') || 'common';
  const weightStr = await question('Weight [0]: ');
  const weight = weightStr ? parseFloat(weightStr) : 0;
  const valueStr = await question('Base Value [0]: ');
  const base_value = valueStr ? parseInt(valueStr) : 0;
  const stackableStr = await question('Is Stackable? (y/n) [n]: ');
  const is_stackable = stackableStr.toLowerCase() === 'y';

  const template: ItemTemplate = {
    name,
    description: description || undefined,
    item_type,
    rarity,
    weight,
    base_value,
    is_stackable,
  };

  if (is_stackable) {
    const maxStackStr = await question('Max Stack Size [99]: ');
    template.max_stack_size = maxStackStr ? parseInt(maxStackStr) : 99;
  }

  if (item_type === 'weapon') {
    template.damage_dice = await question('Damage Dice (e.g., 1d8): ') || undefined;
    const attackBonusStr = await question('Attack Bonus [0]: ');
    if (attackBonusStr) {
      template.properties = { attack_bonus: parseInt(attackBonusStr) };
    }
  }

  if (item_type === 'armor') {
    const acStr = await question('Armor Class: ');
    template.armor_class = acStr ? parseInt(acStr) : undefined;
  }

  const magicalStr = await question('Is Magical? (y/n) [n]: ');
  template.is_magical = magicalStr.toLowerCase() === 'y';

  try {
    const response = await axios.post(`${API_URL}/template`, template);
    console.log('\n✅ Template created successfully!');
    console.log(JSON.stringify(response.data.template, null, 2));
    return response.data.template;
  } catch (error) {
    console.error('❌ Error creating template:', error instanceof Error ? error.message : error);
  }
}

async function listTemplates() {
  console.log('\n=== Search Templates ===');

  const query = await question('Search query (leave empty for all): ');
  const item_type = await question('Filter by type (leave empty for all): ');
  const rarity = await question('Filter by rarity (leave empty for all): ');
  const limitStr = await question('Limit [50]: ');
  const limit = limitStr ? parseInt(limitStr) : 50;

  try {
    const params: Record<string, string> = { limit: limit.toString() };
    if (query) params.query = query;
    if (item_type) params.item_type = item_type;
    if (rarity) params.rarity = rarity;

    const response = await axios.get(`${API_URL}/templates`, { params });
    console.log(`\n📋 Found ${response.data.total} templates:`);
    response.data.templates.forEach((t: ItemTemplate) => {
      console.log(`  [${t.id}] ${t.name} (${t.item_type}, ${t.rarity}) - ${t.base_value}gp, ${t.weight}lbs`);
    });
  } catch (error) {
    console.error('❌ Error listing templates:', error instanceof Error ? error.message : error);
  }
}

async function createItem() {
  console.log('\n=== Create Item Instance ===');

  const templateIdStr = await question('Template ID: ');
  const template_id = parseInt(templateIdStr);
  const quantityStr = await question('Quantity [1]: ');
  const quantity = quantityStr ? parseInt(quantityStr) : 1;

  const ownerType = await question('Owner Type (character/poi/world) [world]: ') || 'world';
  let owner_id, x, y, poi_id;

  if (ownerType === 'character') {
    owner_id = await question('Character ID: ');
  } else {
    const xStr = await question('X coordinate: ');
    const yStr = await question('Y coordinate: ');
    x = xStr ? parseFloat(xStr) : undefined;
    y = yStr ? parseFloat(yStr) : undefined;

    if (ownerType === 'poi') {
      const poiIdStr = await question('POI ID: ');
      poi_id = poiIdStr ? parseInt(poiIdStr) : undefined;
    }
  }

  const custom_name = await question('Custom name (leave empty for default): ');

  try {
    const response = await axios.post(`${API_URL}/item`, {
      template_id,
      quantity,
      owner_type: ownerType,
      owner_id,
      x,
      y,
      poi_id,
      custom_name: custom_name || undefined,
    });
    console.log('\n✅ Item created successfully!');
    console.log(JSON.stringify(response.data.item, null, 2));
  } catch (error) {
    console.error('❌ Error creating item:', error instanceof Error ? error.message : error);
  }
}

async function getItem() {
  console.log('\n=== Get Item ===');

  const idStr = await question('Item ID: ');
  const id = parseInt(idStr);

  try {
    const response = await axios.get(`${API_URL}/item/${id}`);
    console.log('\n📦 Item Details:');
    console.log(JSON.stringify(response.data.item, null, 2));
  } catch (error) {
    console.error('❌ Error getting item:', error instanceof Error ? error.message : error);
  }
}

async function pickupItem() {
  console.log('\n=== Pickup Item ===');

  const idStr = await question('Item ID: ');
  const id = parseInt(idStr);
  const character_id = await question('Character ID: ');
  const quantityStr = await question('Quantity (leave empty for all): ');
  const quantity = quantityStr ? parseInt(quantityStr) : undefined;

  try {
    const response = await axios.post(`${API_URL}/item/${id}/pickup`, {
      character_id,
      quantity,
    });
    console.log('\n✅ Item picked up successfully!');
    console.log(JSON.stringify(response.data.item, null, 2));
  } catch (error) {
    console.error('❌ Error picking up item:', error instanceof Error ? error.message : error);
  }
}

async function dropItem() {
  console.log('\n=== Drop Item ===');

  const idStr = await question('Item ID: ');
  const id = parseInt(idStr);
  const character_id = await question('Character ID: ');
  const xStr = await question('X coordinate: ');
  const x = parseFloat(xStr);
  const yStr = await question('Y coordinate: ');
  const y = parseFloat(yStr);
  const poiIdStr = await question('POI ID (leave empty for none): ');
  const poi_id = poiIdStr ? parseInt(poiIdStr) : undefined;
  const quantityStr = await question('Quantity (leave empty for all): ');
  const quantity = quantityStr ? parseInt(quantityStr) : undefined;

  try {
    const response = await axios.post(`${API_URL}/item/${id}/drop`, {
      character_id,
      x,
      y,
      poi_id,
      quantity,
    });
    console.log('\n✅ Item dropped successfully!');
    console.log(JSON.stringify(response.data.item, null, 2));
  } catch (error) {
    console.error('❌ Error dropping item:', error instanceof Error ? error.message : error);
  }
}

async function tradeItem() {
  console.log('\n=== Trade Item ===');

  const idStr = await question('Item ID: ');
  const id = parseInt(idStr);
  const from_character_id = await question('From Character ID: ');
  const to_character_id = await question('To Character ID: ');
  const quantityStr = await question('Quantity (leave empty for all): ');
  const quantity = quantityStr ? parseInt(quantityStr) : undefined;

  try {
    const response = await axios.post(`${API_URL}/item/${id}/trade`, {
      from_character_id,
      to_character_id,
      quantity,
    });
    console.log('\n✅ Item traded successfully!');
    console.log(JSON.stringify(response.data.item, null, 2));
  } catch (error) {
    console.error('❌ Error trading item:', error instanceof Error ? error.message : error);
  }
}

async function getInventory() {
  console.log('\n=== Get Character Inventory ===');

  const character_id = await question('Character ID: ');

  try {
    const response = await axios.get(`${API_URL}/inventory/${character_id}`);
    console.log(`\n🎒 Inventory for ${character_id}:`);
    console.log(`Total Weight: ${response.data.totalWeight} lbs`);
    console.log(`Total Value: ${response.data.totalValue} gp`);
    console.log('\nEquipped Items:');
    response.data.equipped.forEach((item: Item) => {
      console.log(`  [${item.id}] ${item.custom_name || item.template?.name} x${item.quantity}`);
    });
    console.log('\nInventory Items:');
    response.data.items.forEach((item: Item) => {
      console.log(`  [${item.id}] ${item.custom_name || item.template?.name} x${item.quantity}`);
    });
  } catch (error) {
    console.error('❌ Error getting inventory:', error instanceof Error ? error.message : error);
  }
}

async function getNearbyItems() {
  console.log('\n=== Get Nearby Items ===');

  const xStr = await question('X coordinate: ');
  const x = parseFloat(xStr);
  const yStr = await question('Y coordinate: ');
  const y = parseFloat(yStr);
  const radiusStr = await question('Radius [50]: ');
  const radius = radiusStr ? parseFloat(radiusStr) : 50;

  try {
    const response = await axios.get(`${API_URL}/items/nearby`, {
      params: { x, y, radius },
    });
    console.log(`\n📍 Found ${response.data.items.length} items nearby:`);
    response.data.items.forEach((item: Item) => {
      console.log(`  [${item.id}] ${item.custom_name || item.template?.name} at (${item.x_coord}, ${item.y_coord})`);
    });
  } catch (error) {
    console.error('❌ Error getting nearby items:', error instanceof Error ? error.message : error);
  }
}

async function getItemHistory() {
  console.log('\n=== Get Item History ===');

  const idStr = await question('Item ID: ');
  const id = parseInt(idStr);
  const limitStr = await question('Limit [100]: ');
  const limit = limitStr ? parseInt(limitStr) : 100;

  try {
    const response = await axios.get(`${API_URL}/item/${id}/history`, {
      params: { limit },
    });
    console.log(`\n📜 Movement History for Item ${id}:`);
    response.data.history.forEach((h: any) => {
      const from = h.from_owner_type ? `${h.from_owner_type}:${h.from_owner_id || 'world'}` : 'spawn';
      const to = h.to_owner_type ? `${h.to_owner_type}:${h.to_owner_id || 'world'}` : 'destroyed';
      console.log(`  ${h.moved_at} - ${h.movement_type}: ${from} → ${to} (qty: ${h.quantity})`);
    });
  } catch (error) {
    console.error('❌ Error getting item history:', error instanceof Error ? error.message : error);
  }
}

async function getStats() {
  try {
    const response = await axios.get(`${API_URL}/stats`);
    console.log('\n📊 ItemController Statistics:');
    console.log(JSON.stringify(response.data.stats, null, 2));
  } catch (error) {
    console.error('❌ Error getting stats:', error instanceof Error ? error.message : error);
  }
}

async function mainMenu() {
  console.log('\n=== ItemController CLI ===');
  console.log('1. Create Item Template');
  console.log('2. List Templates');
  console.log('3. Create Item Instance');
  console.log('4. Get Item');
  console.log('5. Pickup Item');
  console.log('6. Drop Item');
  console.log('7. Trade Item');
  console.log('8. Get Character Inventory');
  console.log('9. Get Nearby Items');
  console.log('10. Get Item History');
  console.log('11. Get Statistics');
  console.log('0. Exit');

  const choice = await question('\nChoice: ');

  switch (choice) {
    case '1':
      await createTemplate();
      break;
    case '2':
      await listTemplates();
      break;
    case '3':
      await createItem();
      break;
    case '4':
      await getItem();
      break;
    case '5':
      await pickupItem();
      break;
    case '6':
      await dropItem();
      break;
    case '7':
      await tradeItem();
      break;
    case '8':
      await getInventory();
      break;
    case '9':
      await getNearbyItems();
      break;
    case '10':
      await getItemHistory();
      break;
    case '11':
      await getStats();
      break;
    case '0':
      console.log('Goodbye!');
      rl.close();
      process.exit(0);
    default:
      console.log('Invalid choice');
  }

  await mainMenu();
}

async function main() {
  console.log('📦 ItemController CLI');
  console.log(`Connecting to ${API_URL}...`);

  try {
    const response = await axios.get(`${API_URL}/health`);
    console.log('✅ Connected to ItemController');
    console.log(`Status: ${response.data.status}`);
  } catch (error) {
    console.error('❌ Cannot connect to ItemController. Is the server running?');
    console.error('Start the server with: npm start');
    process.exit(1);
  }

  await mainMenu();
}

main();
