import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Window } from 'happy-dom';
import * as THREE from 'three';
import { MovementController } from '../src/movement.js';
import { VoxelWorld } from '../src/voxel-world.js';
import { registerItem } from '../src/inventory.js';
import { DroppedItemRenderer, PILE_OFFSETS, droppedCubeCount } from '../src/dropped-item-renderer.js';
import { mergeEase } from '../src/dropped-items.js';
import { ChatUI } from '../src/chat-ui.js';
import { InventoryUI } from '../src/inventory-ui.js';
import { gameSimulationRunning, updateCrosshair } from '../src/gameplay-hud.js';
import { updatePlayerCamera } from '../src/player-visuals.js';
const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-8, `${a} != ${b}`);
const stack = count => ({ id: 'test.block', count });
const tick = c => c.update(.05);
const totalInventory = c => c.inventory.slots.reduce((n, s) => n + BigInt(s?.count ?? 0), BigInt(c.inventory.cursor?.count ?? 0));
function controller() { const c = new MovementController(new VoxelWorld()); c.respawn({ x: 100, y: 0, z: 100 }); return c; }

test('throws use eye minus 0.3, full look direction, bounded spread and 40-tick delay; items use drag/gravity and bounce', () => {
  const c = controller(); c.configure('size', 2); c.getAim = () => ({ yaw: Math.PI / 2, pitch: Math.PI / 6 });
  c.throwItem(stack(7), () => 1); const p = c.drops.piles[0];
  near(p.x, c.player.x); near(p.z, c.player.z); near(p.y, c.player.y + 3.24 - .3);
  near(p.vx, -.3 * Math.cos(Math.PI / 6) + .02); near(p.vy, .25); near(p.vz, 0); near(p.lots[0].pickup, 2);
  const oldVy = p.vy; tick(c); near(p.vy, (oldVy - .04) * .98);
  const bounce = c.drops.spawn('test.block', 1, { x: 10, y: .1, z: 10 }, { velocity: { y: -.4 } });
  tick(c); near(bounce.y, 0); near(bounce.vy, .08); tick(c); assert.ok(bounce.y > 0);
  c.inventory.slots[0] = stack(5); c.inventory.drop(0); c.inventory.drop(0, true);
  assert.equal(c.inventory.slots[0], null); assert.equal(c.drops.total(), 13n);
});

test('smaller piles animate into the live larger pile for 0.25 seconds with stable compact cubes and no physics mutation', () => {
  const c = controller(), renderer = new DroppedItemRenderer(new THREE.Scene());
  const large = c.drops.spawn('test.block', 100, { x: 10, y: 2, z: 10 }, { velocity: { x: .2, y: 0 } });
  const small = c.drops.spawn('test.block', 5, { x: 13, y: 2, z: 10 }, { velocity: { x: -1.4, y: 0 } });
  renderer.update(c.drops); const oldGroup = renderer.meshes.get(small.id);
  tick(c); assert.equal(c.drops.piles.length, 1); assert.equal(c.drops.piles[0].id, large.id); assert.equal(c.drops.total(), 105n);
  const effect = c.drops.transitions[0]; assert.equal(effect.targetId, large.id); near(effect.ends - effect.started, .25);
  renderer.update(c.drops); assert.equal(renderer.meshes.get(small.id), oldGroup); near(oldGroup.position.x, 13);
  tick(c); const physics = { x: large.x, y: large.y, z: large.z, vx: large.vx, vy: large.vy };
  renderer.update(c.drops, .5);
  const liveX = large.previous.x + (large.x - large.previous.x) * .5;
  const progress = mergeEase((c.drops.time + .025 - effect.started) / .25);
  near(oldGroup.position.x, effect.from.x + (liveX - effect.from.x) * progress);
  const liveY = large.previous.y + (large.y - large.previous.y) * .5, now = c.drops.time + .025;
  const ownBob = Math.sin((now - effect.born) * 2 + effect.phase) * .1 + .1;
  const targetBob = Math.sin((now - large.born) * 2 + large.phase) * .1 + .1;
  near(oldGroup.position.y, effect.from.y + (liveY - effect.from.y) * progress + .2 + ownBob + (targetBob - ownBob) * progress);
  assert.deepEqual({ x: large.x, y: large.y, z: large.z, vx: large.vx, vy: large.vy }, physics);
  const visible = renderer.meshes.get(large.id); assert.equal(visible.children.length, 5);
  visible.children.forEach((cube, i) => { assert.deepEqual(cube.position.toArray(), PILE_OFFSETS[i]); assert.ok(PILE_OFFSETS[i].every(n => Math.abs(n) <= .15)); });
  for (let n = 0; n < 5; n++) tick(c); renderer.update(c.drops);
  assert.equal(renderer.meshes.has(small.id), false); assert.equal(c.drops.total(), 105n);
  for (const [count, expected] of [[1n, 1], [2n, 2], [17n, 3], [33n, 4], [49n, 5]]) assert.equal(droppedCubeCount(count), expected);
});

test('partial pickup, chained merges, complete pickup and original despawn during transitions conserve every quantity', () => {
  const c = controller(); c.inventory.insert('test.block', 2304); c.inventory.slots[0].count = 60;
  c.player.x = .5; c.player.z = .5;
  const first = c.drops.spawn('test.block', 10, { x: .5, y: .2, z: .5 });
  c.drops.spawn('test.block', 20, { x: .6, y: .2, z: .5 });
  tick(c); assert.equal(c.inventory.mainHand.count, 64); assert.equal(c.drops.total(), 26n);
  const before = c.drops.total(); c.drops.merge(first, c.drops.piles[0]); assert.equal(c.drops.total(), before, 'Removed source cannot transfer twice');
  c.drops.spawn('test.block', 100, { x: .5, y: .2, z: .5 });
  assert.equal(c.drops.total(), 126n); assert.ok(c.drops.transitions.every(e => e.targetId === c.drops.piles[0].id));
  c.inventory.slots[0] = c.inventory.slots[1] = null;
  tick(c); assert.equal(c.drops.total(), 0n); assert.equal(c.drops.transitions.length, 0); assert.equal(totalInventory(c), 2302n);
  c.inventory.insert('test.block', 2304);
  c.drops.spawn('test.block', 7, { x: .5, y: .2, z: .5 }); c.drops.time += 299.9;
  c.drops.spawn('test.block', 8, { x: .5, y: .2, z: .5 });
  tick(c); tick(c); assert.equal(c.drops.total(), 8n, 'Old lot expires during the visible merge without resetting its lifetime');
  assert.equal(c.drops.transitions.length, 0);
});

test('inventory keeps simulation and pickups running with gameplay muted; Escape menu pauses the clock', t => {
  const window = new Window({ url: 'http://localhost:4173', settings: { disableJavaScriptEvaluation: true, disableJavaScriptFileLoading: true, disableCSSFileLoading: true } });
  const document = window.document; document.write(readFileSync(new URL('../index.html', import.meta.url), 'utf8'));
  const c = controller(); c.player.x = c.player.z = .5;
  const inventoryUI = new InventoryUI({ inventory: c.inventory, document, window, onClose: () => ui.closeInventory() });
  const ui = new ChatUI({ document, window, controller: c, inventoryUI, clearInput: () => c.pause(), requestCapture: () => {}, requestUnlock: () => {}, storage: window.localStorage });
  t.after(() => { inventoryUI.dispose(); ui.dispose(); window.happyDOM.abort(); window.close(); });
  const pile = c.drops.spawn('test.block', 3, { x: .5, y: 1, z: .5 }, { thrown: true });
  ui.onPointerLockChange(true); ui.openInventory(); c.keyDown('KeyW'); c.keyDown('Space'); c.placementHeld = true;
  const simulate = frames => { for (let i = 0; i < frames; i++) if (gameSimulationRunning(ui.mode)) c.update(.05, { gameplayEnabled: ui.mode === 'playing' }); };
  simulate(20); assert.ok(c.drops.time > .9); assert.ok(pile.y < 1); near(c.player.x, .5); near(c.player.z, .5);
  assert.equal(c.heldKeys.size, 0); assert.equal(c.placementHeld, false);
  simulate(20); assert.equal(c.inventory.mainHand.count, 3); assert.equal(c.drops.total(), 0n);
  const time = c.drops.time; ui.pause(); simulate(10); near(c.drops.time, time);
});

test('Creative pick selects an existing stack or creates one without losing displacement; Survival pick and no-target behavior remain intact', () => {
  registerItem({ id: 'test.pick.other', name: 'Other', maxStack: 64 });
  const c = controller(); c.world.setBlock(0, 1, 0, true); c.teleport({ x: 3.5, y: 0, z: .5 }); c.setGameMode('creative');
  for (const mode of [0, 1, 2]) {
    updatePlayerCamera(new THREE.PerspectiveCamera(), mode, c.renderState(), Math.PI / 2, 0, c.world);
    assert.equal(c.pickBlock(Math.PI / 2, 0), true); assert.equal(c.inventory.mainHand.id, 'test.block'); assert.equal(c.inventory.mainHand.count, 1);
  }
  c.inventory.slots[7] = stack(12); c.inventory.slots[0] = null; c.pickBlock(Math.PI / 2, 0); assert.equal(c.inventory.selected, 7);
  c.inventory.slots.fill(null); c.inventory.slots[9] = stack(10); c.pickBlock(Math.PI / 2, 0);
  assert.equal(c.inventory.mainHand.count, 1); assert.equal(c.inventory.slots[9].count, 10, 'Creative does not move/consume a main-inventory stack');
  c.inventory.slots.fill(null); for (let i = 0; i < 9; i++) c.inventory.slots[i] = { id: 'test.pick.other', count: 64 };
  c.inventory.select(3); c.pickBlock(Math.PI / 2, 0); assert.equal(c.inventory.selected, 3); assert.equal(c.inventory.slots[9].count, 64);
  for (let i = 0; i < 36; i++) c.inventory.slots[i] = { id: 'test.pick.other', count: 64 };
  c.pickBlock(Math.PI / 2, 0); assert.equal(c.drops.total(), 64n); assert.equal(c.inventory.mainHand.count, 1);
  const before = totalInventory(c); c.configure('reach', .1); assert.equal(c.pickBlock(Math.PI / 2, 0), false); assert.equal(totalInventory(c), before);
  c.configure('reach', 4.5); c.setGameMode('survival'); c.inventory.slots.fill(null); c.inventory.slots[10] = stack(8);
  c.pickBlock(Math.PI / 2, 0); assert.equal(c.inventory.mainHand.count, 8); assert.equal(c.inventory.slots[10], null);
});

test('crosshair is a crisp centered transparent 15-pixel inverse plus and only appears in focused first-person gameplay', t => {
  const window = new Window(); const document = window.document;
  t.after(() => { window.happyDOM.abort(); window.close(); });
  document.write(readFileSync(new URL('../index.html', import.meta.url), 'utf8'));
  const element = document.getElementById('crosshair'), svg = element.querySelector('svg');
  assert.equal(svg.getAttribute('viewBox'), '0 0 15 15'); assert.equal(svg.getAttribute('shape-rendering'), 'crispEdges');
  assert.equal(svg.querySelector('path').getAttribute('fill'), '#fff');
  for (const mode of ['playing', 'inventory', 'chat', 'menu', 'ready']) for (const cameraMode of [0, 1, 2]) {
    updateCrosshair(element, mode, cameraMode); assert.equal(element.hidden, mode !== 'playing' || cameraMode !== 0);
  }
  const css = readFileSync(new URL('../src/style.css', import.meta.url), 'utf8');
  const rule = css.match(/\.crosshair \{([^}]+)\}/)[1];
  for (const part of ['top: 50%', 'left: 50%', 'width: 15px', 'height: 15px', 'translate(-50%, -50%)', 'mix-blend-mode: difference', 'pointer-events: none', 'opacity: .85']) assert.ok(rule.includes(part));
});
