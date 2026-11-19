import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { ITEMS, PlayerInventory, CRAFT_START as C, OFFHAND } from '../src/inventory.js';
import { RecipeRegistry, RECIPES, registerIngredientGroup } from '../src/recipes.js';
import { BLOCK_TYPES, blockDrops } from '../src/block-types.js';
import { MovementController } from '../src/movement.js';
import { VoxelWorld } from '../src/voxel-world.js';
import { getFaceTexture, getBlockMaterials } from '../src/block-assets.js';
import { createItemMesh, setItemAppearance } from '../src/item-assets.js';
import { DroppedItemRenderer } from '../src/dropped-item-renderer.js';
import { ChatService, LocalPlayerProfile } from '../src/chat.js';
import { commandCompletions } from '../src/chat-commands.js';
const stack = (id, count = 1) => ({ id, count });
const grid = size => Array(size * size).fill(null);
const snapshot = i => JSON.stringify({ slots: i.slots, cursor: i.cursor });
function inventory(size = 2) { const i = new PlayerInventory(); i.crafting.begin(size); return i; }

test('Pine/table definitions, give, cutout persistence, log faces and reusable flat Stick models integrate with existing items', () => {
  for (const id of ['pine.log', 'pine.planks', 'pine.leaves', 'crafting.table', 'stick']) {
    const c = new MovementController(new VoxelWorld({ depth: 3 })), service = new ChatService({ controller: c, profile: new LocalPlayerProfile(null, () => 'craft-test') });
    service.submit(`/give ${id} 130`); assert.deepEqual(c.inventory.slots.slice(0, 3).map(s => s.count), [64, 64, 2]);
    assert.ok(commandCompletions('/give ').includes(`/give ${id} `)); assert.ok(ITEMS.get(id).icon);
  }
  for (const id of ['pine.log', 'pine.planks', 'pine.leaves', 'crafting.table']) {
    assert.equal(BLOCK_TYPES.get(id).maxStack, 64); assert.equal(BLOCK_TYPES.get(id).solid, true);
  }
  assert.equal(BLOCK_TYPES.get('pine.leaves').defaultState.persistent, true);
  assert.equal(BLOCK_TYPES.get('pine.leaves').opaque, false); assert.deepEqual(blockDrops({ definition: BLOCK_TYPES.get('pine.leaves') }), []);
  const log = createItemMesh(.375, 'pine.log'); assert.equal(log.material[2].map, getFaceTexture('pine.end')); assert.equal(log.material[0].map, getFaceTexture('pine.bark'));
  const table = getBlockMaterials('crafting.table'); assert.equal(table[2].map, getFaceTexture('crafting.top')); assert.equal(table[0].map, getFaceTexture('crafting.side'));
  assert.deepEqual(blockDrops({ definition: BLOCK_TYPES.get('crafting.table') }), [stack('crafting.table')]);
  const stick = createItemMesh(.375, 'stick'), other = createItemMesh(.375, 'stick');
  assert.equal(ITEMS.get('stick').block, false); assert.equal(stick.geometry.type, 'BufferGeometry');
  assert.equal(stick.geometry.boundingBox.max.z - stick.geometry.boundingBox.min.z, .375 / 16);
  assert.equal(stick.geometry, other.geometry); assert.equal(stick.material, other.material);
  assert.equal(stick.material.alphaTest, .5); assert.equal(stick.material.side, THREE.FrontSide);
  setItemAppearance(stick, 'pine.log'); assert.equal(stick.geometry.type, 'BoxGeometry');
  const c = new MovementController(new VoxelWorld({ depth: 3 })), renderer = new DroppedItemRenderer(new THREE.Scene());
  const pile = c.drops.spawn('stick', 4, { x: 10, y: 1, z: 10 }); renderer.update(c.drops);
  assert.equal(renderer.meshes.get(pile.id).children[0].geometry.type, 'BufferGeometry');
});

test('initial recipes match either grid, all offsets, mixed planks and species-specific logs; rotations/extras are rejected', () => {
  for (const size of [2, 3]) {
    for (const wood of ['oak', 'pine']) for (let index = 0; index < size * size; index++) {
      const g = grid(size); g[index] = stack(`${wood}.log`, 7);
      assert.deepEqual(RECIPES.match(g, size, ITEMS).recipe.output, stack(`${wood}.planks`, 4));
    }
    for (let y = 0; y < size - 1; y++) for (let x = 0; x < size; x++) {
      const g = grid(size); g[y * size + x] = stack('oak.planks'); g[(y + 1) * size + x] = stack('pine.planks');
      assert.equal(RECIPES.match(g, size, ITEMS).recipe.id, 'sticks');
      g[(y + 1) * size + x] = null; g[y * size + (x + 1) % size] = stack('pine.planks');
      assert.equal(RECIPES.match(g, size, ITEMS), null, 'Horizontal planks are not a rotated stick recipe');
    }
    for (let y = 0; y < size - 1; y++) for (let x = 0; x < size - 1; x++) {
      const g = grid(size); for (const [n, at] of [y * size + x, y * size + x + 1, (y + 1) * size + x, (y + 1) * size + x + 1].entries()) g[at] = stack(n % 2 ? 'oak.planks' : 'pine.planks');
      assert.equal(RECIPES.match(g, size, ITEMS).recipe.id, 'crafting.table');
    }
    const extra = grid(size); extra[0] = stack('oak.log'); extra[1] = stack('dirt'); assert.equal(RECIPES.match(extra, size, ITEMS), null);
  }
});

test('recipe definitions support holes, horizontal-only mirroring, opt-out mirrors, 3x3 limits and overlapping shapeless groups', () => {
  const r = new RecipeRegistry();
  const def = { id: 'test.pattern', type: 'shaped', pattern: ['AB', 'A '], key: { A: 'oak.planks', B: 'pine.planks' }, output: stack('stone') };
  r.register(def);
  const mirrored = [stack('pine.planks'), stack('oak.planks'), null, stack('oak.planks')];
  assert.ok(r.match(mirrored, 2, ITEMS));
  const noMirror = new RecipeRegistry(); noMirror.register({ ...def, mirror: false }); assert.equal(noMirror.match(mirrored, 2, ITEMS), null);
  const rotated = [stack('oak.planks'), stack('oak.planks'), null, stack('pine.planks')]; assert.equal(r.match(rotated, 2, ITEMS), null);
  mirrored[2] = stack('dirt'); assert.equal(r.match(mirrored, 2, ITEMS), null);
  r.register({ id: 'test.large', type: 'shaped', pattern: ['AAA'], key: { A: 'stone' }, output: stack('dirt') });
  assert.ok(!r.forGrid(2).some(x => x.id === 'test.large')); assert.ok(r.forGrid(3).some(x => x.id === 'test.large'));
  const s = new RecipeRegistry(); s.register({ id: 'test.overlap', type: 'shapeless', ingredients: [{ group: 'planks' }, 'oak.planks'], output: stack('stick') });
  assert.ok(s.match([stack('oak.planks'), null, stack('pine.planks'), null], 2, ITEMS));
  assert.equal(s.match([stack('pine.planks'), null, stack('pine.planks'), null], 2, ITEMS), null);
  registerIngredientGroup('test.logs', { tag: 'wood.logs' });
  const counts = new RecipeRegistry(); counts.register({ id: 'test.cost', type: 'shapeless', ingredients: [{ group: 'test.logs', count: 2 }], output: stack('stick') });
  assert.equal(counts.match([stack('pine.log'), null, null, null], 2, ITEMS), null);
  assert.equal(counts.match([stack('pine.log', 2), null, null, null], 2, ITEMS).consume[0].count, 2);
});

test('manual output is only a preview; full/mismatched cursors cannot consume, and complete batches consume exact inputs in either mode', () => {
  for (const mode of ['survival', 'creative']) {
    const c = new MovementController(new VoxelWorld({ depth: 3 })); c.setGameMode(mode); const i = c.inventory; i.crafting.begin();
    i.slots[C] = stack('pine.log', 2); i.changed(); assert.deepEqual(i.crafting.output, stack('pine.planks', 4));
    assert.equal(i.slots[50], undefined); i.cursor = stack('dirt'); const before = snapshot(i);
    assert.equal(i.crafting.take(), 0); assert.equal(snapshot(i), before);
    i.cursor = stack('pine.planks', 62); assert.equal(i.crafting.take(), 0); assert.equal(i.slots[C].count, 2);
    i.cursor = null; assert.equal(i.crafting.take(), 1); assert.deepEqual(i.cursor, stack('pine.planks', 4)); assert.equal(i.slots[C].count, 1);
    assert.equal(i.crafting.take(), 1); assert.equal(i.cursor.count, 8); assert.equal(i.slots[C], null); assert.equal(i.crafting.output, null);
    assert.equal(i.crafting.take(), 0);
  }
});

test('shift-output stops before a partial batch and repeatedly crafts complete stacks when there is room', () => {
  const i = inventory(); for (let s = 0; s < 36; s++) i.slots[s] = stack('dirt', 64);
  i.slots[0] = stack('stick', 62); i.slots[C] = stack('oak.planks', 2); i.slots[C + 2] = stack('pine.planks', 2); i.changed();
  assert.equal(i.crafting.take({ destination: 'inventory', repeat: true }), 0); assert.equal(i.slots[C].count, 2);
  i.slots[0].count = 60; assert.equal(i.crafting.take({ destination: 'inventory', repeat: true }), 1);
  assert.equal(i.slots[0].count, 64); assert.equal(i.slots[C].count, 1); assert.equal(i.slots[C + 2].count, 1);
  const logs = inventory(3); logs.slots[C + 8] = stack('oak.log', 64); logs.changed();
  assert.equal(logs.crafting.take({ destination: 'inventory', repeat: true }), 64);
  assert.deepEqual(logs.slots.slice(0, 4).map(s => s.count), [64, 64, 64, 64]); assert.equal(logs.slots[C + 8], null);
  const table = inventory();
  for (const [n, amount] of [2, 1, 2, 1].entries()) table.slots[C + n] = stack('oak.planks', amount);
  table.changed(); assert.equal(table.crafting.take({ destination: 'inventory', repeat: true }), 1);
  assert.equal(table.slots[0].id, 'crafting.table'); assert.equal(table.crafting.output.id, 'stick', 'A new recipe needs a new click');
});

test('book fills real mixed ingredients once or to the maximum, excludes armor/offhand and leaves missing previews non-owning', () => {
  const i = inventory(); i.slots[0] = stack('oak.planks'); i.slots[9] = stack('pine.planks');
  assert.equal(i.crafting.fill('sticks').ok, true); assert.deepEqual(i.crafting.grid.filter(Boolean).map(s => s.id), ['oak.planks', 'pine.planks']);
  assert.equal(i.slots[0], null); assert.equal(i.slots[9], null); assert.equal(i.cursor, null); assert.deepEqual(i.crafting.output, stack('stick', 4));
  const many = inventory(); many.slots[0] = stack('oak.planks'); many.slots[1] = stack('pine.planks', 64); many.slots[2] = stack('pine.planks', 63);
  const plan = many.crafting.fill('sticks', true); assert.equal(plan.crafts, 63);
  assert.deepEqual(many.crafting.grid.filter(Boolean), [stack('pine.planks', 63), stack('pine.planks', 63)]);
  assert.equal(many.crafting.grid.filter(Boolean).reduce((n, s) => n + s.count, 0), 126); assert.equal(many.cursor, null);
  const missing = inventory(); missing.slots[OFFHAND] = stack('oak.planks', 64); missing.slots[36] = stack('pine.planks', 64);
  assert.equal(missing.crafting.canMake(RECIPES.recipes.get('sticks')), false);
  const before = snapshot(missing); assert.equal(missing.crafting.fill('sticks').ok, false); assert.equal(snapshot(missing), before);
  assert.ok(missing.crafting.ghost().filter(Boolean).every(x => x.missing)); assert.equal(missing.crafting.output, null);
});

test('book rearrangement is atomic with a full inventory, can reuse existing inputs and frees space only when a safe plan exists', () => {
  const i = inventory(); for (let s = 0; s < 36; s++) i.slots[s] = stack('dirt', 64);
  i.slots[0] = stack('oak.log', 64); i.slots[C] = stack('dirt', 64); i.changed(); const before = snapshot(i);
  const failed = i.crafting.fill('oak.planks'); assert.equal(failed.ok, false); assert.match(failed.reason, /space/); assert.equal(snapshot(i), before);
  const full = i.crafting.fill('oak.planks', true); assert.equal(full.ok, true); assert.equal(full.crafts, 64);
  assert.deepEqual(i.slots[C], stack('oak.log', 64)); assert.deepEqual(i.slots[0], stack('dirt', 64));
  i.slots[0] = stack('dirt', 64); assert.equal(i.crafting.fill('oak.planks', true).ok, true, 'Matching grid can be reused with no storage space');
});

test('closing either grid returns every real input/cursor item or drops overflow, never grants the preview', () => {
  for (const size of [2, 3]) {
    const drops = [], i = new PlayerInventory({ onDrop: s => drops.push(s) }); i.crafting.begin(size);
    i.slots[C] = stack('oak.log', 2); i.cursor = stack('stick', 5); i.changed(); i.close();
    assert.equal(i.slots.filter(s => s?.id === 'oak.log').reduce((n, s) => n + s.count, 0), 2);
    assert.equal(i.slots.filter(s => s?.id === 'stick').reduce((n, s) => n + s.count, 0), 5);
    assert.ok(!i.slots.some(s => s?.id === 'oak.planks')); assert.equal(drops.length, 0); assert.equal(i.cursor, null);
    i.crafting.begin(size); for (let s = 0; s < 36; s++) i.slots[s] = stack('stone', 64);
    i.slots[C] = stack('pine.log', 3); i.cursor = stack('stick', 4); i.changed(); i.close();
    assert.deepEqual(drops, [stack('pine.log', 3), { id: 'stick', count: 4n }]);
    assert.ok(i.slots.slice(C).every(s => s === null)); assert.equal(i.crafting.output, null); assert.equal(i.crafting.active, false);
  }
});
