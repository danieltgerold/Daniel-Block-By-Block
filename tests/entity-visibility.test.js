import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { EntityVisibility } from '../src/entity-visibility.js';
import { DroppedItemRenderer, DROPPED_ITEM_RENDER_SETTINGS, PILE_OFFSETS } from '../src/dropped-item-renderer.js';
import { MovementController } from '../src/movement.js';
import { VoxelWorld } from '../src/voxel-world.js';
import { updatePlayerCamera } from '../src/player-visuals.js';
import { mergeEase } from '../src/dropped-items.js';
const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-8, `${a} != ${b}`);
const camera = () => { const c = new THREE.PerspectiveCamera(75, 1, .05, 500); c.position.y = .3; return c; };
const controller = () => { const c = new MovementController(new VoxelWorld()); c.respawn({ x: 100, y: 0, z: 100 }); return c; };
const drawn = mesh => mesh?.visible ? mesh.children.filter(cube => cube.visible).length : 0;

test('reusable visibility uses authored bounds, including every rotating/bobbing cluster corner without per-frame model bounds', () => {
  const policy = new EntityVisibility(), cam = camera(); policy.beginFrame(cam);
  const edge = { x: Math.tan(75 * Math.PI / 360) * 5 + .2, y: 0, z: -5 };
  assert.equal(policy.evaluate(edge, { bounds: { radius: .01 } }, {}).visible, false);
  assert.equal(policy.evaluate(edge, { bounds: { radius: 1 } }, {}).visible, true, 'A large entity may be partly in view even when its center is outside');
  const center = new THREE.Vector3(0, .3, 0), axis = new THREE.Vector3(0, 1, 0);
  for (const bob of [0, .1, .2]) for (const rotation of [0, 1.2, 3]) PILE_OFFSETS.forEach((offset, i) => {
    for (const x of [-.125, .125]) for (const y of [-.125, .125]) for (const z of [-.125, .125]) {
      const point = new THREE.Vector3(x, y, z).applyAxisAngle(axis, i * .37).add(new THREE.Vector3(...offset))
        .applyAxisAngle(axis, rotation).add(new THREE.Vector3(0, .2 + bob, 0));
      assert.ok(point.distanceTo(center) <= DROPPED_ITEM_RENDER_SETTINGS.bounds.radius);
    }
  });
});

test('24-block detail switches have a half-block hysteresis buffer and retain shared cached cubes across changes', () => {
  const c = controller(), cam = camera(), renderer = new DroppedItemRenderer(new THREE.Scene());
  const p = c.drops.spawn('test.block', 64, { x: 0, y: 0, z: -24 });
  const move = z => { p.z = z; p.previous.z = z; renderer.update(c.drops, 0, cam); return renderer.meshes.get(p.id); };
  const group = move(-24); assert.equal(drawn(group), 5); const cubes = [...group.children];
  assert.equal(drawn(move(-24.2)), 5); assert.equal(drawn(move(-24.6)), 1);
  assert.equal(drawn(move(-24.4)), 1); assert.equal(drawn(move(-23.6)), 1); assert.equal(drawn(move(-23.4)), 5);
  assert.deepEqual(group.children, cubes, 'LOD only changes visibility, not cube allocation');
  group.children.forEach(cube => { assert.equal(cube.geometry, renderer.prototype.geometry); assert.equal(cube.material, renderer.prototype.material); });
  p.lots[0].count = p.count = 2n; move(-10); assert.equal(drawn(group), 2);
  assert.equal(c.drops.total(), 2n);
});

test('camera turns and F5 changes reveal piles immediately and use the actual rear/front camera distance', () => {
  const c = controller(), cam = camera(), renderer = new DroppedItemRenderer(new THREE.Scene());
  const front = c.drops.spawn('test.block', 64, { x: 0, y: 0, z: -22 });
  const back = c.drops.spawn('test.block', 64, { x: 0, y: 0, z: 22 });
  renderer.update(c.drops, 0, cam); const frontModel = renderer.meshes.get(front.id);
  assert.equal(drawn(frontModel), 5); assert.equal(renderer.meshes.has(back.id), false, 'Unseen piles do not allocate a model');
  cam.rotation.y = Math.PI; renderer.update(c.drops, 0, cam);
  assert.equal(frontModel.visible, false); assert.equal(drawn(renderer.meshes.get(back.id)), 5);
  const feet = { x: 0, y: 0, z: 0, size: 1, eyeHeight: 1.62 };
  updatePlayerCamera(cam, 1, feet, 0, 0); renderer.update(c.drops, 0, cam);
  assert.equal(renderer.meshes.get(front.id), frontModel); assert.equal(drawn(frontModel), 1, 'Rear camera is over 24 blocks away although the player is only 22 away');
  updatePlayerCamera(cam, 0, feet, 0, 0); renderer.update(c.drops, 0, cam); assert.equal(drawn(frontModel), 5);
  updatePlayerCamera(cam, 2, feet, 0, 0); renderer.update(c.drops, 0, cam);
  assert.equal(frontModel.visible, false); assert.equal(drawn(renderer.meshes.get(back.id)), 1, 'Front camera also uses its own offset position');
});

test('offscreen/simplified piles still merge, pick up and expire; merge visuals resume at the live destination without restarting', () => {
  const c = controller(), cam = camera(), renderer = new DroppedItemRenderer(new THREE.Scene());
  const target = c.drops.spawn('test.block', 50, { x: 0, y: 2, z: -8 }, { velocity: { x: .1, y: 0 } });
  const source = c.drops.spawn('test.block', 3, { x: 0, y: 2, z: -11 }, { velocity: { z: 1.4, y: 0 } });
  renderer.update(c.drops, 0, cam); const sourceModel = renderer.meshes.get(source.id);
  cam.rotation.y = Math.PI; renderer.update(c.drops, 0, cam); assert.equal(sourceModel.visible, false);
  c.update(.05); c.update(.05); assert.equal(c.drops.total(), 53n); assert.equal(c.drops.piles.length, 1);
  const effect = c.drops.transitions[0], deadlines = target.lots.map(l => l.expires);
  cam.rotation.y = 0; renderer.update(c.drops, .5, cam); assert.equal(sourceModel.visible, true);
  const t = mergeEase((c.drops.time + .025 - effect.started) / .25), destinationX = (target.previous.x + target.x) / 2;
  near(sourceModel.position.x, effect.from.x + (destinationX - effect.from.x) * t);
  cam.position.set(target.x, 2.2, -9.8); renderer.update(c.drops, .5, cam);
  assert.equal(renderer.meshes.get(target.id).visible, false, 'Merge destination is behind this camera');
  assert.equal(sourceModel.visible, true, 'Source animation still draws while moving toward an offscreen destination');
  cam.position.set(0, .3, 0);
  cam.position.z = 30; renderer.update(c.drops, .5, cam);
  assert.equal(drawn(renderer.meshes.get(target.id)), 1); assert.equal(c.drops.total(), 53n); assert.deepEqual(target.lots.map(l => l.expires), deadlines);
  for (let n = 0; n < 6; n++) c.update(.05); renderer.update(c.drops, 0, cam); assert.equal(renderer.meshes.has(source.id), false);
  const pickup = controller(); pickup.drops.spawn('test.block', 5, { x: 100, y: .2, z: 100 });
  renderer.update(pickup.drops, 0, camera()); pickup.update(.05); assert.equal(pickup.inventory.mainHand.count, 5); assert.equal(pickup.drops.total(), 0n);
  pickup.inventory.insert('test.block', 2304); const expiring = pickup.drops.spawn('test.block', 7, { x: 100, y: .2, z: 100 });
  pickup.drops.time = expiring.lots[0].expires - .05; pickup.update(.05); renderer.update(pickup.drops, 0, camera());
  assert.equal(pickup.drops.total(), 0n); assert.equal(renderer.states.size, 0); assert.equal(renderer.meshes.size, 0);
});
