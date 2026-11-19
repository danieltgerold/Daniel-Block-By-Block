import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { VoxelWorld } from '../src/voxel-world.js';
import { MovementController } from '../src/movement.js';
import { ITEMS, OFFHAND } from '../src/inventory.js';
import { BlockPlacement } from '../src/block-placement.js';
import { placeBlock } from '../src/block-actions.js';
import { isWaterSource, waterCorner, waterSurfaceAt } from '../src/fluid-surface.js';
import { buildWaterMesh } from '../src/fluid-mesh.js';
import { ChunkRenderer } from '../src/chunk-renderer.js';
import { getFaceMaterial } from '../src/block-assets.js';
import { createEmptyHand, updateEmptyHand, createPlayerModel, animatePlayerModel, syncEquipment } from '../src/player-visuals.js';
import { commandCompletions } from '../src/chat-commands.js';
import { RECIPES, BUCKET_RECIPE } from '../src/recipes.js';
const tick = (w, n = 5) => { for (let i = 0; i < n; i++) w.step(.05); };
const stack = (id, count = 1) => ({ id, count });
const source = (w, x, y = 0, z = 0) => w.setBlock(x, y, z, 'water');
const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-8, `${a} != ${b}`);
function bucketFixture() {
  const w = new VoxelWorld({ depth: 3 }), c = new MovementController(w); c.teleport({ x: .5, y: 0, z: 2.5 });
  const p = new BlockPlacement({ controller: c, world: w, getAim: () => ({ yaw: 0, pitch: -.4 }), canInteract: () => true });
  // Aim directly down for exact source/ground targeting from the current eye.
  p.getAim = () => ({ yaw: 0, pitch: -Math.PI / 2 });
  return { w, c, p };
}

test('Door arms stay hidden through equip/swing in both hands; buckets use independent flat icons, stacks and item poses', () => {
  const c = new MovementController(new VoxelWorld({ depth: 3 })), hand = createEmptyHand(), model = createPlayerModel();
  for (const id of ['oak.door', 'pine.door']) for (const p of [0, .35, .8]) {
    c.inventory.slots[0] = stack(id); c.inventory.slots[OFFHAND] = stack(id);
    const pose = { swingActive: p > 0, swingProgress: p, equipHeight: .4, phase: 0, amount: 0, crouch: 0, torsoYaw: 0, headYaw: 0, aimPitch: 0 };
    updateEmptyHand(hand, pose, c.inventory); assert.equal(hand.rig.visible, false);
    for (const wrist of hand.doorHands) assert.equal(wrist.children.find(child => child.name === 'Door Grip Arm').visible, false);
    animatePlayerModel(model, { x: 0, y: 0, z: 0 }, pose, 1, c.inventory); syncEquipment(model, c.inventory);
    assert.equal(model.userData.parts['Right Arm'].visible, true); assert.equal(model.userData.parts['Left Arm'].visible, true);
  }
  c.inventory.slots[0] = null; updateEmptyHand(hand, { swingActive: false }, c.inventory); assert.equal(hand.rig.visible, true);
  for (const [id, cap] of [['bucket', 16], ['water.bucket', 1]]) {
    assert.equal(ITEMS.get(id).maxStack, cap); assert.ok(commandCompletions('/give ').includes(`/give ${id} `));
    c.inventory.slots[0] = stack(id); updateEmptyHand(hand, { swingActive: false }, c.inventory);
    assert.equal(hand.mainItem.geometry.type, 'PlaneGeometry'); assert.equal(hand.doorHands[0].visible, false);
  }
  assert.notEqual(ITEMS.get('bucket').icon, ITEMS.get('water.bucket').icon);
  assert.equal(RECIPES.recipes.has('bucket'), false); assert.deepEqual(BUCKET_RECIPE.output, stack('bucket'));
});

test('bucket use exchanges exactly one item, drops full-inventory overflow, obeys reach/obstruction and old Creative rules', () => {
  const { w, c, p } = bucketFixture();
  c.inventory.slots[0] = stack('water.bucket'); assert.equal(p.attempt(), true); assert.equal(c.inventory.mainHand.id, 'bucket');
  assert.ok(isWaterSource(w.blockAt(0, 0, 2))); assert.equal(w.raycast({ x: .5, y: 2, z: 2.5 }, { x: 0, y: -1, z: 0 }).y, -1);
  assert.equal(p.attempt(), true); assert.equal(c.inventory.mainHand.id, 'water.bucket'); assert.equal(w.blockIdAt(0, 0, 2), null);
  source(w, 0, 0, 2); c.inventory.slots[0] = stack('bucket', 3); assert.equal(p.attempt(), true);
  assert.equal(c.inventory.slots[0].count, 2); assert.equal(c.inventory.slots[1].id, 'water.bucket');
  for (let i = 1; i < 36; i++) c.inventory.slots[i] = stack('stone', 64);
  source(w, 0, 0, 2); assert.equal(p.attempt(), true); assert.equal(c.drops.total(), 1n); assert.equal(c.drops.piles[0].item, 'water.bucket');
  w.setBlock(0, 0, 2, 'water', { level: 1 }); c.inventory.slots[0] = stack('bucket'); assert.equal(p.attempt(), false);
  assert.equal(w.blockStateAt(0, 0, 2).level, 1);
  source(w, 0, 0, 2); w.setBlock(0, 1, 2, 'glass'); assert.equal(p.attempt(), false); assert.ok(isWaterSource(w.blockAt(0, 0, 2)));
  w.setBlock(0, 1, 2, false); c.configure('reach', .1); assert.equal(p.attempt(), false);
  c.setGameMode('creative'); assert.equal(p.attempt(), true); assert.equal(c.inventory.mainHand.id, 'bucket');
  c.inventory.slots[0] = stack('water.bucket'); assert.equal(p.attempt(), true); assert.equal(c.inventory.mainHand.id, 'water.bucket');
  assert.ok(isWaterSource(w.blockAt(0, 0, 2)));
  const placed = placeBlock(w, 'oak.slab', { x: 0, y: -1, z: 2, normal: { x: 0, y: 1, z: 0 }, point: { x: .5, y: 0, z: 2.5 } }, 0);
  assert.ok(placed); assert.equal(w.blockIdAt(0, 0, 2), 'oak.slab');
});

test('water advances only every five ticks, reaches level seven, settles, recedes and resumes identically across frame rates', () => {
  const w = new VoxelWorld({ depth: 3 }); source(w, 0); tick(w, 4); assert.equal(w.fluids.cells.size, 1); tick(w, 1); assert.equal(w.blockStateAt(1, 0, 0).level, 1);
  tick(w, 75); assert.equal(w.blockStateAt(7, 0, 0).level, 7); assert.equal(w.blockIdAt(8, 0, 0), null); assert.equal(w.fluids.pending.size, 0);
  assert.equal(w.fluids.cells.size, 113);
  const restored = new VoxelWorld({ depth: 3 }); restored.load(JSON.parse(JSON.stringify(w.save()))); assert.deepEqual(restored.blockStateAt(7, 0, 0), w.blockStateAt(7, 0, 0));
  w.setBlock(0, 0, 0, false); tick(w, 150); assert.equal(w.fluids.cells.size, 0); assert.equal(w.fluids.pending.size, 0);
  const snapshots = [];
  for (const fps of [2, 30, 144]) { const world = new VoxelWorld({ depth: 3 }), controller = new MovementController(world); source(world, 0); for (let f = 0; f < fps * 3; f++) controller.update(1 / fps, { gameplayEnabled: false }); snapshots.push(JSON.stringify([...world.edits()].map(e => [e.x, e.y, e.z, e.state]).sort())); assert.equal(controller.totalSteps, 60); }
  assert.equal(snapshots[0], snapshots[1]); assert.equal(snapshots[1], snapshots[2]);
});

test('water favors a nearby drop, falls before spreading, renews trenches/pools, and cannot occupy partial blocks', () => {
  const w = new VoxelWorld({ depth: 3 }); w.setBlock(2, -1, 0, false); source(w, 0); tick(w);
  assert.equal(w.blockIdAt(1, 0, 0), 'water'); assert.equal(w.blockIdAt(-1, 0, 0), null); tick(w, 20); assert.equal(w.blockStateAt(2, -1, 0).falling, true);
  const falls = new VoxelWorld({ depth: 0 }); falls.setBlock(0, -1, 0, 'stone'); source(falls, 0, 2); tick(falls); assert.equal(falls.blockStateAt(0, 1, 0).falling, true); assert.equal(falls.blockIdAt(1, 2, 0), null);
  tick(falls, 10); assert.equal(falls.blockIdAt(1, 0, 0), 'water');
  const trench = new VoxelWorld({ depth: 3 }); source(trench, 0); source(trench, 2); tick(trench, 10); assert.ok(isWaterSource(trench.blockAt(1, 0, 0)));
  trench.setBlock(1, -1, 0, false); tick(trench); assert.ok(isWaterSource(trench.blockAt(1, 0, 0)), 'renewed source persists without support');
  const pool = new VoxelWorld({ depth: 3 }); source(pool, 0, 0, 0); source(pool, 1, 0, 1); tick(pool, 10); assert.ok(isWaterSource(pool.blockAt(1, 0, 0))); assert.ok(isWaterSource(pool.blockAt(0, 0, 1)));
  for (const id of ['oak.slab', 'oak.stairs', 'oak.fence']) { const world = new VoxelWorld({ depth: 3 }); world.setBlock(1, 0, 0, id); source(world, 0); tick(world, 45); assert.equal(world.blockIdAt(1, 0, 0), id); }
});

test('water chunk surfaces connect, cull internal faces and preserve transparent depth; players/items sink, swim and follow currents', () => {
  const w = new VoxelWorld({ depth: 3 }); source(w, 15); w.setBlock(16, 0, 0, 'water', { level: 1 });
  const corner = waterCorner(w, 16, 0, 0), a = buildWaterMesh(w, 0, 0), b = buildWaterMesh(w, 1, 0);
  assert.ok(a.positions.some((v, i) => i % 3 === 1 && Math.abs(v - corner) < 1e-8)); assert.ok(b.positions.some((v, i) => i % 3 === 1 && Math.abs(v - corner) < 1e-8));
  const water = getFaceMaterial('water'); assert.equal(water.transparent, true); assert.equal(water.depthWrite, false); assert.equal(water.depthTest, true);
  const renderer = new ChunkRenderer(w, new THREE.Scene(), getFaceMaterial('dirt'));
  const chunk = renderer.rebuild(0, 0, 1); assert.equal(chunk.waterMesh.material, water); assert.equal(chunk.waterMesh.renderOrder, 2); renderer.dispose();
  const pool = new VoxelWorld({ depth: 0 });
  for (let x = -2; x < 3; x++) for (let z = -2; z < 3; z++) for (let y = -3; y < 2; y++) source(pool, x, y, z);
  const c = new MovementController(pool); c.teleport({ x: .5, y: 0, z: .5 }); c.update(.05); assert.ok(c.player.y <= 0); assert.ok(c.player.vy < 0);
  c.player.vy = 0; c.update(.05, { jump: true }); assert.ok(c.player.y > 0);
  const item = c.drops.spawn('bucket', 1, { x: 1.5, y: 0, z: 1.5 }, { thrown: true, velocity: { y: 0 } }); c.update(.1); assert.ok(item.y < 0); assert.ok(item.vy < 0);
  assert.equal(pool.fluids.submerged({ x: .5, y: .5, z: .5 }), true); assert.equal(pool.fluids.submerged({ x: .5, y: 3, z: .5 }), false);
  c.setGameMode('creative'); c.player.flying = true; c.player.vy = 0; const y = c.player.y; c.update(.05); near(c.player.y, y);
  const current = w.fluids.current(15, 0, 0); assert.ok(current.x > 0); near(current.z, 0); assert.ok(waterSurfaceAt(w, { x: 15.5, y: .1, z: .5 }) > .1);
  const scaled = [1, 2].map(size => {
    const swimmer = new MovementController(pool); swimmer.configure('size', size); swimmer.configure('speed', 6); swimmer.configure('jump', 2);
    swimmer.teleport({ x: .5, y: 0, z: .5 }); swimmer.update(.05, { forward: true, jump: true }); return swimmer.player;
  });
  near(scaled[1].y, scaled[0].y * 2); near(scaled[1].vy, scaled[0].vy * 2); near(scaled[1].vz, scaled[0].vz * 2);
});
