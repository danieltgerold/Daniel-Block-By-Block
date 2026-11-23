// Records the mining rules on the JS: break speed (miningProgress), who can harvest a block (canHarvest),
// what a block drops (blockDrops, including random ranges) and tool wear. Each table crosses every block
// with every relevant held item and condition so Java is checked everywhere, not on samples.
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { BLOCK_TYPES, blockDrops } from '../../src/block-types.js';
import { miningProgress, canHarvest } from '../../src/breaking-properties.js';
import { ITEMS, PlayerInventory } from '../../src/inventory.js';
import { damageMainTool, miningToolWear } from '../../src/tool-use.js';
import { formatNumber } from './format.mjs';

const toolIds = () => [...ITEMS.values()].filter(i => i.tool).map(i => i.id);
const HELD = () => ['-', ...toolIds(), 'stick', 'stone', 'raw.porkchop'];
const itemOf = id => id === '-' ? undefined : ITEMS.get(id);
const dropsText = drops => drops.length ? drops.map(d => `${d.id}:${d.count}`).join(';') : '-';

export function progressRows() {
  const rows = [];
  for (const block of BLOCK_TYPES.values()) for (const held of HELD()) for (const grounded of [1, 0]) for (const underwater of [0, 1]) {
    const item = itemOf(held);
    rows.push([block.id, held, grounded, underwater, Number(canHarvest(block, item)),
      formatNumber(miningProgress(block, item, { grounded: Boolean(grounded), underwater: Boolean(underwater) }))].join(','));
  }
  return rows;
}

export function dropRows() {
  const rows = [];
  const tools = ['-', 'wood.pickaxe', 'stone.pickaxe', 'iron.pickaxe', 'diamond.pickaxe', 'shears', 'iron.sword', 'wood.axe', 'wood.shovel', 'stick'];
  for (const block of BLOCK_TYPES.values()) {
    const slab = block.collisionShape === 'slab';
    for (const mode of ['survival', 'creative']) for (const held of tools) for (const type of slab ? ['bottom', 'top', 'double'] : ['-'])
      for (const random of [0, 0.15, 0.5, 0.85, 0.999999]) {
        const context = { gameMode: mode, tool: held === '-' ? null : { id: held, count: 1 }, random: () => random };
        const state = type === '-' ? {} : { type };
        rows.push([block.id, mode, held, type, formatNumber(random), dropsText(blockDrops({ id: block.id, definition: block, state }, context))].join(','));
      }
  }
  return rows;
}

export function wearRows() {
  const rows = [];
  const blocks = ['stone', 'dirt', 'oak.leaves', 'bedrock', 'oak.log', 'glass', 'water', 'sand', 'oak.door', 'coal.ore'];
  for (const toolId of [...toolIds(), 'stick', 'stone']) for (const blockId of blocks) for (const mode of ['survival', 'creative'])
    for (const damage of [0, 1, 'near2', 'near1', 'edge', 'over']) {
      const item = ITEMS.get(toolId);
      const durability = item.durability ?? 0;
      const worn = damage === 'edge' ? durability : damage === 'over' ? durability + 1 : damage === 'near1' ? Math.max(0, durability - 1) : damage === 'near2' ? Math.max(0, durability - 2) : damage;
      const inv = new PlayerInventory({});
      inv.slots[0] = worn && item.durability ? { id: toolId, count: 1, damage: worn } : { id: toolId, count: 1 };
      const block = { id: blockId, definition: BLOCK_TYPES.get(blockId), state: {} };
      const controller = { gameMode: mode, inventory: inv };
      miningToolWear(controller, block);
      const after = inv.slots[0];
      rows.push([toolId, blockId, mode, worn, after ? `${after.damage ?? 0}` : 'broken'].join(','));
    }
  for (const amount of [0, -1, 1, 5]) {
    const inv = new PlayerInventory({}); inv.slots[0] = { id: 'iron.pickaxe', count: 1, damage: 248 };
    const ret = damageMainTool({ gameMode: 'survival', inventory: inv }, amount);
    rows.push(['iron.pickaxe', `direct${amount}`, 'survival', 248, `${ret ? 'y' : 'n'}${inv.slots[0] ? inv.slots[0].damage ?? 0 : 'broken'}`].join(','));
  }
  return rows;
}

export function generateMining(outDir) {
  const dir = join(outDir, 'mining');
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'progress.csv'), ['block,held,grounded,underwater,harvest,progress', ...progressRows()].join('\n') + '\n');
  writeFileSync(join(dir, 'drops.csv'), ['block,mode,held,slab,random,drops', ...dropRows()].join('\n') + '\n');
  writeFileSync(join(dir, 'wear.csv'), ['tool,block,mode,damage,after', ...wearRows()].join('\n') + '\n');
}
