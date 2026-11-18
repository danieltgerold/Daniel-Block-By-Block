import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { VoxelWorld } from '../src/voxel-world.js';
import { ChunkRenderer } from '../src/chunk-renderer.js';
import { buildChunkMesh } from '../src/voxel-mesh.js';
import { buildWaterMesh } from '../src/fluid-mesh.js';
import { waterCorner } from '../src/fluid-surface.js';
const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-7, `${a} != ${b}`);
const source = (w, x, y = 0, z = 0) => w.setBlock(x, y, z, 'water');

test('4096 distant water cells never enter local terrain/collision/targeting scans; sparse developer sweeps remain bounded', () => {
  const w = new VoxelWorld(); w.setBlock(2, 0, 2, 'oak.slab');
  for (let x = 128; x < 192; x++) for (let z = 128; z < 192; z++) source(w, x, 0, z);
  w.edits = function* () { throw new Error('local operation scanned every world edit'); };
  assert.ok(buildChunkMesh(w, 0, 0).quads > 0);
  const p = { x: .5, y: 0, z: .5, grounded: true };
  near(w.movePlayer(p, { x: .2, y: -.08, z: .1 }).y, 0); assert.equal(w.isSupported(p), true);
  assert.equal(w.supportingBlock(p).id, 'test.block'); assert.equal(w.supportedPath(p, 3, 0), true);
  assert.equal(w.raycast({ x: .5, y: 2, z: .5 }, { x: 0, y: -1, z: 0 }).y, -1);
  assert.equal(w.raycast({ x: .5, y: 2, z: .5 }, { x: 0, y: -1, z: 0 }, 5, { waterSources: true }).y, -1);
  const bounded = w.sweepBox({ x: .5, y: 2, z: .5 }, { x: 1e12, y: -4, z: 1e12 }, .1);
  near(bounded, .475 - 1e-6); assert.equal(w.hasSolidInBox({ x: -1e12, y: -.1, z: -1e12 }, { x: 1e12, y: 0, z: 1e12 }), true);
  w.setBlock(10, 0, 0, 'stone'); near(w.movePlayer(p, { x: 1e12, y: 0, z: 0 }).x, 9.7);
  assert.equal(w.fluids.sample({ x: -4, y: 0, z: -4 }, { x: 4, y: 10, z: 4 }).inWater, false);
});

test('terrain and water invalidation stay separate, boundary corners update, and deferred replacement retains and disposes old buffers', () => {
  const w = new VoxelWorld(), scene = new THREE.Scene(), renderer = new ChunkRenderer(w, scene, new THREE.MeshBasicMaterial(), { viewDistance: 40, buildsPerFrame: 100, waterBuildsPerFrame: 1 });
  for (const x of [15, 16]) for (const z of [15, 16]) source(w, x, 0, z);
  source(w, 136, 0, 136);
  const entries = [[0, 0], [1, 0], [0, 1], [1, 1]].map(([x,z]) => renderer.rebuild(x,z,1));
  const remote = renderer.rebuild(8,8,1), remoteGeometry = remote.waterMesh.geometry;
  const terrain = entries.map(c => c.mesh.geometry), water = entries.map(c => c.waterMesh.geometry);
  const bounds = w.chunkBounds(0,0);
  for (let n = 0; n < 20; n++) w.setBlock(15,0,15,'water',{level:n%2+1});
  assert.equal(w.chunkBounds(0,0), bounds, 'level changes keep cached bounds');
  assert.ok(entries.every(c => c.waterDirty && !c.terrainDirty)); assert.equal(remote.waterDirty, false);
  const camera = new THREE.PerspectiveCamera(90, 1, .05, 150); camera.position.set(16,30,16); camera.lookAt(16,0,16);
  const disposed = new Set(); water.forEach((geometry,i) => geometry.addEventListener('dispose', () => disposed.add(i)));
  renderer.update(camera); assert.equal(disposed.size, 1, 'one budgeted rebuild, not one per changed cell');
  entries.forEach((entry,i) => { assert.equal(entry.mesh.geometry, terrain[i]); if (entry.waterDirty) { assert.equal(entry.waterMesh.geometry, water[i]); assert.equal(entry.waterMesh.visible, true); } });
  for (let i = 0; i < 6; i++) renderer.update(camera);
  assert.ok(entries.every(c => !c.waterDirty)); assert.equal(disposed.size, 4); assert.equal(remote.waterMesh.geometry, remoteGeometry);
  w.setBlock(3,0,3,'stone'); const before = entries.map(c => c.waterMesh.geometry), pending = [...w.fluids.pending];
  w.destroyBlock(3,0,3,{gameMode:'creative'}); renderer.invalidateBlock(3,3,true);
  assert.deepEqual(entries.map(c => c.waterMesh.geometry), before); assert.equal(remote.waterMesh.geometry, remoteGeometry); assert.deepEqual([...w.fluids.pending], pending);
  assert.ok(entries.slice(1).every((c,i) => c.mesh.geometry === terrain[i+1]), 'interior dry break does not rebuild neighbor terrain');
  renderer.dispose(); assert.equal(scene.children.length, 0);
});

test('cached/merged water retains shared corners, slopes and repeating UVs; nearby openings wake settled water and indexes survive load', () => {
  const w = new VoxelWorld();
  for (let x = 0; x < 32; x++) for (let z = 0; z < 16; z++) source(w,x,0,z);
  const mesh = buildWaterMesh(w,0,0); assert.ok(mesh.indices.length / 6 < 150, 'flat compatible tops are merged'); assert.ok(Math.max(...mesh.uvs) > 1, 'merged top repeats the existing texture');
  const old = waterCorner(w,16,0,8); w.setBlock(16,0,8,'water',{level:5}); const changed = waterCorner(w,16,0,8); assert.notEqual(changed,old);
  for (const cx of [0,1]) { const data = buildWaterMesh(w,cx,0); assert.ok(data.positions.some((value,i) => i%3===1 && Math.abs(value-changed)<1e-8)); }
  const saved = w.save(), restored = new VoxelWorld(); restored.load(JSON.parse(JSON.stringify(saved)));
  assert.deepEqual(restored.save(), saved); assert.equal(restored.sourceChunks.size, w.sourceChunks.size); assert.deepEqual(buildWaterMesh(restored,0,0), buildWaterMesh(w,0,0));
  const flow = new VoxelWorld(); flow.setBlock(1,0,0,'stone'); source(flow,0); for(let i=0;i<80;i++) flow.step(.05);
  assert.equal(flow.fluids.pending.size,0); flow.setBlock(1,0,0,false); assert.ok(flow.fluids.pending.size>0);
  for(let i=0;i<5;i++)flow.step(.05); assert.equal(flow.blockIdAt(1,0,0),'water');
});
