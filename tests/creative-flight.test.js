import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Window } from 'happy-dom';
import * as THREE from 'three';
import { MovementController, MOVEMENT } from '../src/movement.js';
import { VoxelWorld, playerBounds } from '../src/voxel-world.js';
import { updatePlayerCamera } from '../src/player-visuals.js';
import { ChatUI } from '../src/chat-ui.js';
import { InventoryUI } from '../src/inventory-ui.js';
const near = (a, b, eps = 1e-8) => assert.ok(Math.abs(a - b) < eps, `${a} != ${b}`);
const tick = (c, input = {}) => c.update(.05, input);
function controller(size = 1) {
  const c = new MovementController(new VoxelWorld());
  c.setGameMode('creative'); c.configure('size', size); c.teleport({ x: .5, y: 100, z: .5 }); return c;
}
function toggle(c) { c.keyDown('Space'); c.keyUp('Space'); c.keyDown('Space'); tick(c); c.keyUp('Space'); }

test('two distinct Space presses within seven ticks toggle Creative flight; repeats, late presses and Survival do not', () => {
  for (const gap of [0, 7, 8]) {
    const c = controller(); c.keyDown('Space'); c.keyUp('Space');
    for (let i = 0; i < gap; i++) tick(c);
    c.keyDown('Space'); tick(c);
    assert.equal(c.player.flying, gap <= 7);
  }
  const c = controller(); c.keyDown('Space');
  c.keyDown('Space', true); c.keyDown('Space'); tick(c);
  assert.equal(c.player.flying, false); c.keyUp('Space');
  c.keyDown('Space'); tick(c); c.keyUp('Space'); assert.equal(c.player.flying, true);
  toggle(c); assert.equal(c.player.flying, false); const oldVy = c.player.vy; tick(c); assert.ok(c.player.vy < oldVy);
  c.setGameMode('survival'); toggle(c); assert.equal(c.player.flying, false);
  const ground = new MovementController(new VoxelWorld()); ground.setGameMode('creative'); ground.keyDown('Space'); tick(ground);
  near(ground.player.y, .42); assert.equal(ground.player.flying, false); assert.equal(ground.player.jumpCount, 1);
});

test('actual fixed-tick flight settles at 10.888889/21.777778 blocks per second, scales with size and agrees across render rates', () => {
  const measured = [];
  for (const size of [1, 2]) for (const sprint of [false, true]) {
    for (const fps of [5, 60, 144]) {
      const c = controller(size); toggle(c); c.keyDown('KeyW'); if (sprint) c.keyDown('KeyR');
      for (let frame = 0; frame < 15 * fps; frame++) c.update(1 / fps, { yaw: .7, pitch: .9 });
      const start = { ...c.player };
      for (let frame = 0; frame < 5 * fps; frame++) c.update(1 / fps, { yaw: .7, pitch: -.9 });
      const speed = Math.hypot(c.player.x - start.x, c.player.z - start.z) / 5;
      near(speed, (sprint ? 21.77777777777778 : 10.88888888888889) * size);
      near(c.player.y, start.y); assert.equal(c.player.flying, true);
      if (fps === 60) measured.push({ size, sprint, blocksPerSecond: +speed.toFixed(6) });
    }
  }
  const c = controller(); toggle(c); c.configure('speed', 255);
  const before = c.player.z; tick(c, { forward: 1 }); near(before - c.player.z, .049);
  console.log('Flight measurements:', JSON.stringify(measured));
});

test('Space/Shift accelerate vertically, both keys cancel, releasing eases into hover, and Shift does not crouch in flight', () => {
  for (const size of [1, 2]) {
    const c = controller(size); c.player.flying = true; c.player.grounded = false;
    const y = c.player.y; tick(c, { jump: true }); near(c.player.y - y, .15 * size); near(c.player.vy, .09 * size);
    const next = c.player.y; tick(c, { jump: true, crouch: true }); near(c.player.y - next, .09 * size); near(c.player.vy, .054 * size);
    assert.equal(c.player.crouching, false);
    for (let i = 0; i < 50; i++) tick(c);
    near(c.player.vy, 0); const hover = c.player.y; tick(c); near(c.player.y, hover);
    tick(c, { crouch: true }); assert.ok(c.player.vy < 0); assert.equal(c.player.crouching, false);
    c.setGameMode('survival'); assert.equal(c.player.flying, false);
    const beforeVy = c.player.vy; tick(c, { crouch: true }); near(c.player.vy, (beforeVy - .08 * size) * .98);
    assert.equal(c.player.crouching, true);
  }
});

test('flight keeps the scaled swept hitbox at high velocity, stops at ceilings/walls, and disables on landing', () => {
  for (const size of [1, 2]) {
    const c = controller(size); c.configure('speed', 255); c.teleport({ x: .5, y: 4, z: .5 });
    c.player.flying = true; c.player.grounded = false;
    for (let y = 0; y < 10; y++) c.world.setBlock(3, y, 0, true);
    c.player.vx = 100; tick(c); near(c.player.x, 3 - .3 * size); near(c.player.vx, 0); assert.equal(c.player.flying, true);
    c.player.x = .5; c.world.setBlock(0, 10, 0, true); c.player.vy = 100; tick(c, { jump: true });
    near(c.player.y, 10 - 1.8 * size); near(c.player.vy, 0); assert.equal(c.player.flying, true);
    c.player.vy = -100; tick(c, { crouch: true }); near(c.player.y, 0);
    assert.equal(c.player.flying, false); assert.equal(c.player.grounded, true); near(c.player.vy, 0);
    tick(c, { crouch: true }); assert.equal(c.player.crouching, true);
    const bounds = playerBounds(c.player); near(bounds.max.y - bounds.min.y, 1.5 * size);
  }
});

test('chat, inventory and menu transitions clear flight inputs/tap state, keep hover safe, and require a fresh pair', t => {
  const window = new Window({ url: 'http://localhost:4173', settings: { disableJavaScriptEvaluation: true, disableJavaScriptFileLoading: true, disableCSSFileLoading: true } });
  const document = window.document; document.write(readFileSync(new URL('../index.html', import.meta.url), 'utf8'));
  const c = controller();
  const inventoryUI = new InventoryUI({ inventory: c.inventory, document, window, onClose: () => ui.closeInventory() });
  const ui = new ChatUI({ document, window, controller: c, inventoryUI, clearInput: () => c.pause(), requestCapture: () => {}, requestUnlock: () => {}, storage: window.localStorage });
  t.after(() => { inventoryUI.dispose(); ui.dispose(); window.happyDOM.abort(); window.close(); });
  for (const open of [() => ui.openChat(), () => ui.openInventory(), () => ui.pause()]) {
    ui.onPointerLockChange(true); c.keyDown('Space'); c.keyUp('Space'); open();
    assert.equal(c.heldKeys.size, 0); assert.equal(c.lastSpacePressTick, -Infinity); assert.equal(c.flightToggles, 0);
    ui.pause(); ui.onPointerLockChange(true); c.keyDown('Space'); tick(c); c.keyUp('Space');
    assert.equal(c.player.flying, false); c.pause();
  }
  toggle(c); c.keyDown('Space'); c.keyDown('ShiftLeft'); c.keyDown('KeyW'); tick(c);
  ui.pause(); assert.equal(c.player.flying, true); near(c.player.vy, 0);
  ui.onPointerLockChange(true); const y = c.player.y; tick(c); near(c.player.y, y);
});

test('R/double-W flight sprint and FOV compose smoothly; camera/targeting still use the scaled eye in every F5 mode', () => {
  const c = controller(2); toggle(c); c.player.vy = 0;
  c.keyDown('KeyW'); c.keyUp('KeyW'); c.keyDown('KeyW'); tick(c); assert.equal(c.player.sprinting, true);
  for (let i = 0; i < 50; i++) tick(c);
  near(c.player.fovMultiplier, 1.1 * 1.15);
  c.keyUp('KeyW'); tick(c); assert.equal(c.player.sprinting, false);
  c.keyDown('KeyW'); c.keyDown('KeyR'); tick(c); assert.equal(c.player.sprinting, true);
  for (const mode of [0, 1, 2]) {
    const state = c.renderState(), camera = new THREE.PerspectiveCamera();
    updatePlayerCamera(camera, mode, state, .7, .4, c.world);
    const eye = c.interactionRay(state, .7, .4).origin;
    near(camera.position.distanceTo(new THREE.Vector3(eye.x, eye.y, eye.z)), mode === 0 ? 0 : 8);
  }
  c.keyUp('KeyW'); c.keyUp('KeyR'); c.setGameMode('survival');
  const oldFov = c.player.fovMultiplier; tick(c); near(c.player.fovMultiplier, oldFov + (1 - oldFov) * .5);
  c.update(.025); near(c.renderState().fovMultiplier, (oldFov + c.player.fovMultiplier) / 2);
});
