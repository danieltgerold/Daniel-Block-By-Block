import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { Window } from 'happy-dom';
import { BLOCK_TYPES, blockFaceTexture, blockMatches } from '../src/block-types.js';
import { BLOCK_TEXTURES, texturePixels } from '../src/block-textures.js';
import { blockIcon } from '../src/block-icons.js';
import { ITEMS } from '../src/inventory.js';
import { drawStack } from '../src/inventory-ui.js';
import { VoxelWorld, chunkKey } from '../src/voxel-world.js';
import { MovementController } from '../src/movement.js';
import { BlockPlacement, breakTargetBlock } from '../src/block-placement.js';
import { BlockParticles } from '../src/block-particles.js';
import { buildChunkMesh } from '../src/voxel-mesh.js';
import { ChunkRenderer } from '../src/chunk-renderer.js';
import { getBlockAssets, getBlockMaterials, getFaceTexture, createSharedBlock, getParticleTexture } from '../src/block-assets.js';
import { createEmptyHand, updateEmptyHand, createPlayerModel, syncEquipment } from '../src/player-visuals.js';
import { DroppedItemRenderer } from '../src/dropped-item-renderer.js';
import { ChatService, LocalPlayerProfile } from '../src/chat.js';
import { commandCompletions } from '../src/chat-commands.js';
const ids = ['test.block', 'stone', 'cobblestone', 'dirt', 'grass.block', 'sand', 'gravel', 'oak.log', 'oak.planks'];
const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-8, `${a} != ${b}`);
const stack = (id, count = 1) => ({ id, count });
const total = c => c.inventory.slots.reduce((n, s) => n + BigInt(s?.count ?? 0), 0n) + c.drops.total();

test('all nine block definitions share full-cube mechanics but have distinct items, face resources and future recipe tags', () => {
  for (const id of ids) {
    const def = BLOCK_TYPES.get(id), item = ITEMS.get(id);
    assert.equal(def.id, id); assert.ok(def.name); assert.equal(def.maxStack, 64);
    assert.equal(def.solid, true); assert.equal(def.opaque, true); assert.equal(def.collisionShape, 'cube');
    assert.equal(typeof def.breakTime, 'number'); assert.equal(item.maxStack, 64); assert.equal(item.name, def.name);
    assert.ok(getParticleTexture(def.particleTexture));
  }
  assert.equal(blockFaceTexture('grass.block', 1, 1), 'grass.top');
  assert.equal(blockFaceTexture('grass.block', 1, -1), 'dirt');
  assert.equal(blockFaceTexture('grass.block', 0, 1), 'grass.side');
  assert.equal(blockFaceTexture('oak.log', 1, -1), 'oak.end');
  assert.equal(blockFaceTexture('oak.log', 2, -1), 'oak.bark');
  assert.equal(blockMatches('oak.planks', { tag: 'wood.planks' }), true);
  assert.equal(blockMatches('oak.log', { tag: 'wood.planks' }), false);
  assert.equal(blockMatches('stone', 'stone'), true);
});

test('new 16x16 pixel faces, repeated world UVs, cached shaded icons and all 3D models use shared matching resources', t => {
  for (const [id, tile] of BLOCK_TEXTURES) {
    const texture = getFaceTexture(id);
    assert.equal(texture.image.width, 16); assert.equal(texture.image.height, 16);
    assert.equal(texture.magFilter, THREE.NearestFilter); assert.equal(texture.wrapS, THREE.RepeatWrapping);
    assert.equal(getFaceTexture(id), texture); assert.equal(texturePixels(id), texturePixels(id));
    assert.ok(tile.palette.length <= 5);
    // Logical top row maps to v=1 in world/held textures.
    assert.deepEqual([...texture.image.data.slice(-64)], [...texturePixels(id).slice(0, 64)]);
  }
  assert.equal(getBlockAssets().texture.image.width, 128, 'Legacy Test Block fine grid stays unchanged');
  const window = new Window(); t.after(() => { window.happyDOM.abort(); window.close(); });
  for (const id of ids) {
    const element = window.document.createElement('button'); drawStack(window.document, element, stack(id, 2));
    assert.equal(element.querySelector('img').getAttribute('src'), blockIcon(id));
    assert.equal(blockIcon(id), blockIcon(id)); assert.equal(element.querySelector('.stack-count').textContent, '2');
    const a = createSharedBlock(.375, id), b = createSharedBlock(.375, id);
    assert.equal(a.geometry, b.geometry); assert.equal(a.material, b.material);
    assert.equal(a.material, getBlockMaterials(id));
  }
  assert.notEqual(blockIcon('stone'), blockIcon('gravel'));
  const grassMaterials = getBlockMaterials('grass.block');
  assert.equal(grassMaterials[2].map, getFaceTexture('grass.top'));
  assert.equal(grassMaterials[3].map, getFaceTexture('dirt'));
  assert.equal(grassMaterials[0].map, getFaceTexture('grass.side'));
});

test('typed storage and legacy occupancy migration preserve ground, identity, collision and restoring sparse edits', () => {
  const w = new VoxelWorld();
  w.loadEdits([{ x: -1, y: 1, z: -1, solid: true }, { x: 2, y: -1, z: 2, solid: false }, { x: 3, y: -1, z: 3, id: 'stone' }]);
  assert.equal(w.blockAt(-1, 1, -1).id, 'test.block'); assert.equal(w.hasBlock(2, -1, 2), false);
  assert.equal(w.blockAt(3, -1, 3).definition.id, 'stone'); assert.equal(w.removedCount, 1);
  w.setBlock(3, -1, 3, 'dirt'); assert.equal(w.removedCount, 1);
  w.setBlock(3, -1, 3, false); assert.equal(w.removedCount, 2);
  w.setBlock(3, -1, 3, true); assert.equal(w.removedCount, 1);
  assert.equal(w.blockIdAt(0, -2, 0), 'test.block');
  const old = new VoxelWorld({ depth: 0 });
  old.chunkEdits.set(chunkKey(0, 0), new Map([['0,0,0', { x: 0, y: 0, z: 0, solid: true }]]));
  assert.equal(old.blockAt(0, 0, 0).id, 'test.block');
  for (const id of ids) {
    const world = new VoxelWorld({ depth: 0 }); world.setBlock(0, 0, 0, id);
    const motion = world.movePlayer({ x: 2, y: 0, z: .5 }, { x: -50, y: 0, z: 0 });
    near(motion.x, 1.3); assert.equal(motion.blocked.x, true);
    assert.equal(world.raycast({ x: 3, y: .5, z: .5 }, { x: -1, y: 0, z: 0 }).x, 0);
    assert.equal(world.setBlock(0, 0, 0, 'unknown'), false); assert.equal(world.blockIdAt(0, 0, 0), id);
  }
});

test('all block kinds place/consume, break/drop their own item, retain Creative rules and use actual particle/pick identity', () => {
  for (const mode of ['survival', 'creative']) for (const id of ids) {
    const world = new VoxelWorld(), c = new MovementController(world);
    world.setBlock(0, 1, 0, id); c.teleport({ x: 3.5, y: 0, z: .5 }); c.setGameMode(mode);
    c.particles = new BlockParticles(world, { random: () => .5 });
    c.inventory.slots[0] = stack(id, 2);
    const placement = new BlockPlacement({ controller: c, world, getAim: () => ({ yaw: Math.PI / 2, pitch: 0 }), canInteract: () => true });
    assert.equal(placement.attempt(), true); assert.equal(world.blockIdAt(1, 1, 0), id);
    assert.equal(c.inventory.mainHand.count, mode === 'survival' ? 1 : 2);
    assert.equal(breakTargetBlock({ controller: c, world, yaw: Math.PI / 2, pitch: 0 }), true);
    assert.equal(c.particles.active.length, 64);
    assert.ok(c.particles.pool.every(p => p.texture === BLOCK_TYPES.get(id).particleTexture));
    assert.equal(c.drops.total(), mode === 'survival' ? 1n : 0n);
    if (mode === 'survival') assert.equal(c.drops.piles[0].item, id === 'grass.block' ? 'dirt' : id);
    c.inventory.slots[0] = null; c.inventory.slots[9] = stack(id, 7);
    assert.equal(c.pickBlock(Math.PI / 2, 0), true); assert.equal(c.inventory.mainHand.id, id);
    assert.equal(c.inventory.mainHand.count, mode === 'survival' ? 7 : 1);
  }
});

test('mixed faces mesh by texture, keep hidden faces culled and repeat pixel tiles once per block at every LOD', () => {
  const w = new VoxelWorld({ depth: 0 });
  w.setBlock(0, 0, 0, 'grass.block'); w.setBlock(1, 0, 0, 'oak.log');
  const mesh = buildChunkMesh(w, 0, 0);
  const textures = mesh.groups.map(g => g.texture);
  for (const id of ['grass.top', 'grass.side', 'dirt', 'oak.end', 'oak.bark']) assert.ok(textures.includes(id));
  assert.equal(mesh.quads, 10, 'The two contacting opaque faces are omitted');
  assert.equal(mesh.groups.reduce((n, g) => n + g.count, 0), mesh.indices.length);
  for (const level of [1, 2, 4]) {
    const floor = new VoxelWorld();
    for (let z = 0; z < 16; z++) for (let x = 0; x < 16; x++) floor.setBlock(x, -1, z, 'stone');
    const data = buildChunkMesh(floor, 0, 0, level); const group = data.groups.find(g => g.texture === 'stone');
    const uv = data.indices.slice(group.start, group.start + group.count).map(i => data.uvs[i * 2]);
    assert.equal(Math.max(...uv), 16, 'Merged 16-block top repeats sixteen times, not once');
  }
  const renderer = new ChunkRenderer(w, new THREE.Scene(), getBlockAssets().material);
  const entry = renderer.rebuild(0, 0, 1); assert.equal(entry.mesh.geometry.groups.length, textures.length);
  assert.ok(entry.mesh.material.every((m, i) => m.map === getFaceTexture(mesh.groups[i].texture))); renderer.dispose();
  const live = new ChunkRenderer(w, new THREE.Scene(), getBlockAssets().material);
  const tracked = live.rebuild(0, 0, 1); w.setBlock(0, 1, 0, 'stone');
  assert.equal(w.blockIdAt(0, 0, 0), 'dirt'); assert.equal(tracked.dirty, true);
  live.dispose(); assert.equal(w.listeners.size, 0);
});

test('grass converts when covered/area-updated and spreads on a fixed one-second timer including muted inventory ticks', () => {
  const world = new VoxelWorld({ depth: 0, random: () => .99 });
  const changes = []; world.subscribe(change => changes.push(change));
  world.setBlock(0, 0, 0, 'grass.block'); world.setBlock(0, 1, 0, 'sand');
  assert.equal(world.blockIdAt(0, 0, 0), 'dirt'); world.setBlock(0, 1, 0, false);
  assert.equal(world.blockIdAt(0, 0, 0), 'dirt', 'Uncovering does not instantly restore grass');
  world.setBlock(0, 0, 0, 'grass.block'); world.setBlock(1, 1, 1, 'dirt');
  world.setBlock(1, 2, 1, 'stone'); world.step(1); assert.equal(world.blockIdAt(1, 1, 1), 'dirt');
  world.setBlock(1, 2, 1, false); world.step(.95); assert.equal(world.blockIdAt(1, 1, 1), 'dirt');
  world.step(.05); assert.equal(world.blockIdAt(1, 1, 1), 'grass.block');
  assert.ok(changes.some(c => c.previousId === 'dirt' && c.id === 'grass.block'));
  // Simulate a covered block from an area's existing data being refreshed.
  world.chunkEdits.get(chunkKey(0, 0)).set('0,1,0', { x: 0, y: 1, z: 0, id: 'gravel', solid: true });
  world.updateArea(); assert.equal(world.blockIdAt(0, 0, 0), 'dirt');
  for (const mode of ['survival', 'creative']) for (const fps of [30, 144]) {
    const w = new VoxelWorld({ depth: 0, random: () => .99 }), c = new MovementController(w);
    c.teleport({ x: 100, y: 10, z: 100 }); c.setGameMode(mode);
    w.setBlock(0, 0, 0, 'grass.block'); w.setBlock(1, 1, 1, 'dirt');
    for (let i = 0; i < fps; i++) c.update(1 / fps, { gameplayEnabled: false });
    assert.equal(w.blockIdAt(1, 1, 1), 'grass.block'); assert.equal(c.totalSteps, 20);
  }
});

test('give/autocomplete includes every ID, splits 130, rejects errors, and preserves typed overflow', () => {
  for (const id of ids) {
    assert.ok(commandCompletions('/give ').includes(`/give ${id} `));
    assert.deepEqual(commandCompletions(`/give ${id} `), []);
    const c = new MovementController(new VoxelWorld()), service = new ChatService({ controller: c, profile: new LocalPlayerProfile(null, () => 'blocks') });
    service.submit(`/give ${id} 130`); assert.deepEqual(c.inventory.slots.slice(0, 3).map(s => s.count), [64, 64, 2]);
    assert.ok(c.inventory.slots.slice(0, 3).every(s => s.id === id));
    for (const text of ['/give unknown 1', `/give ${id} -2`, `/give ${id} 1.5`]) { service.submit(text); assert.equal(total(c), 130n); }
    c.inventory.insert(id, 2304); const before = total(c); service.submit(`/give ${id} 130`);
    assert.equal(total(c), before + 130n); assert.ok(c.drops.piles.every(p => p.item === id));
  }
  assert.deepEqual(commandCompletions('/give oak.'), ['/give oak.log ', '/give oak.planks ', '/give oak.leaves ']);
});

test('different dropped block kinds never merge; matching kinds merge once and keep the correct hand/offhand/ghost textures', () => {
  const c = new MovementController(new VoxelWorld()); c.teleport({ x: 100, y: 0, z: 100 });
  const renderer = new DroppedItemRenderer(new THREE.Scene());
  for (const id of ids) c.drops.spawn(id, 2, { x: 0, y: 3, z: 0 });
  c.update(.05); assert.equal(c.drops.piles.length, ids.length); assert.equal(c.drops.total(), 18n);
  const stone = c.drops.piles.find(p => p.item === 'stone'), dirt = c.drops.piles.find(p => p.item === 'dirt');
  c.drops.merge(stone, dirt); assert.equal(c.drops.piles.length, 9); assert.equal(c.drops.total(), 18n);
  c.drops.spawn('stone', 3, { x: stone.x, y: stone.y, z: stone.z });
  assert.equal(c.drops.piles.length, 9); assert.equal(c.drops.piles.find(p => p.item === 'stone').count, 5n);
  renderer.update(c.drops);
  for (const p of [...c.drops.piles, ...c.drops.transitions]) {
    assert.equal(renderer.meshes.get(p.id).children[0].material, getBlockMaterials(p.item));
  }
  const hand = createEmptyHand(), model = createPlayerModel();
  c.inventory.slots[0] = stack('grass.block'); c.inventory.slots[40] = stack('oak.log');
  updateEmptyHand(hand, { swingActive: false }, c.inventory); syncEquipment(model, c.inventory);
  assert.equal(hand.mainItem.material, getBlockMaterials('grass.block'));
  assert.equal(hand.offhandItem.material, getBlockMaterials('oak.log'));
  assert.equal(model.userData.equipment.rightItem.material, hand.mainItem.material);
  assert.equal(model.userData.equipment.leftItem.material, hand.offhandItem.material);
});
