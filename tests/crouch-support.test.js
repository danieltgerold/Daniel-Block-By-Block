import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { MovementController } from '../src/movement.js';
import { VoxelWorld, playerBounds } from '../src/voxel-world.js';
import { protectSneakingEdge } from '../src/player-posture.js';
import { EntityHitboxes } from '../src/entity-hitboxes.js';
const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-8, `${a} != ${b}`);
const tick = (controller, input = {}) => controller.update(.05, input);
const platform = () => { const world = new VoxelWorld({ depth: 0 }); world.setBlock(0, -1, 0, true); return world; };

test('full footprint supports a mostly overhanging player after stopping and standing, with identical F3+B horizontal bounds', () => {
  for (const size of [1, 1.6, 2]) {
    const world = platform(), c = new MovementController(world);
    c.configure('size', size); c.respawn({ x: .5, y: 0, z: .5 });
    for (let i = 0; i < 100; i++) tick(c, { right: 1, forward: -1, crouch: true });
    for (let i = 0; i < 60; i++) tick(c, { crouch: true });
    const before = playerBounds(c.player), feet = { x: c.player.x, y: c.player.y, z: c.player.z };
    assert.ok(c.player.x > 1 && c.player.z > 1, 'Center overhangs both block edges');
    assert.ok(before.min.x < 1 && before.min.z < 1, 'A corner of the footprint still overlaps');
    assert.equal(world.supportProbe(c.player), true); assert.equal(world.isSupported(c.player), true);
    const boxes = new EntityHitboxes(new THREE.Scene());
    for (const mode of [1, 2]) {
      boxes.update([{ ...c.player, id: 'local', local: true }], mode, true);
      const line = boxes.lines.get('local'); near(line.scale.x, .6 * size); near(line.scale.y, 1.5 * size);
      near(line.position.x - line.scale.x / 2, before.min.x);
    }
    for (let i = 0; i < 20; i++) tick(c);
    const standing = playerBounds(c.player);
    assert.equal(c.player.crouching, false); assert.equal(c.player.grounded, true);
    for (const axis of ['x', 'y', 'z']) near(c.player[axis], feet[axis]);
    for (const axis of ['x', 'z']) { near(standing.min[axis], before.min[axis]); near(standing.max[axis], before.max[axis]); }
    boxes.update([{ ...c.player, id: 'local', local: true }], 2, true);
    near(boxes.lines.get('local').scale.y, 1.8 * size); boxes.dispose();
    // Normal movement may leave the footprint unsupported once Shift is up.
    for (let i = 0; i < 15; i++) tick(c, { right: 1 });
    assert.ok(c.player.y < 0); assert.equal(c.player.grounded, false);
    c.respawn(feet); tick(c); world.setBlock(0, -1, 0, false); tick(c, { crouch: true }); tick(c, { crouch: true });
    assert.ok(c.player.y < 0, 'Removing support causes a real fall, even while crouched');
  }
});

test('normal edge motion retains Java X, then Z, then diagonal 0.05-size reductions and a 0.6-size support depth', () => {
  for (const size of [1, 2]) {
    const world = platform(), p = { x: 1 + .25 * size, y: 0, z: 1 + .25 * size, size, crouching: true };
    const motion = protectSneakingEdge(world, p, .12 * size, .12 * size);
    near(motion.x, .02 * size); near(motion.z, .02 * size);
    assert.equal(world.supportProbe({ ...p, y: .59 * size }), true);
    assert.equal(world.supportProbe({ ...p, y: .61 * size }), false);
    assert.equal(world.isSupported({ ...p, y: .4 * size }), false, 'Nearby support is not grounded contact');
  }
});

test('high speed cannot skip an unsupported gap even if the destination is supported, including fractional-size narrow gaps', () => {
  for (const size of [1, 1.6, 2]) {
    const world = platform(); world.setBlock(3, -1, 0, true);
    const c = new MovementController(world); c.configure('size', size); c.respawn({ x: .5, y: 0, z: .5 });
    assert.equal(world.supportProbe({ ...c.player, x: 3.5 }), true);
    assert.equal(world.supportedPath(c.player, 3, 0), false);
    c.player.vx = 3; tick(c, { crouch: true });
    assert.ok(c.player.x < 1 + .3 * size); assert.equal(c.player.grounded, true); near(c.player.vx, 0);
  }
  const narrow = platform(); narrow.setBlock(2, -1, 0, true);
  assert.equal(narrow.supportedPath({ x: .5, y: 0, z: .5, size: 1.6 }, 2, 0), false, 'Finds the 0.04-block unsupported interval');
  const dug = new VoxelWorld(); dug.setBlock(1, -1, 0, false);
  assert.equal(dug.supportedPath({ x: .5, y: 0, z: .5, size: 1 }, 2, 0), false, 'Also checks holes in analytic default terrain');
  const run = fps => {
    const world = platform(); world.setBlock(3, -1, 0, true);
    const c = new MovementController(world); c.configure('speed', 255); c.respawn({ x: .5, y: 0, z: .5 });
    for (let i = 0; i < fps; i++) c.update(1 / fps, { right: 1, crouch: true });
    assert.equal(c.player.grounded, true); assert.ok(c.player.x < 1.3);
    return c.player.x;
  };
  const reference = run(20); near(run(5), reference); near(run(60), reference); near(run(144), reference);
});

test('edge limiting preserves upward jumping and gravity-driven descent onto nearby support', () => {
  const world = platform(), c = new MovementController(world);
  c.respawn({ x: 1.25, y: 0, z: .5 }); c.player.vx = 3;
  tick(c, { crouch: true, jump: true }); assert.ok(c.player.x > 3); assert.ok(c.player.y > 0); assert.equal(c.player.grounded, false);
  c.respawn({ x: .5, y: .4, z: .5 }); c.player.grounded = false; c.player.vy = -.05;
  const initial = c.player.y; tick(c, { crouch: true }); assert.ok(c.player.y < initial); assert.equal(c.player.grounded, false);
  for (let i = 0; i < 12; i++) tick(c, { crouch: true });
  near(c.player.y, 0); assert.equal(c.player.grounded, true);
});
