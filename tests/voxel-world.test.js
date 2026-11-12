import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { VoxelWorld, blockIntersectsPlayer } from '../src/voxel-world.js';
import { buildChunkMesh, chooseLod } from '../src/voxel-mesh.js';
import { ChunkRenderer } from '../src/chunk-renderer.js';
import { MovementController, createPlayer, stepPlayer } from '../src/movement.js';
const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-8, `Expected ${b}, got ${a}`);

test('terrain contains exactly three one-meter layers, including negative coordinates', () => {
  const world = new VoxelWorld();
  for (const x of [-17, -1, 0, 16]) {
    assert.equal(world.hasBlock(x, 0, x), false);
    for (const y of [-1, -2, -3]) assert.equal(world.hasBlock(x, y, x), true);
    assert.equal(world.hasBlock(x, -4, x), false);
  }
  world.setBlock(-1, -1, -1, false);
  assert.equal(world.hasBlock(-1, -1, -1), false);
  assert.equal(world.hasBlock(-1, -2, -1), true);
  world.setBlock(-1, -1, -1, true);
  assert.equal(world.chunkEdits.size, 0, 'Restoring default terrain removes the sparse edit');
});

test('selection ray hits successive layers and then the void after digging through', () => {
  const world = new VoxelWorld();
  const origin = { x: 0.5, y: 1.8, z: 0.5 };
  for (const y of [-1, -2, -3]) {
    const hit = world.raycast(origin, { x: 0, y: -1, z: 0 });
    assert.deepEqual({ x: hit.x, y: hit.y, z: hit.z }, { x: 0, y, z: 0 });
    assert.deepEqual(hit.normal, { x: 0, y: 1, z: 0 });
    near(hit.distance, 1.8 - (y + 1));
    world.setBlock(hit.x, hit.y, hit.z, false);
  }
  assert.equal(world.raycast(origin, { x: 0, y: -1, z: 0 }), null);
});

test('DDA respects reach and resolves negative coordinates and placement face normals', () => {
  const world = new VoxelWorld({ depth: 0 });
  world.setBlock(-3, 0, 0, true);
  assert.equal(world.raycast({ x: 0.5, y: 0.5, z: 0.5 }, { x: -1, y: 0, z: 0 }, 2), null);
  const hit = world.raycast({ x: 0.5, y: 0.5, z: 0.5 }, { x: -2, y: 0, z: 0 });
  assert.equal(hit.x, -3);
  near(hit.distance, 2.5);
  assert.deepEqual(hit.normal, { x: 1, y: 0, z: 0 });
  assert.ok(world.setBlock(hit.x + hit.normal.x, hit.y, hit.z, true));
  assert.equal(world.raycast({ x: 0.5, y: 0.5, z: 0.5 }, { x: -1, y: 0, z: 0 }).x, -2);
});

test('placement rejects occupied cells and either actual or interpolated player body', () => {
  const world = new VoxelWorld({ depth: 0 });
  const player = { x: 0.5, y: 0, z: 0.5 };
  assert.equal(world.canPlaceBlock(0, 0, 0, [player]), false);
  assert.equal(world.canPlaceBlock(0, 1, 0, [player]), false);
  assert.equal(world.canPlaceBlock(0, 2, 0, [player]), true, 'Touching the head is allowed');
  assert.equal(world.canPlaceBlock(0, -1, 0, [player]), true, 'Touching the feet is allowed');
  assert.equal(world.canPlaceBlock(1, 0, 0, [player, { x: 1.2, y: 0, z: 0.5 }]), false);
  world.setBlock(1, 0, 0, true);
  assert.equal(world.canPlaceBlock(1, 0, 0, []), false);
  assert.equal(blockIntersectsPlayer(0, 0, 0, player), true);
});

test('isolated geometry is exactly a 1m cube with all triangles facing outwards', () => {
  const world = new VoxelWorld({ depth: 0 });
  world.setBlock(2, 3, 4, true);
  const mesh = buildChunkMesh(world, 0, 0);
  assert.equal(mesh.quads, 6);
  for (let axis = 0; axis < 3; axis++) {
    const values = mesh.positions.filter((_, index) => index % 3 === axis);
    near(Math.min(...values), [2, 3, 4][axis]);
    near(Math.max(...values), [3, 4, 5][axis]);
  }
  for (let i = 0; i < mesh.indices.length; i += 3) {
    const points = mesh.indices.slice(i, i + 3).map(index => new THREE.Vector3().fromArray(mesh.positions, index * 3));
    const cross = points[1].clone().sub(points[0]).cross(points[2].clone().sub(points[0]));
    const normal = new THREE.Vector3().fromArray(mesh.normals, mesh.indices[i] * 3);
    assert.ok(cross.dot(normal) > 0);
  }
});

test('internal faces are omitted and greedy merging reduces flat terrain at every LOD', () => {
  const world = new VoxelWorld();
  for (const level of [1, 2, 4]) {
    const mesh = buildChunkMesh(world, 0, 0, level);
    assert.equal(mesh.quads, 2, 'Only the merged top and bottom are exposed');
    const ys = mesh.positions.filter((_, index) => index % 3 === 1);
    near(Math.min(...ys), -3);
    near(Math.max(...ys), 0);
  }
  const isolated = new VoxelWorld({ depth: 0 });
  isolated.setBlock(15, 0, 0, true);
  isolated.setBlock(16, 0, 0, true);
  assert.equal(buildChunkMesh(isolated, 0, 0).quads, 5);
  assert.equal(buildChunkMesh(isolated, 1, 0).quads, 5);
});

test('distant LOD uses fewer polygons for small edits; nearby mesh retains exact holes', () => {
  const world = new VoxelWorld();
  world.setBlock(1, -1, 1, false);
  const nearMesh = buildChunkMesh(world, 0, 0, 1);
  const farMesh = buildChunkMesh(world, 0, 0, 4);
  assert.ok(nearMesh.quads > farMesh.quads);
  assert.equal(farMesh.quads, 2);
  assert.equal(world.hasBlock(1, -1, 1), false, 'LOD never changes collision data');
  assert.equal(chooseLod(20), 1);
  assert.equal(chooseLod(70), 2);
  assert.equal(chooseLod(120), 4);
  assert.equal(chooseLod(50, 1), 1, 'Hysteresis keeps near detail at the threshold');
  assert.equal(chooseLod(44, 2), 2);
  assert.equal(chooseLod(35, 2), 1);
});

test('swept player collision stops at walls and floors without tunneling', () => {
  const world = new VoxelWorld();
  world.setBlock(1, 0, 0, true);
  const wall = world.movePlayer({ x: 0.5, y: 0, z: 0.5 }, { x: 3, y: 0, z: 0 });
  near(wall.x, 0.7);
  assert.equal(wall.blocked.x, true);
  assert.equal(wall.grounded, true);
  const fall = world.movePlayer({ x: 0.5, y: 10, z: 0.5 }, { x: 0, y: -20, z: 0 });
  near(fall.y, 0);
  assert.equal(fall.grounded, true);
});

test('standing on placed blocks and head collisions respect the full 2m player', () => {
  const world = new VoxelWorld();
  world.setBlock(0, 0, 0, true);
  const landing = world.movePlayer({ x: 0.5, y: 2, z: 0.5 }, { x: 0, y: -2, z: 0 });
  near(landing.y, 1);
  assert.equal(landing.grounded, true);
  world.setBlock(0, 0, 0, false);
  world.setBlock(0, 2, 0, true);
  const player = { ...createPlayer(), x: 0.5, z: 0.5 };
  stepPlayer(player, { jump: true }, world);
  near(player.y, 0);
  near(player.vy, 0);
  assert.equal(player.grounded, true);
});

test('breaking support makes the player fall into the hole and through all three layers', () => {
  const world = new VoxelWorld();
  const controller = new MovementController(world);
  controller.respawn({ x: 0.5, y: 0, z: 0.5 });
  world.setBlock(0, -1, 0, false);
  controller.keyDown('Space');
  controller.update(0.05);
  assert.equal(controller.player.grounded, false);
  assert.equal(controller.player.jumpCount, 0, 'Cannot jump off a block that was removed');
  controller.keyUp('Space');
  for (let i = 0; i < 20; i++) controller.update(0.05);
  near(controller.player.y, -1);
  assert.equal(controller.player.grounded, true);
  world.setBlock(0, -2, 0, false);
  world.setBlock(0, -3, 0, false);
  for (let i = 0; i < 30; i++) controller.update(0.05);
  assert.ok(controller.player.y < -3, 'There is no invisible floor under the blocks');
  const spawn = world.findSpawn();
  assert.ok(world.isSupported(spawn));
  controller.respawn(spawn);
  near(controller.renderState().y, spawn.y);
});

test('jump measurements remain relative to takeoff height on placed blocks', () => {
  const world = new VoxelWorld();
  world.setBlock(0, 0, 0, true);
  const controller = new MovementController(world);
  controller.respawn({ x: 0.5, y: 1, z: 0.5 });
  controller.keyDown('Space');
  for (let i = 0; i < 12; i++) controller.update(0.05);
  near(controller.player.y, 1);
  near(controller.player.lastJump.height, 1.252203352512);
  assert.equal(controller.player.lastJump.ticks, 12);
});

test('chunk renderer culls behind-camera chunks and loads all three distance LODs', () => {
  const world = new VoxelWorld();
  const scene = new THREE.Scene();
  const material = new THREE.MeshBasicMaterial();
  const chunks = new ChunkRenderer(world, scene, material, { buildsPerFrame: 1000 });
  const camera = new THREE.PerspectiveCamera(75, 16 / 9, 0.05, 200);
  camera.position.set(0.5, 1.8, 0.5);
  camera.lookAt(0.5, 0, -15);
  chunks.update(camera);
  assert.ok(chunks.stats.visibleChunks > 0);
  assert.ok(chunks.stats.lods.every(count => count > 0));
  assert.equal(chunks.chunks.has('0,2'), false, 'Behind-camera chunks are not even meshed');
  const front = [...chunks.chunks.values()].find(entry => entry.mesh.visible && entry.mesh.position.z < -32);
  assert.ok(front);
  camera.lookAt(0.5, 0, 15);
  chunks.update(camera);
  assert.equal(front.mesh.visible, false, 'Previously visible chunks stop rendering on camera turn');
  let disposed = false;
  front.mesh.geometry.addEventListener('dispose', () => { disposed = true; });
  camera.position.x = 1000;
  camera.lookAt(1000, 0, 15);
  chunks.update(camera);
  assert.equal(disposed, true, 'Far-away geometry is freed');
  chunks.dispose();
  material.dispose();
});

test('editing a chunk boundary invalidates both neighbors and replacement disposes old geometry', () => {
  const world = new VoxelWorld();
  const scene = new THREE.Scene();
  const material = new THREE.MeshBasicMaterial();
  const chunks = new ChunkRenderer(world, scene, material);
  const left = chunks.rebuild(0, 0, 1);
  const right = chunks.rebuild(1, 0, 1);
  let disposed = false;
  left.mesh.geometry.addEventListener('dispose', () => { disposed = true; });
  world.setBlock(15, -1, 0, false);
  chunks.invalidateBlock(15, 0);
  assert.equal(left.dirty, true);
  assert.equal(right.dirty, true);
  const replacement = chunks.rebuild(0, 0, 1, left);
  assert.equal(disposed, true);
  assert.equal(replacement.dirty, false);
  assert.ok(replacement.quads > 2);
  chunks.dispose();
  material.dispose();
});
