import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { VoxelWorld } from '../src/voxel-world.js';
import { MovementController } from '../src/movement.js';
import { placeBlock } from '../src/block-actions.js';
import { BlockPlacement } from '../src/block-placement.js';
import { blockBoxes, fenceConnections } from '../src/block-shapes.js';
import { blockFaceTexture } from '../src/block-types.js';
import { texturePixels } from '../src/block-textures.js';
import { buildChunkMesh } from '../src/voxel-mesh.js';
import { BlockOutline } from '../src/block-outline.js';
import { createItemMesh } from '../src/item-assets.js';
import { RECIPES } from '../src/recipes.js';
import { ITEMS } from '../src/inventory.js';
import { commandCompletions } from '../src/chat-commands.js';
import { protectSneakingEdge } from '../src/player-posture.js';
const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-7, `${a} != ${b}`);
const hit = (x, y, z, normal = { x: 0, y: 1, z: 0 }, point = { x: x + .5, y: y + 1, z: z + .5 }) => ({ x, y, z, normal, point });
const stack = (id, count = 1) => ({ id, count });

test('Pine foliage is dense connected cutout artwork, and all new items have shaped models, icons and command IDs', () => {
  const pixels = texturePixels('pine.leaves'), alpha = [...pixels].filter((_, i) => i % 4 === 3);
  assert.ok(alpha.filter(a => a === 255).length >= 195 && alpha.filter(a => a === 255).length <= 215);
  assert.ok(alpha.every(a => a === 0 || a === 255));
  for (const id of ['oak.door', 'pine.door', 'oak.slab', 'pine.slab', 'oak.fence', 'pine.fence', 'furnace']) {
    assert.equal(ITEMS.get(id).maxStack, 64); assert.ok(ITEMS.get(id).icon); assert.ok(commandCompletions('/give ').includes(`/give ${id} `));
    const mesh = createItemMesh(1, id); mesh.geometry.computeBoundingBox(); assert.ok(mesh.geometry.boundingBox.max.y <= .5);
    assert.ok(mesh.geometry.getAttribute('position').count > 0);
  }
  const slab = createItemMesh(1, 'oak.slab'); slab.geometry.computeBoundingBox(); near(slab.geometry.boundingBox.max.y - slab.geometry.boundingBox.min.y, .5);
});

test('real placement face determines both log axes, end textures and saved state; legacy logs remain vertical', () => {
  for (const id of ['oak.log', 'pine.log']) for (let axis = 0; axis < 3; axis++) for (const sign of [-1, 1]) {
    const w = new VoxelWorld({ depth: 0 }); w.setBlock(0, 0, 0, true);
    const n = { x: 0, y: 0, z: 0 }; n['xyz'[axis]] = sign;
    const origin = { x: .5 + n.x * 3, y: .5 + n.y * 3, z: .5 + n.z * 3 }, direction = { x: -n.x, y: -n.y, z: -n.z };
    const ray = w.raycast(origin, direction); assert.ok(placeBlock(w, id, ray, 0));
    const placed = w.blockAt(n.x, n.y, n.z); assert.equal(placed.state.axis, 'xyz'[axis]);
    for (let face = 0; face < 3; face++) assert.equal(blockFaceTexture(id, face, 1, placed.state), `${id.split('.')[0]}.${face === axis ? 'end' : 'bark'}`);
    const saved = JSON.parse(JSON.stringify(w.save())), restored = new VoxelWorld(); restored.load(saved);
    assert.equal(restored.blockAt(n.x, n.y, n.z).state.axis, 'xyz'[axis]);
  }
  const old = new VoxelWorld({ depth: 0 }); old.loadEdits([{ x: 0, y: 0, z: 0, id: 'pine.log', solid: true, state: {} }]);
  assert.equal(blockFaceTexture('pine.log', 1, 1, old.blockStateAt(0, 0, 0)), 'pine.end');
});

test('slabs use top/bottom hit positions, combine only matching halves, consume once, and double slabs drop two', () => {
  for (const wood of ['oak', 'pine']) {
    const id = `${wood}.slab`, w = new VoxelWorld({ depth: 0 }); w.setBlock(0, 0, 0, true);
    assert.ok(placeBlock(w, id, hit(0, 0, 0, { x: 1, y: 0, z: 0 }, { x: 1, y: .75, z: .5 }), 0)); assert.equal(w.blockStateAt(1, 0, 0).type, 'top');
    assert.ok(placeBlock(w, id, hit(0, 0, 0, { x: 0, y: -1, z: 0 }), 0)); assert.equal(w.blockStateAt(0, -1, 0).type, 'top');
    const world = new VoxelWorld(), c = new MovementController(world); world.setBlock(0, 0, 0, id); c.teleport({ x: .5, y: 2, z: .5 }); c.inventory.slots[0] = stack(id, 3);
    const p = new BlockPlacement({ controller: c, world, getAim: () => ({ yaw: 0, pitch: -Math.PI / 2 }), canInteract: () => true });
    assert.equal(p.attempt(), true); assert.equal(world.blockStateAt(0, 0, 0).type, 'double'); assert.equal(c.inventory.mainHand.count, 2);
    world.destroyBlock(0, 0, 0, { gameMode: 'survival' }); assert.equal(c.drops.total(), 2n); assert.equal(c.drops.piles[0].item, id);
    world.setBlock(0, 0, 0, id); c.setGameMode('creative'); assert.equal(p.attempt(), true); assert.equal(c.inventory.mainHand.count, 2);
    const other = wood === 'oak' ? 'pine.slab' : 'oak.slab';
    world.setBlock(0, 0, 0, id, { type: 'bottom' }); placeBlock(world, other, hit(0, 0, 0, { x: 0, y: 1, z: 0 }, { x: .5, y: .5, z: .5 }), 0);
    assert.equal(world.blockIdAt(0, 0, 0), id); assert.equal(world.blockStateAt(0, 0, 0).type, 'bottom');
  }
});

test('partial slabs drive collision, rays, outlines, camera, LOD and proportional player step-up', () => {
  const w = new VoxelWorld({ depth: 0 }); w.setBlock(0, 0, 0, 'oak.slab');
  const landed = w.movePlayer({ x: .5, y: 3, z: .5 }, { x: 0, y: -100, z: 0 }, .125, .25); near(landed.y, .5); assert.equal(landed.grounded, true);
  assert.equal(w.raycast({ x: .5, y: .75, z: 3 }, { x: 0, y: 0, z: -1 }), null);
  const ray = w.raycast({ x: .5, y: 3, z: .5 }, { x: 0, y: -1, z: 0 }); near(ray.point.y, .5);
  const outline = new BlockOutline(); outline.update(ray, w); near(outline.children[0].scale.y, .503);
  assert.equal(w.sweepBox({ x: .5, y: .8, z: 2 }, { x: 0, y: 0, z: -3 }, .1), 1);
  for (const level of [1, 2, 4]) {
    const mesh = buildChunkMesh(w, 0, 0, level), ys = mesh.positions.filter((_, i) => i % 3 === 1); near(Math.max(...ys), .5); near(Math.min(...ys), 0);
  }
  for (const size of [1, 2]) {
    const world = new VoxelWorld(), c = new MovementController(world); c.configure('size', size); c.teleport({ x: -1, y: 0, z: .5 });
    for (let x = 0; x < 8; x++) world.setBlock(x, 0, 0, 'oak.slab');
    let stepped = false; for (let tick = 0; tick < 12; tick++) { c.update(.05, { forward: true, yaw: -Math.PI / 2 }); stepped ||= c.player.y >= .5 - 1e-7 && c.player.grounded; }
    assert.equal(stepped, true);
    const ledge = new VoxelWorld({ depth: 0 }); ledge.setBlock(0, 0, 0, 'oak.slab');
    const p = { x: 1 + .3 * size - .05, y: .5, z: .5, size, crouching: true };
    assert.equal(ledge.isSupported(p), true);
    const safe = protectSneakingEdge(ledge, p, .3 * size, .3 * size);
    assert.equal(ledge.isSupported({ ...p, x: p.x + safe.x, z: p.z + safe.z }), true);
    assert.equal(ledge.isSupported({ ...p, x: p.x + .2 * size }), false);
  }
});

test('fences connect across wood types/chunk boundaries, use 1m selection/1.5m collision, and block a normal jump', () => {
  const w = new VoxelWorld(); w.setBlock(15, 0, 0, 'oak.fence'); w.setBlock(16, 0, 0, 'pine.fence');
  assert.equal(fenceConnections(w.blockAt(15, 0, 0), w).east, true); assert.equal(fenceConnections(w.blockAt(16, 0, 0), w).west, true);
  w.setBlock(14, 0, 0, 'stone'); assert.equal(fenceConnections(w.blockAt(15, 0, 0), w).west, true);
  assert.equal(Math.max(...blockBoxes(w.blockAt(15, 0, 0), 'selection', w).map(b => b[4])), 1);
  assert.equal(Math.max(...blockBoxes(w.blockAt(15, 0, 0), 'collision', w).map(b => b[4])), 1.5);
  w.setBlock(16, 0, 0, false); assert.equal(fenceConnections(w.blockAt(15, 0, 0), w).east, false);
  const empty = new VoxelWorld({ depth: 0 }); empty.setBlock(0, 0, 0, 'oak.fence');
  assert.equal(empty.raycast({ x: -2, y: .5, z: .1 }, { x: 1, y: 0, z: 0 }), null);
  for (const size of [1, 2]) {
    const stopped = empty.movePlayer({ x: -5, y: 0, z: .5, size }, { x: 100, y: 0, z: 0 }); near(stopped.x, .375 - .3 * size);
  }
  const c = new MovementController(new VoxelWorld()); for (let x = -3; x <= 3; x++) c.world.setBlock(x, 0, 0, 'oak.fence');
  c.teleport({ x: .5, y: 0, z: 2 }); let nearest = 2;
  for (let tick = 0; tick < 35; tick++) { c.update(.05, { forward: true, jump: tick === 0, yaw: 0 }); nearest = Math.min(nearest, c.player.z); }
  assert.ok(nearest >= .925 - 1e-7, `jump crossed fence: ${nearest}`);
});

test('doors place both halves atomically, pair hinges, toggle separately, change passability, and remove/drop exactly once', () => {
  const w = new VoxelWorld(), c = new MovementController(w); c.teleport({ x: 10, y: 0, z: 10 });
  assert.ok(placeBlock(w, 'oak.door', hit(0, -1, 0, undefined, { x: .2, y: 0, z: .5 }), 0));
  assert.ok(placeBlock(w, 'pine.door', hit(1, -1, 0), 0));
  assert.equal(w.blockStateAt(0, 0, 0).hinge, 'left'); assert.equal(w.blockStateAt(1, 0, 0).hinge, 'right');
  let move = w.movePlayer({ x: .5, y: 0, z: 2 }, { x: 0, y: 0, z: -3 }); near(move.z, 1.3);
  assert.ok(w.sweepBox({ x: .5, y: 1.6, z: 2 }, { x: 0, y: 0, z: -4 }, .1) < 1);
  w.toggleDoor(w.blockAt(0, 1, 0)); assert.equal(w.blockStateAt(0, 0, 0).open, true); assert.equal(w.blockStateAt(0, 1, 0).open, true);
  assert.equal(w.blockStateAt(1, 0, 0).open, false); move = w.movePlayer({ x: .5, y: 0, z: 2 }, { x: 0, y: 0, z: -3 }); near(move.z, -1);
  assert.equal(w.sweepBox({ x: .5, y: 1.6, z: 2 }, { x: 0, y: 0, z: -4 }, .1), 1);
  w.destroyBlock(0, 1, 0, { gameMode: 'survival' }); assert.equal(w.hasBlock(0, 0, 0), false); assert.equal(w.hasBlock(0, 1, 0), false); assert.equal(c.drops.total(), 1n);
  w.setBlock(1, -1, 0, false); assert.equal(w.hasBlock(1, 0, 0), false); assert.equal(w.hasBlock(1, 1, 0), false); assert.equal(c.drops.total(), 2n);
  w.setBlock(1, -1, 0, false); assert.equal(c.drops.total(), 2n);
  w.setBlock(3, 1, 0, 'stone'); assert.equal(placeBlock(w, 'oak.door', hit(3, -1, 0), 0), false); assert.equal(w.hasBlock(3, 0, 0), false);
});

test('wood recipes require the correct species and 3x3 grid; furnace requires an empty center', () => {
  for (const wood of ['oak', 'pine']) for (const [part, rows, count] of [['slab', ['PPP'], 6], ['fence', ['PSP', 'PSP'], 3], ['door', ['PP', 'PP', 'PP'], 3]]) {
    const grid = Array(9).fill(null); rows.forEach((row, y) => [...row].forEach((symbol, x) => { grid[y * 3 + x] = stack(symbol === 'P' ? `${wood}.planks` : 'stick'); }));
    assert.deepEqual(RECIPES.match(grid, 3, ITEMS).recipe.output, stack(`${wood}.${part}`, count));
    assert.ok(!RECIPES.forGrid(2).some(r => r.id === `${wood}.${part}`));
    grid[0] = stack(wood === 'oak' ? 'pine.planks' : 'oak.planks'); assert.equal(RECIPES.match(grid, 3, ITEMS), null);
  }
  const furnace = Array.from({ length: 9 }, (_, i) => i === 4 ? null : stack('cobblestone'));
  assert.equal(RECIPES.match(furnace, 3, ITEMS).recipe.output.id, 'furnace'); furnace[4] = stack('cobblestone'); assert.equal(RECIPES.match(furnace, 3, ITEMS), null);
});
