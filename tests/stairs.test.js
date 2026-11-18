import test from 'node:test';
import assert from 'node:assert/strict';
import { VoxelWorld } from '../src/voxel-world.js';
import { MovementController } from '../src/movement.js';
import { placeBlock } from '../src/block-actions.js';
import { stairBoxes, DIRECTIONS, turnFacing } from '../src/block-shapes.js';
import { buildChunkMesh } from '../src/voxel-mesh.js';
import { BlockOutline } from '../src/block-outline.js';
import { RECIPES } from '../src/recipes.js';
import { ITEMS } from '../src/inventory.js';
import { FUELS } from '../src/smelting.js';
import { commandCompletions } from '../src/chat-commands.js';
const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-6, `${a} != ${b}`);
const stair = (w, x, y, z, facing = 'north', half = 'bottom', id = 'oak.stairs') => w.setBlock(x, y, z, id, { facing, half });

test('both stairs register, craft four with either mirror, burn 300 ticks and drop only in Survival', () => {
  for (const wood of ['oak', 'pine']) {
    const id = `${wood}.stairs`; assert.equal(ITEMS.get(id).maxStack, 64); assert.equal(FUELS.get(id), 300);
    assert.deepEqual(commandCompletions(`/give ${id}`), [`/give ${id} `]);
    for (const mirror of [false, true]) {
      const grid = Array(9).fill(null);
      for (let y = 0; y < 3; y++) for (let x = 0; x <= y; x++) grid[y * 3 + (mirror ? 2 - x : x)] = { id: `${wood}.planks`, count: 1 };
      assert.deepEqual(RECIPES.match(grid, 3, ITEMS).recipe.output, { id, count: 4 });
      grid[4] = { id: `${wood === 'oak' ? 'pine' : 'oak'}.planks`, count: 1 }; assert.equal(RECIPES.match(grid, 3, ITEMS), null);
    }
    const w = new VoxelWorld({ depth: 0 }); stair(w, 0, 0, 0, 'north', 'bottom', id);
    w.destroyBlock(0, 0, 0, { gameMode: 'survival' }); assert.equal(w.pendingDrops[0].stack.id, id); assert.equal(w.pendingDrops[0].stack.count, 1);
    stair(w, 0, 0, 0, 'north', 'bottom', id); w.destroyBlock(0, 0, 0, { gameMode: 'creative' }); assert.equal(w.pendingDrops.length, 1);
  }
});

test('placement keeps yaw facing and clicked face/height half, with cached straight/inner/outer geometry', () => {
  for (const [i, facing] of Object.keys(DIRECTIONS).entries()) for (const [normal, height, half] of [
    [{ x: 0, y: 1, z: 0 }, 1, 'bottom'], [{ x: 0, y: -1, z: 0 }, 0, 'top'],
    [{ x: 1, y: 0, z: 0 }, .25, 'bottom'], [{ x: 1, y: 0, z: 0 }, .75, 'top'],
  ]) {
    const w = new VoxelWorld({ depth: 0 }); w.setBlock(0, 0, 0, 'stone');
    const at = placeBlock(w, 'oak.stairs', { x: 0, y: 0, z: 0, normal, point: { x: .5, y: height, z: .5 } }, -i * Math.PI / 2);
    assert.deepEqual(w.blockStateAt(at.x, at.y, at.z), { facing, half, shape: 'straight' });
    for (const [shape, volume] of [['straight', .75], ['outer-left', .625], ['outer-right', .625], ['inner-left', .875], ['inner-right', .875]]) {
      const state = { facing, half, shape }, boxes = stairBoxes(state);
      near(boxes.reduce((sum, b) => sum + (b[3] - b[0]) * (b[4] - b[1]) * (b[5] - b[2]), 0), volume);
      assert.equal(stairBoxes({ ...state }), boxes);
    }
  }
});

test('Java corner guards, mixed woods, halves and chunk-neighbor updates survive save/load without drops', () => {
  for (const facing of Object.keys(DIRECTIONS)) for (const side of [-1, 1]) for (const outer of [true, false]) {
    const w = new VoxelWorld({ depth: 0 }), other = turnFacing(facing, side), [fx, , fz] = DIRECTIONS[turnFacing(facing, outer ? 0 : 2)];
    stair(w, 15, 0, 15, facing); stair(w, 15 + fx, 0, 15 + fz, other, 'bottom', 'pine.stairs');
    const shape = `${outer ? 'outer' : 'inner'}-${side === -1 ? 'left' : 'right'}`;
    assert.equal(w.blockStateAt(15, 0, 15).shape, shape);
    const saved = w.save(); saved.edits.forEach(e => { if (e.state) e.state = { ...e.state, shape: 'straight' }; });
    const loaded = new VoxelWorld({ depth: 3 }); loaded.load(JSON.parse(JSON.stringify(saved)));
    assert.equal(loaded.blockStateAt(15, 0, 15).shape, shape);
    const [gx, , gz] = DIRECTIONS[turnFacing(other, outer ? 2 : 0)];
    stair(w, 15 + gx, 0, 15 + gz, facing); assert.equal(w.blockStateAt(15, 0, 15).shape, 'straight');
    w.setBlock(15 + gx, 0, 15 + gz, false); assert.equal(w.blockStateAt(15, 0, 15).shape, shape);
    stair(w, 15 + fx, 0, 15 + fz, other, 'top', 'pine.stairs'); assert.equal(w.blockStateAt(15, 0, 15).shape, 'straight');
    stair(w, 15 + fx, 0, 15 + fz, facing); assert.equal(w.blockStateAt(15, 0, 15).shape, 'straight');
    assert.equal(w.pendingDrops.length, 0);
  }
});

test('stair collision, rays, outlines and chunk LOD meshes share the raised footprint', () => {
  const w = new VoxelWorld({ depth: 0 }); stair(w, 15, 0, 0); stair(w, 15, 0, -1, 'west', 'bottom', 'pine.stairs');
  assert.equal(w.blockStateAt(15, 0, 0).shape, 'outer-left');
  for (const [x, z, top] of [[15.25, .25, 1], [15.75, .25, .5], [15.25, .75, .5]]) {
    const hit = w.raycast({ x, y: 3, z }, { x: 0, y: -1, z: 0 }); near(hit.point.y, top);
    near(w.movePlayer({ x, y: 3, z }, { x: 0, y: -10, z: 0 }, .05, .2).y, top);
    const outline = new BlockOutline(); outline.update(hit, w); assert.equal(outline.children.length, 2);
  }
  for (const lod of [1, 2, 4]) {
    const mesh = buildChunkMesh(w, 0, 0, lod), ys = mesh.positions.filter((_, i) => i % 3 === 1);
    near(Math.max(...ys), 1); near(Math.min(...ys), 0); assert.ok(ys.includes(.5));
  }
});

test('general step-up climbs slab to full block, implicit ground and a staircase without jumping', () => {
  const w = new VoxelWorld({ depth: 3 }); w.setBlock(0, 0, 0, 'oak.slab'); w.setBlock(1, 0, 0, 'stone');
  const p = { x: .5, y: .5, z: .5, grounded: true };
  const moved = w.movePlayer(p, { x: .6, y: 0, z: 0 }); near(moved.x, 1.1); near(moved.y, 1); assert.equal(moved.grounded, true);
  const buried = new VoxelWorld({ depth: 3 }); buried.setBlock(0, -1, 0, 'oak.slab');
  const out = buried.movePlayer({ ...p, y: -.5 }, { x: .6, y: 0, z: 0 }); near(out.y, 0); near(out.x, 1.1);
  const diagonal = w.movePlayer(p, { x: .6, y: 0, z: .1 }); near(diagonal.x, 1.1); near(diagonal.y, 1);
  for (const fps of [30, 144]) {
    const world = new VoxelWorld({ depth: 3 }), c = new MovementController(world);
    for (let x = 0; x < 4; x++) { for (let y = 0; y < x; y++) world.setBlock(x, y, 0, 'stone'); stair(world, x, x, 0, 'east'); }
    c.teleport({ x: -.6, y: 0, z: .5 }); let peak = 0;
    for (let n = 0; n < fps * 1.3; n++) { c.update(1 / fps, { forward: true, yaw: -Math.PI / 2 }); peak = Math.max(peak, c.player.y); assert.ok(c.player.vy <= 0); }
    assert.ok(peak >= 3, `staircase stopped at ${peak} at ${fps} FPS`);
  }
});

test('step-up honors headroom, full walls, size, flight, and high-speed continuous blocking', () => {
  const w = new VoxelWorld({ depth: 3 }); w.setBlock(1, 0, 0, 'stone');
  const p = { x: .5, y: 0, z: .5, grounded: true };
  near(w.movePlayer(p, { x: 100, y: 0, z: 0 }).x, .7);
  const large = w.movePlayer({ ...p, x: -1, size: 2 }, { x: 2, y: 0, z: 0 }); near(large.y, 1);
  w.setBlock(0, 0, 0, 'oak.slab'); w.setBlock(1, 2, 0, 'stone');
  near(w.movePlayer({ ...p, y: .5 }, { x: 2, y: 0, z: 0 }).x, .7);
  near(w.movePlayer({ ...p, y: .5, flying: true }, { x: 2, y: 0, z: 0 }).x, .7);
  near(w.movePlayer({ ...p, y: .5 }, { x: 2, y: .1, z: 0 }).x, .7);
});
