import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { MovementController } from '../src/movement.js';
import { VoxelWorld } from '../src/voxel-world.js';
import { pickupBounds } from '../src/dropped-items.js';
import { BlockParticles, terrainVelocity, landingParticleCount } from '../src/block-particles.js';
import { BLOCK_TYPES, registerBlockType } from '../src/block-types.js';
import { BlockParticleRenderer } from '../src/block-particle-renderer.js';
import { getBlockAssets, getParticleTexture, registerParticleTexture } from '../src/block-assets.js';
import { AdaptiveVisualQuality, VISUAL_QUALITY } from '../src/visual-quality.js';
import { DroppedItemRenderer } from '../src/dropped-item-renderer.js';
import { breakTargetBlock } from '../src/block-placement.js';
const near = (a, b, eps = 1e-8) => assert.ok(Math.abs(a - b) < eps, `${a} != ${b}`);
const block = (x = 0, y = 0, z = 0) => ({ x, y, z, definition: BLOCK_TYPES.get('test.block') });
const values = system => system.active.map(id => system.pool[id]);
const quality = level => ({ settings: VISUAL_QUALITY[level] });
function setup(world = new VoxelWorld(), options) {
  const c = new MovementController(world); c.respawn({ x: .5, y: 0, z: .5 });
  c.particles = new BlockParticles(world, { random: () => .5, ...options }); return c;
}

test('pickup expands the current scaled/crouching box by fixed 1/0.5 world blocks and does not use a circle or line of sight', () => {
  const bounds = pickupBounds({ x: 0, y: 2, z: 0, size: 2, crouching: true });
  assert.deepEqual(bounds, { min: { x: -1.6, y: 1.5, z: -1.6 }, max: { x: 1.6, y: 5.5, z: 1.6 } });
  const c = setup(); c.world.setBlock(1, 1, 0, true);
  c.drops.spawn('test.block', 1, { x: 1.8, y: .2, z: .5 }, { velocity: { y: 0 } });
  c.drops.spawn('test.block', 2, { x: .5, y: .2, z: 1.8 }, { velocity: { y: 0 } });
  c.update(.05); assert.equal(c.inventory.mainHand.count, 3, 'Expanded box picks up through the sight-blocking wall and near corners');
  const low = setup(); low.player.crouching = true;
  const crouch = pickupBounds(low.player); near(crouch.max.y, 2); near(crouch.min.y, -.5);
  low.drops.spawn('test.block', 5, { x: .5, y: 2.1, z: .5 }, { velocity: { y: 0 } });
  low.update(.05, { crouch: true }); assert.equal(low.inventory.mainHand, null);
});

test('terrain initializer, quarter crops, lifetime, tint, collision and the reusable hard-capped pool match the fixed-tick rules', () => {
  const velocity = terrainVelocity({ x: 1, y: 2, z: 3 }, () => .5);
  near(velocity.x, .12 / Math.sqrt(14)); near(velocity.y, .24 / Math.sqrt(14) + .1);
  assert.deepEqual(terrainVelocity({ x: 0, y: 0, z: 0 }, () => .5), { x: 0, y: .1, z: 0 });
  const c = setup(), p = c.particles.spawn(block(), { x: .5, y: .1, z: .5 }, { x: 0, y: 0, z: 0 });
  near(p.halfSize, .075); near(p.side, .2); assert.equal(p.life, 7); near(p.u, .375); near(p.v, .375); assert.deepEqual(p.tint, [.6, .6, .6]);
  p.vx = .1; p.vy = -.2; p.vz = .1; const uv = [p.u, p.v]; c.particles.step();
  near(p.y, .1); near(p.vx, .1 * .98 * .7); near(p.vy, 0); assert.deepEqual([p.u, p.v], uv);
  for (let i = 0; i < 6; i++) c.particles.step(); assert.equal(c.particles.active.length, 0);
  assert.equal(c.particles.spawn(block(), { x: 0, y: 2, z: 0 }, { x: 0, y: 0, z: 0 }), p, 'Expired particle record is reused');
  const capped = setup(new VoxelWorld(), { capacity: 16 });
  capped.particles.breakBlock(block()); capped.particles.breakBlock(block()); assert.equal(capped.particles.active.length, 16); assert.equal(capped.particles.pool.length, 16);
});

test('instant breaks capture the actual block before removal, create exactly 64 cell centers in both modes, and support separate small mining hits', () => {
  const definition = registerBlockType({ id: 'particle.tinted', particleTexture: 'tinted.texture', particleTint: [.5, .25, 1] });
  for (const mode of ['survival', 'creative']) {
    const c = setup(new VoxelWorld({ depth: 0 })); c.setGameMode(mode); c.teleport({ x: 3.5, y: 0, z: .5 });
    c.world.setBlock(0, 1, 0, true); c.world.blockAt = (x, y, z) => c.world.hasBlock(x, y, z) ? { x, y, z, definition } : null;
    c.inventory.insert('test.block', 10);
    assert.equal(breakTargetBlock({ controller: c, world: c.world, yaw: Math.PI / 2, pitch: 0 }), true);
    const particles = values(c.particles); assert.equal(particles.length, 64);
    assert.equal(new Set(particles.map(p => `${p.x},${p.y},${p.z}`)).size, 64);
    assert.ok(particles.every(p => p.texture === 'tinted.texture' && p.kind === 'break'));
    assert.deepEqual(particles[0].tint, [.3, .15, .6]);
    assert.equal(c.drops.total(), mode === 'creative' ? 0n : 1n);
    assert.equal(breakTargetBlock({ controller: c, world: c.world, yaw: Math.PI / 2, pitch: 0 }), false); assert.equal(c.particles.active.length, 64);
  }
  const c = setup(), p = c.particles.miningHit(block(), { x: 1, y: 0, z: 0 });
  near(p.x, 1.1); near(p.y, .5); near(p.z, .5); near(p.halfSize, .045); near(p.side, .12); near(p.vy, .1);
});

test('sprint effects use the supporting block and scaled width, permit nearby airborne feet, and suppress walking/crouching/empty air', () => {
  const world = new VoxelWorld({ depth: 0 }); world.setBlock(0, -1, 0, true); const c = setup(world);
  const player = { ...c.player, size: 2, x: 1.3, y: .1, z: .5, sprinting: true, grounded: false, vx: .2, vz: -.3 };
  c.particles.playerEffects(player); assert.equal(c.particles.active.length, 1);
  const p = values(c.particles)[0]; assert.equal(p.kind, 'sprint'); near(p.y, .2); assert.equal(p.texture, 'test.block');
  c.particles.playerEffects({ ...player, sprinting: false }); c.particles.playerEffects({ ...player, crouching: true });
  c.particles.playerEffects({ ...player, y: 4 }); c.particles.playerEffects({ ...player, flying: true }); assert.equal(c.particles.active.length, 1);
  assert.ok(p.x >= player.x - .6 && p.x <= player.x + .6);
});

test('landing counts use pre-final-tick downward travel once, align overhanging bursts with support, and ignore ordinary jumps, teleports and active flight', () => {
  assert.equal(landingParticleCount(3.99), 0); assert.equal(landingParticleCount(4), 40); assert.equal(landingParticleCount(5), 50); assert.equal(landingParticleCount(1000), 375);
  const world = new VoxelWorld({ depth: 0 }); world.setBlock(0, -1, 0, true); const c = setup(world);
  c.teleport({ x: 1.25, y: 8, z: .5 }); let previousDistance;
  for (let i = 0; i < 80 && !c.player.grounded; i++) { previousDistance = c.player.fallDistance; c.update(.05); }
  assert.equal(c.player.grounded, true); near(c.player.landingFallDistance, previousDistance); near(c.player.fallDistance, 0);
  const particles = values(c.particles); assert.equal(particles.length, landingParticleCount(previousDistance));
  assert.ok(particles.every(p => p.kind === 'landing' && p.x >= .95 && p.x <= 1));
  c.update(.05); assert.equal(c.player.landingFallDistance, 0); assert.equal(c.particles.pool.length, particles.length);
  const jump = setup(); for (let i = 0; i < 40; i++) jump.update(.05, { jump: true }); assert.equal(jump.particles.active.length, 0);
  jump.player.fallDistance = 100; jump.teleport({ x: .5, y: 0, z: .5 }); jump.update(.05); assert.equal(jump.particles.active.length, 0);
  jump.setGameMode('creative'); jump.player.flying = true; jump.player.fallDistance = 100; jump.player.vy = -100; jump.update(.05); assert.equal(jump.particles.active.length, 0);
});

test('nearest-filter particle textures and per-texture billboard batches are shared, crop once, interpolate, and cull without changing physics', () => {
  const c = setup(), renderer = new BlockParticleRenderer(new THREE.Scene());
  const particleMap = getParticleTexture(); assert.equal(particleMap, getParticleTexture());
  assert.equal(particleMap.image, getBlockAssets().texture.image); assert.equal(particleMap.magFilter, THREE.NearestFilter); assert.equal(particleMap.minFilter, THREE.NearestFilter);
  assert.equal(getBlockAssets().texture.minFilter, THREE.LinearMipmapLinearFilter);
  const p = c.particles.spawn(block(), { x: 0, y: 1, z: -3 }, { x: 0, y: 0, z: 0 }); p.x = 1;
  c.particles.spawn(block(), { x: 0, y: 1, z: 3 }, { x: 0, y: 0, z: 0 });
  const camera = new THREE.PerspectiveCamera(75, 1, .05, 100); camera.position.y = 1;
  renderer.update(c.particles, .5, camera); const batch = renderer.batches.get('test.block');
  assert.equal(renderer.batches.size, 1); assert.equal(batch.geometry.instanceCount, 1); near(batch.attributes.particleCenter.getX(0), .5);
  assert.equal(batch.geometry.isInstancedBufferGeometry, true); near(batch.attributes.particleSize.getX(0), .075);
  const geometry = batch.geometry, material = batch.material; camera.rotation.y = Math.PI; renderer.update(c.particles, .5, camera);
  assert.equal(batch.geometry, geometry); assert.equal(batch.material, material); assert.equal(batch.geometry.instanceCount, 1); assert.equal(c.particles.active.length, 2);
  registerParticleTexture('future.texture', getBlockAssets().texture); assert.equal(getParticleTexture('future.texture'), particleMap); renderer.dispose();
});

test('adaptive quality has sustained thresholds, gradual recovery, ignores inactive time and respects a known frame cap', () => {
  const q = new AdaptiveVisualQuality(); let time = 0;
  const frames = (fps, seconds) => { for (let i = 0; i < fps * seconds; i++) { time += 1000 / fps; q.recordFrame(time); } };
  frames(60, 1); frames(42, 4); assert.equal(q.level, 1); frames(25, 4); assert.equal(q.level, 2);
  q.recordFrame(time + 60000, { active: false }); time += 60000; assert.equal(q.level, 2);
  frames(60, 7); assert.equal(q.level, 1); frames(60, 6); assert.equal(q.level, 0);
  const capped = new AdaptiveVisualQuality({ frameRateCap: 30 }); for (let i = 0; i < 300; i++) capped.recordFrame(i * 1000 / 30);
  assert.equal(capped.level, 0); near(capped.target, 30);
});

test('reduced/low effects thin single events, spread bursts, cap the pool and skip only cosmetic merge visuals', () => {
  for (const level of [0, 1, 2]) {
    const c = setup(new VoxelWorld(), { quality: quality(level) }); c.particles.breakBlock(block());
    assert.equal(c.particles.active.length, 64 * VISUAL_QUALITY[level].particleFraction);
    for (const axis of ['x', 'y', 'z']) { const positions = values(c.particles).map(p => p[axis]); assert.ok(Math.min(...positions) < .25 && Math.max(...positions) > .75); }
    const single = setup(new VoxelWorld(), { quality: quality(level) });
    for (let i = 0; i < 4; i++) single.particles.playerEffects({ ...single.player, sprinting: true });
    assert.equal(single.particles.active.length, 4 * VISUAL_QUALITY[level].particleFraction);
  }
  const c = setup(); c.player.x = 100; c.player.z = 100;
  c.drops.spawn('test.block', 1, { x: 0, y: 0, z: -4 }); c.drops.spawn('test.block', 20, { x: .5, y: 0, z: -4 });
  const renderer = new DroppedItemRenderer(new THREE.Scene()), source = c.drops.transitions[0].id;
  renderer.update(c.drops, 0, null, quality(0)); assert.equal(renderer.meshes.has(source), true);
  const total = c.drops.total(), expiry = c.drops.piles[0].lots.map(l => l.expires);
  renderer.update(c.drops, 0, null, quality(2)); assert.equal(renderer.meshes.has(source), false);
  assert.equal(c.drops.total(), total); assert.deepEqual(c.drops.piles[0].lots.map(l => l.expires), expiry);
});

test('particle quality does not change gameplay, and muted inventory ticks still simulate particles and expanded pickup', () => {
  const results = [];
  for (const level of [0, 2]) {
    const c = setup(new VoxelWorld(), { quality: quality(level) }); c.throwItem({ id: 'test.block', count: 1 }, () => .5);
    for (let i = 0; i < 80; i++) c.update(.05, { forward: 1, sprint: true, jump: true });
    results.push({ player: c.player, quantity: c.drops.total(), lots: c.drops.piles.flatMap(p => p.lots).map(l => [l.count, l.expires, l.pickup]) });
  }
  assert.deepEqual(results[0], results[1]);
  const c = setup(); const p = c.particles.spawn(block(), { x: .5, y: 2, z: .5 }, { x: 0, y: 0, z: 0 });
  c.drops.spawn('test.block', 2, { x: 1.75, y: .2, z: 1.75 });
  c.update(.05, { gameplayEnabled: false, forward: 1, jump: true }); assert.equal(p.age, 1); near(c.player.x, .5); near(c.player.y, 0); assert.equal(c.inventory.mainHand.count, 2);
});
