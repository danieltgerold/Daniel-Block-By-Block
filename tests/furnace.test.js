import test from 'node:test';
import assert from 'node:assert/strict';
import { FurnaceEntity, FUELS, SMELTING } from '../src/smelting.js';
import { VoxelWorld } from '../src/voxel-world.js';
import { MovementController } from '../src/movement.js';
import { placeBlock } from '../src/block-actions.js';
import { blockFaceTexture } from '../src/block-types.js';
import { getBlockMaterials, getFaceTexture } from '../src/block-assets.js';
const stack = (id, count = 1) => ({ id, count });
const ticks = (entity, count) => { for (let n = 0; n < count; n++) entity.tick(); };
function furnace(fuel = 'oak.planks', count = 1, sand = 2) { return new FurnaceEntity({ slots: [stack('sand', sand), stack(fuel, count), null] }); }

test('smelting/fuel registries use exact tick values and a plank cooks once plus 100 ticks of the next Sand', () => {
  assert.equal(SMELTING.size, 1); assert.equal(SMELTING.get('sand').ticks, 200);
  for (const wood of ['oak', 'pine']) for (const [part, duration] of [['log', 300], ['planks', 300], ['fence', 300], ['door', 200], ['slab', 150]]) assert.equal(FUELS.get(`${wood}.${part}`), duration);
  assert.equal(FUELS.get('crafting.table'), 300); assert.equal(FUELS.get('stick'), 100); assert.equal(FUELS.has('pine.leaves'), false);
  const f = furnace(); ticks(f, 199); assert.equal(f.slots[2], null); assert.equal(f.cookTime, 199);
  f.tick(); assert.deepEqual(f.slots[2], stack('glass')); assert.deepEqual(f.slots[0], stack('sand')); assert.equal(f.slots[1], null);
  ticks(f, 100); assert.equal(f.cookTime, 100); assert.equal(f.burnTime, 1);
  f.tick(); assert.equal(f.burnTime, 0); assert.equal(f.cookTime, 98);
  ticks(f, 49); assert.equal(f.cookTime, 0); assert.equal(f.slots[2].count, 1); assert.equal(f.slots[0].count, 1);
});

test('stick fuel cools unfinished progress, replacement fuel continues it, and blocked/removed input never wastes fresh fuel', () => {
  const stick = furnace('stick'); ticks(stick, 100); assert.equal(stick.cookTime, 100); assert.equal(stick.slots[2], null);
  stick.slots[1] = stack('oak.door'); stick.tick(); assert.equal(stick.cookTime, 101); assert.equal(stick.burnTime, 200);
  ticks(stick, 99); assert.equal(stick.slots[2].count, 1);
  const blocked = furnace('oak.planks', 2); blocked.slots[2] = stack('glass', 64); ticks(blocked, 5);
  assert.equal(blocked.burnTime, 0); assert.equal(blocked.slots[1].count, 2); assert.equal(blocked.slots[0].count, 2);
  blocked.slots[2] = null; ticks(blocked, 20); assert.equal(blocked.cookTime, 20); assert.equal(blocked.slots[1].count, 1);
  blocked.slots[2] = stack('dirt'); const burn = blocked.burnTime; blocked.tick(); assert.equal(blocked.cookTime, 0); assert.equal(blocked.burnTime, burn - 1);
  blocked.slots[0] = null; ticks(blocked, 400); assert.equal(blocked.slots[1].count, 1); assert.equal(blocked.burnTime, 0);
});

test('placed furnace faces its player, switches lit material, runs closed at different FPS and survives save/load with all counters', () => {
  const w = new VoxelWorld({ depth: 0 }); w.setBlock(0, 0, 0, true);
  placeBlock(w, 'furnace', { x: 0, y: 0, z: 0, normal: { x: 1, y: 0, z: 0 }, point: { x: 1, y: .5, z: .5 } }, Math.PI / 2);
  assert.equal(w.blockStateAt(1, 0, 0).facing, 'east'); assert.equal(blockFaceTexture('furnace', 0, 1, w.blockStateAt(1, 0, 0)), 'furnace.front');
  assert.equal(getBlockMaterials('furnace')[4].map, getFaceTexture('furnace.front'), 'Item presentation shows its recognizable front without altering placement state');
  const f = w.furnaceAt(1, 0, 0); f.slots = [stack('sand', 2), stack('pine.planks'), null]; w.step(.05);
  assert.equal(blockFaceTexture('furnace', 0, 1, w.blockStateAt(1, 0, 0)), 'furnace.lit');
  let reference;
  for (const fps of [30, 144]) {
    const world = new VoxelWorld({ depth: 3 }), c = new MovementController(world); world.setBlock(10, 0, 10, 'furnace');
    const entity = world.furnaceAt(10, 0, 10); entity.slots = [stack('sand', 2), stack('oak.planks'), null];
    for (let frame = 0; frame < fps * 12.5; frame++) c.update(1 / fps, { gameplayEnabled: false });
    assert.equal(c.totalSteps, 250); if (reference) assert.deepEqual(entity.toJSON(), reference); reference = entity.toJSON();
    const saved = JSON.parse(JSON.stringify(world.save())), restored = new VoxelWorld({ depth: 3 }); restored.load(saved);
    assert.deepEqual(restored.furnaceAt(10, 0, 10).toJSON(), entity.toJSON());
    for (let tick = 0; tick < 30; tick++) { world.step(.05); restored.step(.05); }
    assert.deepEqual(restored.furnaceAt(10, 0, 10).toJSON(), entity.toJSON());
  }
});

test('furnaces are independent and breaking drops actual slots exactly once, excluding the fuel already consumed', () => {
  for (const mode of ['survival', 'creative']) {
    const w = new VoxelWorld({ depth: 3 }), c = new MovementController(w); c.setGameMode(mode);
    w.setBlock(0, 0, 0, 'furnace'); w.setBlock(4, 0, 0, 'furnace');
    const first = w.furnaceAt(0, 0, 0), second = w.furnaceAt(4, 0, 0);
    first.slots = [stack('sand', 3), stack('oak.planks', 2), stack('glass', 2)]; second.slots = [stack('sand'), stack('stick'), null];
    for (let tick = 0; tick < 50; tick++) w.step(.05);
    assert.equal(first.slots[1].count, 1); assert.equal(first.cookTime, 50); assert.equal(second.cookTime, 50);
    w.destroyBlock(0, 0, 0, { gameMode: mode }); assert.equal(w.furnaceAt(0, 0, 0), undefined);
    assert.equal(c.drops.total(), mode === 'creative' ? 6n : 7n); assert.ok(first.slots.every(s => !s));
    assert.equal(w.destroyBlock(0, 0, 0, { gameMode: mode }), false); assert.equal(c.drops.total(), mode === 'creative' ? 6n : 7n);
    assert.equal(second.slots[0].count, 1); assert.equal(second.slots[1], null); assert.equal(second.burnTime, 51);
  }
});
