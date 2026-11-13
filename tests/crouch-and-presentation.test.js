import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Window } from 'happy-dom';
import * as THREE from 'three';
import { MovementController } from '../src/movement.js';
import { VoxelWorld, playerBounds } from '../src/voxel-world.js';
import { DEFAULT_SETTINGS } from '../src/player-settings.js';
import { ChatUI } from '../src/chat-ui.js';
import { createPlayerAnimation, interpolatePlayerAnimation } from '../src/player-animation.js';
import { createPlayerModel, animatePlayerModel, updatePlayerCamera, createEmptyHand, updateEmptyHand, MODEL_SCALE } from '../src/player-visuals.js';
import { EntityHitboxes } from '../src/entity-hitboxes.js';
const near = (a, b, eps = 1e-8) => assert.ok(Math.abs(a - b) < eps, `Expected ${b}, got ${a}`);
const tick = controller => controller.update(0.05);
const pose = (state = createPlayerAnimation()) => interpolatePlayerAnimation(state, state, 0);
function uiFixture(t) {
  let time = 0, hitboxes = false;
  const window = new Window({ url: 'http://localhost:4173', settings: { disableJavaScriptEvaluation: true, disableJavaScriptFileLoading: true, disableCSSFileLoading: true } });
  window.document.write(readFileSync(new URL('../index.html', import.meta.url), 'utf8'));
  const document = window.document;
  const controller = new MovementController(new VoxelWorld());
  const ui = new ChatUI({ document, window, controller, clearInput: () => controller.pause(), requestCapture: () => {}, requestUnlock: () => {}, storage: window.localStorage,
    now: () => time, onHitboxToggle: () => { hitboxes = !hitboxes; } });
  const key = (code, repeat = false, up = false) => {
    const event = new window.KeyboardEvent(up ? 'keyup' : 'keydown', { key: code === 'KeyB' ? 'b' : code, code, repeat, bubbles: true, cancelable: true });
    document.body.dispatchEvent(event); return event;
  };
  t.after(() => { ui.dispose(); window.happyDOM.abort(); window.close(); });
  return { ui, document, window, controller, key, time: value => { time = value; ui.updateVisibility(); }, hitboxes: () => hitboxes };
}

test('help is one compact multiline server reply, /default resets the four settings, and obsolete HUD is gone', t => {
  const f = uiFixture(t);
  f.ui.onPointerLockChange(true);
  f.ui.service.submit('/help');
  assert.equal(f.ui.service.messages.length, 1);
  const text = f.ui.elements['chat-log'].textContent;
  assert.equal((text.match(/<server>/g) || []).length, 1);
  assert.match(text, /^<server>: Commands\n\/help — Show commands\n\/speed <value> — Walking speed/);
  assert.match(text, /\/default — Reset all player settings/);
  assert.equal(text.split('\n').length, 11);
  for (const command of ['/speed 6', '/reach 10', '/jump 3', '/size 2', '/default']) f.ui.service.submit(command);
  assert.deepEqual(f.controller.settings, DEFAULT_SETTINGS);
  assert.equal(f.document.querySelector('.telemetry'), null);
  assert.equal(f.document.querySelector('.scale-note'), null);
  assert.doesNotMatch(f.document.body.textContent, /LIVE TELEMETRY|1 BLOCK =|m³/);
  assert.equal(f.document.getElementById('show-first-person-body'), null);
});

test('both F5 cameras scale to 2/8/4 blocks, sweep a larger camera box at size two, and restore distance', () => {
  const controller = new MovementController(new VoxelWorld());
  controller.respawn({ x: 0.5, y: 0, z: 0.5 });
  for (const size of [0.5, 2, 1]) {
    assert.equal(controller.configure('size', size).ok, true);
    for (const mode of [1, 2]) {
      const camera = new THREE.PerspectiveCamera();
      near(updatePlayerCamera(camera, mode, controller.renderState(), 0, 0, controller.world), 4 * size);
      near(camera.position.y, 1.62 * size);
    }
  }
  controller.configure('size', 2);
  for (const mode of [1, 2]) {
    const z = mode === 1 ? 3 : -3;
    controller.world.setBlock(0, 3, z, true);
    const camera = new THREE.PerspectiveCamera();
    const distance = updatePlayerCamera(camera, mode, controller.renderState(), 0, 0, controller.world);
    assert.ok(distance < 8);
    if (mode === 1) assert.ok(camera.position.z + 0.2 < z);
    else assert.ok(camera.position.z - 0.2 > z + 1);
    controller.world.setBlock(0, 3, z, false);
    near(updatePlayerCamera(camera, mode, controller.renderState(), 0, 0, controller.world), 8);
  }
});

test('legs keep a non-overlapping seam and pure hip X swings through standing, walk, sprint and crouch', () => {
  const model = createPlayerModel();
  for (const mode of [1, 2]) for (const [amount, phase, crouch] of [[0, 0, 0], [0.7, 1, 0], [1, 2, 0], [0.4, 1.2, 1]]) {
    const state = { ...pose(), amount, phase, crouch };
    animatePlayerModel(model, { x: 0, y: 0, z: 0 }, state, mode);
    model.updateMatrixWorld(true);
    const left = new THREE.Box3().setFromObject(model.userData.parts['Left Leg']);
    const right = new THREE.Box3().setFromObject(model.userData.parts['Right Leg']);
    assert.ok(left.max.x <= right.min.x + 1e-9);
    for (const name of ['Left Leg', 'Right Leg']) {
      near(model.userData.joints[name].rotation.y, 0); near(model.userData.joints[name].rotation.z, 0);
    }
  }
  animatePlayerModel(model, { x: 0, y: 0, z: 0 }, pose(), 0);
  assert.equal(model.visible, false, 'Looking down cannot reveal a hidden world avatar');
});

test('one swing clock rejects early restarts, accepts tick three, and drives the arm forward in avatar space', () => {
  const controller = new MovementController(new VoxelWorld());
  controller.requestSwing(); tick(controller);
  assert.equal(controller.player.animation.swingSerial, 1);
  controller.requestSwing(); tick(controller); // Age 1: ignored.
  assert.equal(controller.player.animation.swingSerial, 1);
  tick(controller); // Age 2.
  controller.requestSwing(); tick(controller); // Age 3: restart accepted.
  assert.equal(controller.player.animation.swingSerial, 2);
  for (let i = 0; i < 6; i++) tick(controller);
  assert.equal(controller.player.animation.swingAge, -1);
  const model = createPlayerModel();
  for (const mode of [1, 2]) {
    animatePlayerModel(model, { x: 0, y: 0, z: 0 }, pose(), mode);
    model.updateMatrixWorld(true);
    const hand = model.userData.parts['Right Arm'];
    const resting = hand.localToWorld(new THREE.Vector3(0, -6 * MODEL_SCALE, 0));
    const active = { ...pose(), swingActive: true, swingProgress: 0.25 };
    animatePlayerModel(model, { x: 0, y: 0, z: 0 }, active, mode);
    model.updateMatrixWorld(true);
    const striking = hand.localToWorld(new THREE.Vector3(0, -6 * MODEL_SCALE, 0));
    assert.ok(striking.z < resting.z - 0.1, 'Forward is -Z in both camera views');
    const before = model.userData.joints['Right Arm'].matrixWorld.clone();
    animatePlayerModel(model, { x: 0, y: 0, z: 0 }, active, mode);
    model.updateMatrixWorld(true);
    assert.deepEqual(model.userData.joints['Right Arm'].matrixWorld.elements, before.elements);
  }
  const hand = createEmptyHand();
  const rest = hand.rig.matrix.clone();
  updateEmptyHand(hand, { ...pose(), amount: 1, phase: 100 });
  assert.deepEqual(hand.rig.matrix.elements, rest.elements, 'No walk bob or idle sway');
});

for (const size of [1, 2]) {
  test(`size ${size}: crouch speed, low-ceiling release, eye easing, and diagonal ledge overhang`, () => {
    const controller = new MovementController(new VoxelWorld());
    controller.configure('size', size);
    controller.respawn({ x: 0.5 * size, y: 0, z: 0.5 * size });
    controller.keyDown('ShiftLeft'); controller.keyDown('KeyW');
    tick(controller);
    near(controller.player.eyeOffset, 1.445 * size);
    for (let i = 0; i < 100; i++) tick(controller);
    const start = controller.player.z;
    for (let i = 0; i < 100; i++) tick(controller);
    near((start - controller.player.z) / 5, 1.2951541850220268 * size);
    controller.keyDown('KeyR'); tick(controller);
    assert.equal(controller.player.sprinting, false, 'Cannot initiate a sprint while crouched');
    const low = new MovementController(new VoxelWorld());
    low.configure('size', size); low.respawn({ x: 0.5, y: 0, z: 0.5 });
    low.world.setBlock(0, size === 1 ? 2 : 3, 0, true);
    low.keyDown('ShiftLeft'); low.keyDown('Space'); tick(low); low.keyUp('Space');
    low.keyUp('ShiftLeft'); tick(low);
    assert.equal(low.player.crouching, true);
    const bounds = playerBounds(low.player); near(bounds.max.y - bounds.min.y, 1.5 * size);
    low.world.setBlock(0, size === 1 ? 2 : 3, 0, false);
    low.player.vy = 0; const feetY = low.player.y; tick(low);
    assert.equal(low.player.crouching, false); near(low.player.y, feetY);
    const platform = new VoxelWorld({ depth: 0 });
    for (let x = 0; x < size; x++) for (let z = 0; z < size; z++) platform.setBlock(x, -1, z, true);
    const edge = new MovementController(platform);
    edge.configure('size', size); edge.respawn({ x: 0.5 * size, y: 0, z: 0.5 * size });
    edge.keyDown('ShiftLeft'); edge.keyDown('KeyW'); edge.keyDown('KeyD');
    for (let i = 0; i < 120; i++) tick(edge);
    assert.equal(edge.player.grounded, true); near(edge.player.y, 0);
    assert.ok(edge.player.x > size && edge.player.x < 1.3 * size);
    assert.ok(edge.player.z < 0 && edge.player.z > -0.3 * size);
    edge.keyDown('Space'); tick(edge);
    assert.ok(edge.player.y > 0, 'Upward jumps are not clipped by ledge protection');
  });
}

test('chat fades ten seconds after the latest message, revives for replies and stays visible while open', t => {
  const f = uiFixture(t);
  f.ui.onPointerLockChange(true); f.ui.service.submit('hi');
  f.time(9999); assert.equal(f.ui.elements['chat-panel'].style.opacity, '1');
  f.time(10500); near(Number(f.ui.elements['chat-panel'].style.opacity), 0.5);
  f.time(11001); assert.equal(f.ui.elements['chat-panel'].hidden, true);
  f.ui.service.reply('hello'); assert.equal(f.ui.elements['chat-panel'].hidden, false);
  f.time(25000); assert.equal(f.ui.elements['chat-panel'].hidden, true);
  f.ui.openChat(''); assert.equal(f.ui.elements['chat-panel'].hidden, false);
  f.time(50000); assert.equal(f.ui.elements['chat-panel'].style.opacity, '1');
  assert.match(f.ui.elements['chat-log'].textContent, /hi.*hello/);
});

test('F3+B toggles once per B press, ignores repeat, and outlines use actual scaled crouch bounds', t => {
  const f = uiFixture(t); f.ui.onPointerLockChange(true);
  assert.equal(f.key('F3').defaultPrevented, true);
  f.key('KeyB'); assert.equal(f.hitboxes(), true);
  f.key('KeyB', true); f.key('KeyB'); assert.equal(f.hitboxes(), true);
  f.key('KeyB', false, true); f.key('KeyB'); assert.equal(f.hitboxes(), false);
  f.key('F3', false, true); f.key('KeyB', false, true); f.key('KeyB'); assert.equal(f.hitboxes(), false);
  const scene = new THREE.Scene(), boxes = new EntityHitboxes(scene);
  const entity = { id: 'local', local: true, x: 1, y: 2, z: 3, size: 2, crouching: false };
  boxes.update([entity], 1, true);
  const line = boxes.lines.get('local'); near(line.scale.x, 1.2); near(line.scale.y, 3.6);
  entity.crouching = true; boxes.update([entity], 2, true); near(line.scale.y, 3); near(line.position.y, 3.5);
  assert.equal(boxes.material.depthTest, true); assert.equal(boxes.material.depthWrite, false);
  near(line.rotation.y, 0); boxes.update([entity], 0, true); assert.equal(line.visible, false);
  boxes.dispose();
});
