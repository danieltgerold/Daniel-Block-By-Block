import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Window } from 'happy-dom';
import * as THREE from 'three';
import { MovementController } from '../src/movement.js';
import { VoxelWorld } from '../src/voxel-world.js';
import { ChatUI } from '../src/chat-ui.js';
import { InventoryUI } from '../src/inventory-ui.js';
import { createEmptyHand, updateEmptyHand, createPlayerModel, animatePlayerModel, syncEquipment } from '../src/player-visuals.js';
import { DroppedItemRenderer } from '../src/dropped-item-renderer.js';

const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-8, `${a} != ${b}`);
const tick = c => c.update(.05);
const block = count => ({ id: 'test.block', count });
function fixture(t) {
  const window = new Window({ url: 'http://localhost:4173', settings: { disableJavaScriptEvaluation: true, disableJavaScriptFileLoading: true, disableCSSFileLoading: true } });
  const document = window.document; document.write(readFileSync(new URL('../index.html', import.meta.url), 'utf8'));
  const c = new MovementController(new VoxelWorld());
  let requests = 0;
  const inventoryUI = new InventoryUI({ inventory: c.inventory, document, window,
    onClose: () => ui.closeInventory(), onGameplayDrop: () => { requests++; c.requestSwing(); } });
  const ui = new ChatUI({ document, window, controller: c, inventoryUI,
    clearInput: options => c.pause(options), requestCapture: () => {}, requestUnlock: () => {}, storage: window.localStorage });
  t.after(() => { inventoryUI.dispose(); ui.dispose(); window.happyDOM.abort(); window.close(); });
  const key = (code, options = {}) => document.body.dispatchEvent(new window.KeyboardEvent('keydown', { code, key: code, bubbles: true, cancelable: true, ...options }));
  ui.onPointerLockChange(true);
  return { c, ui, inventoryUI, key, requests: () => requests };
}

test('opening/closing real inventory preserves airborne velocity/interpolation and matches released-key drag at different render rates', t => {
  for (const fps of [30, 144]) {
    const f = fixture(t), baseline = new MovementController(new VoxelWorld());
    for (const c of [f.c, baseline]) {
      c.keyDown('KeyW'); c.update(.25, { jump: true }); c.update(.025);
      c.placementHeld = true; c.placementPresses = 1;
    }
    assert.equal(f.c.player.grounded, false);
    const velocity = f.c.player.vz, position = f.c.renderState(), accumulator = f.c.accumulator;
    f.key('KeyE'); f.ui.onPointerLockChange(false);
    assert.equal(f.ui.mode, 'inventory'); near(f.c.player.vz, velocity); near(f.c.accumulator, accumulator);
    assert.deepEqual(f.c.renderState(), position); assert.equal(f.c.heldKeys.size, 0);
    assert.equal(f.c.placementHeld, false); assert.equal(f.c.placementPresses, 0);
    baseline.clearHeldInputs();
    f.key('KeyW'); f.key('Space');
    for (let i = 0; i < fps / 2; i++) {
      f.c.update(1 / fps, { gameplayEnabled: false }); baseline.update(1 / fps);
    }
    for (const axis of ['x', 'y', 'z', 'vx', 'vy', 'vz']) near(f.c.player[axis], baseline.player[axis]);
    assert.ok(f.c.player.z < position.z, 'Carried motion continues, rather than falling straight down');
    assert.ok(Math.abs(f.c.player.vz) < Math.abs(velocity), 'Normal drag slows carried motion');
    const carried = f.c.player.vz;
    f.key('KeyE'); f.ui.onPointerLockChange(true); near(f.c.player.vz, carried);
    f.ui.pause(); near(f.c.player.vz, 0); // Escape pause keeps its existing behavior.
  }
});

test('only successful gameplay Q/Ctrl+Q requests a swing, ignores repeats and obeys the shared halfway restart gate', t => {
  const f = fixture(t), { c } = f;
  c.inventory.slots[0] = block(5); tick(c);
  f.key('KeyQ'); assert.equal(c.inventory.mainHand.count, 4); assert.equal(f.requests(), 1);
  tick(c); assert.equal(c.player.animation.swingAge, 0); assert.equal(c.player.animation.swingSerial, 1);
  const hand = createEmptyHand(); updateEmptyHand(hand, { ...c.renderState().animation, swingActive: false }, c.inventory);
  const resting = hand.mainItem.matrix.clone();
  f.key('KeyQ', { repeat: true }); assert.equal(c.inventory.mainHand.count, 4); assert.equal(f.requests(), 1);
  f.key('KeyQ'); tick(c); assert.equal(c.player.animation.swingSerial, 1);
  tick(c); f.key('KeyQ'); tick(c); assert.equal(c.player.animation.swingSerial, 2);
  assert.equal(c.player.animation.equipHeight, 1, 'Stack count changes do not unequip the block');
  tick(c); c.update(.025); updateEmptyHand(hand, c.renderState().animation, c.inventory);
  assert.equal(hand.mainItem.visible, true); assert.notDeepEqual(hand.mainItem.matrix.elements, resting.elements);
  f.key('KeyQ', { ctrlKey: true }); assert.equal(c.inventory.mainHand, null); assert.equal(f.requests(), 4);
  assert.equal(c.drops.total(), 5n); f.key('KeyQ'); assert.equal(f.requests(), 4);
  f.key('KeyE'); c.inventory.slots[9] = block(2); f.inventoryUI.hovered = 9;
  f.key('KeyQ'); assert.equal(c.inventory.slots[9].count, 1); assert.equal(f.requests(), 4);
});

test('final drop lowers the old item, switches below 0.1, and raises the empty hand on six interpolated ticks', t => {
  for (const ctrlKey of [false, true]) {
    const f = fixture(t), { c } = f, hand = createEmptyHand();
    c.inventory.slots[0] = block(ctrlKey ? 8 : 1); tick(c); f.key('KeyQ', { ctrlKey });
    assert.equal(c.inventory.mainHand, null, 'Inventory changes immediately');
    for (const [i, expected] of [.6, .2, 0, .4, .8, 1].entries()) {
      c.update(i === 0 ? .05 : .025); const pose = c.player.animation; near(pose.equipHeight, expected);
      c.update(.025); const rendered = c.renderState().animation;
      near(rendered.equipHeight, (c.previous.animation.equipHeight + pose.equipHeight) / 2);
      updateEmptyHand(hand, rendered, c.inventory);
      assert.equal(hand.mainItem.visible, i < 2); assert.equal(hand.rig.visible, i >= 2);
    }
    near(c.player.animation.swingAge, 5); tick(c); assert.equal(c.player.animation.swingAge, -1);
    updateEmptyHand(hand, c.renderState().animation, c.inventory);
    updateEmptyHand(hand, { ...c.renderState().animation, swingActive: false }, c.inventory);
    const resting = hand.rig.matrix.clone();
    tick(c); updateEmptyHand(hand, c.renderState().animation, c.inventory);
    assert.deepEqual(hand.rig.matrix.elements, resting.elements); assert.equal(hand.rig.visible, true);
  }
});

test('drop swing uses the existing forward shoulder pose and attached block in both F5 views while crouching/walking', t => {
  const f = fixture(t), { c } = f, model = createPlayerModel();
  c.inventory.slots[0] = block(2); tick(c); f.key('KeyQ'); tick(c); tick(c); tick(c); c.update(.025);
  const pose = { ...c.renderState().animation, amount: .5, phase: 2, crouch: 1 };
  for (const mode of [1, 2]) {
    animatePlayerModel(model, c.renderState(), pose, mode, c.inventory); syncEquipment(model, c.inventory);
    assert.equal(model.visible, true); assert.equal(model.userData.equipment.rightItem.visible, true);
    const joint = model.userData.joints['Right Arm'];
    const resting = new THREE.Vector3(0, -.4, 0).applyEuler(joint.rotation);
    assert.ok(resting.z < 0, 'Right arm swings toward avatar local -Z in either camera');
    assert.equal(model.userData.equipment.rightItem.parent, joint);
  }
});

test('first-tick thrown-item merge keeps a brief cosmetic launch, transfers once, and preserves pickup/expiry through chained merges', () => {
  const c = new MovementController(new VoxelWorld()), renderer = new DroppedItemRenderer(new THREE.Scene());
  c.teleport({ x: 100, y: 0, z: 100 });
  c.drops.spawn('test.block', 100, { x: 10, y: 2, z: 10 }, { velocity: { y: 0 } });
  const thrown = c.drops.spawn('test.block', 1, { x: 10, y: 2, z: 10 }, { thrown: true, velocity: { z: -.3, y: .1 } });
  const lot = thrown.lots[0]; tick(c);
  assert.equal(c.drops.piles.length, 1); assert.equal(c.drops.total(), 101n);
  const effect = c.drops.transitions.find(e => e.id === thrown.id); assert.ok(effect.flight);
  renderer.update(c.drops); const launch = renderer.meshes.get(thrown.id).position.clone();
  tick(c); renderer.update(c.drops); assert.ok(renderer.meshes.get(thrown.id).position.z < launch.z);
  assert.equal(lot.pickup, 2); assert.equal(lot.expires, 300);
  c.drops.spawn('test.block', 200, { x: 10, y: 2, z: 10 });
  assert.equal(c.drops.total(), 301n); assert.equal(c.drops.piles[0].lots.filter(l => l === lot).length, 1);
  for (let i = 0; i < 10; i++) { tick(c); renderer.update(c.drops); }
  assert.equal(renderer.meshes.has(thrown.id), false); assert.equal(c.drops.total(), 301n);
});
