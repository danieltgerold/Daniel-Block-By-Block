import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Window } from 'happy-dom';
import { PlayerInventory, ITEMS, registerItem, STORAGE, OFFHAND } from '../src/inventory.js';
import { MovementController } from '../src/movement.js';
import { VoxelWorld } from '../src/voxel-world.js';
import { ChatService, LocalPlayerProfile } from '../src/chat.js';
import { ChatUI } from '../src/chat-ui.js';
import { InventoryUI } from '../src/inventory-ui.js';
import { InventoryPreviewPose } from '../src/inventory-preview.js';
import { createPlayerModel, syncEquipment, createEmptyHand, updateEmptyHand } from '../src/player-visuals.js';
const block = count => ({ id: 'test.block', count });
const total = inventory => inventory.slots.reduce((n, s) => n + BigInt(s?.count ?? 0), BigInt(inventory.cursor?.count ?? 0));
function chat(controller) { return new ChatService({ controller, profile: new LocalPlayerProfile(null, () => 'inventory-test') }); }

test('/give splits 130 into 64/64/2, handles errors, and preserves arbitrarily large full-inventory overflow in one pile', () => {
  const c = new MovementController(new VoxelWorld()), s = chat(c);
  s.submit('/give test.block 130'); assert.deepEqual(c.inventory.slots.slice(0, 3).map(s => s.count), [64, 64, 2]);
  for (const command of ['/give nope', '/give test.block 0', '/give test.block -1', '/give test.block 1.5', '/give test.block abc']) {
    s.submit(command); assert.equal(total(c.inventory), 130n);
  }
  c.inventory.insert('test.block', 2304); assert.equal(total(c.inventory), 2304n);
  s.submit('/give test.block 1000000000000000000000');
  assert.equal(c.drops.total(), 1000000000000000000000n); assert.equal(c.drops.piles.length, 1);
  assert.deepEqual(s.completions('/give te'), ['/give test.block ']);
  assert.deepEqual(s.completions('/tp '), ['/tp ~ ~ ~']);
  c.teleport({ x: 10.125, y: 64.5, z: -20.25 }); s.submit('/tp ~ ~1 ~-2');
  assert.deepEqual([c.player.x, c.player.y, c.player.z], [10.125, 65.5, -22.25]);
  s.submit('/tp ~.5, ~, ~+2'); assert.deepEqual([c.player.x, c.player.y, c.player.z], [10.625, 65.5, -20.25]);
});

test('left/right pickup, half rounding, one-item placement, merge, swap and armor restrictions conserve stacks', () => {
  registerItem({ id: 'test.other', name: 'Other', maxStack: 64 });
  const i = new PlayerInventory(); i.slots[0] = block(7);
  i.click(0, 2); assert.equal(i.cursor.count, 4); assert.equal(i.slots[0].count, 3);
  i.click(1, 2); assert.equal(i.slots[1].count, 1); assert.equal(i.cursor.count, 3);
  i.click(0); assert.equal(i.slots[0].count, 6); assert.equal(i.cursor, null);
  i.click(0); i.click(36); assert.equal(i.slots[36], null); assert.equal(i.cursor.count, 6);
  i.click(OFFHAND); assert.equal(i.offhand.count, 6); assert.equal(i.cursor, null);
  i.insert('test.block', 1); assert.equal(i.offhand.count, 7, 'Existing offhand partial stack fills before empty storage slots');
  i.cursor = block(10); i.slots[2] = block(60); i.click(2); assert.equal(i.slots[2].count, 64); assert.equal(i.cursor.count, 6);
  i.slots[3] = { id: 'test.other', count: 2 }; i.click(3, 2);
  assert.equal(i.slots[3].id, 'test.block'); assert.equal(i.cursor.id, 'test.other');
  assert.equal(i.swap(3, 36), false); assert.equal(i.slots[36], null);
});

test('both drag types visit slots once, preview equals commit, shift transfers partial stacks first and double collect caps at 64', () => {
  const i = new PlayerInventory(); i.cursor = block(10);
  assert.deepEqual([...i.dragPlan([0, 1, 2, 2], 0).values()], [3, 3, 3]);
  i.drag([0, 1, 2, 2], 0); assert.equal(i.cursor.count, 1); assert.equal(total(i), 10n);
  i.cursor = block(5); i.drag([3, 4, 4, 5], 2); assert.equal(i.cursor.count, 2);
  assert.deepEqual(i.slots.slice(3, 6).map(s => s.count), [1, 1, 1]);
  i.cursor = null; i.slots.fill(null); i.slots[0] = block(60); i.slots[9] = block(10); i.shift(9);
  assert.deepEqual([i.slots[0].count, i.slots[1].count, i.slots[9]], [64, 6, null]);
  i.slots[10] = block(10); i.slots[11] = block(10); i.shiftMatching('test.block', false);
  assert.equal(i.slots[1].count, 26); assert.equal(i.slots[10], null); assert.equal(i.slots[11], null);
  i.click(1); i.collect(); assert.equal(i.cursor.count, 64); assert.equal(total(i), 90n);
});

test('slot/offhand swaps, Q drops, outside cursor drops and closing a full inventory never lose items', () => {
  let dropped = 0n; const i = new PlayerInventory({ onDrop: s => { dropped += BigInt(s.count); } });
  i.slots[9] = block(7); i.swap(9, 2); assert.equal(i.slots[2].count, 7);
  i.swap(2, OFFHAND); assert.equal(i.offhand.count, 7); assert.equal(i.slots[2], null);
  assert.equal(i.insert('test.block', 1), 0n); assert.equal(i.offhand.count, 8, 'Offhand partial stack fills before an empty storage slot');
  i.drop(OFFHAND); i.drop(OFFHAND, true); assert.equal(dropped, 8n);
  i.cursor = block(8); i.dropCursor(false); assert.equal(i.cursor.count, 7); i.dropCursor(true); assert.equal(dropped, 16n);
  i.insert('test.block', 2304); i.cursor = block(17); i.close();
  assert.equal(total(i), 2304n); assert.equal(dropped, 33n); assert.equal(i.cursor, null);
  i.slots[0] = block(60); i.cursor = block(7); i.close(); assert.equal(i.slots[0].count, 64); assert.equal(dropped, 36n);
});

test('drops merge exact quantities, respect throw delay and collision, partially pick up, and expire each original lot after five active minutes', () => {
  const c = new MovementController(new VoxelWorld()); c.respawn({ x: .5, y: 0, z: .5 });
  c.inventory.insert('test.block', 2304); c.inventory.slots[0].count = 60;
  const first = c.drops.spawn('test.block', 100, { x: .5, y: .2, z: .5 });
  const expiry = first.lots[0].expires;
  c.update(.05); assert.equal(c.inventory.mainHand.count, 64); assert.equal(c.drops.total(), 96n);
  c.drops.spawn('test.block', 200, { x: 1, y: .2, z: .5 });
  assert.equal(c.drops.piles.length, 1); assert.equal(c.drops.total(), 296n); assert.ok(c.drops.piles[0].lots.some(l => l.expires === expiry));
  for (let n = 0; n < 30; n++) c.update(.05);
  assert.ok(c.drops.piles[0].y >= 0, 'Dropped cube collides with floor');
  c.drops.time = 299.95; c.update(.05); assert.equal(c.drops.total(), 200n);
  c.update(.05); assert.equal(c.drops.total(), 0n);
  c.inventory.slots[0] = null;
  c.drops.spawn('test.block', 5, { x: .5, y: .2, z: .5 }, { thrown: true });
  for (let n = 0; n < 39; n++) c.update(.05);
  assert.equal(c.drops.total(), 5n);
  c.update(.05); assert.equal(c.drops.total(), 0n); assert.equal(c.inventory.mainHand.count, 5);
});

test('real inventory UI routes E/Escape, drags, double clicks, shift-double, 1-9/F/Q, outside drops and blocks gameplay', t => {
  const window = new Window({ url: 'http://localhost:4173', settings: { disableJavaScriptEvaluation: true, disableJavaScriptFileLoading: true, disableCSSFileLoading: true } });
  const document = window.document; document.write(readFileSync(new URL('../index.html', import.meta.url), 'utf8'));
  const c = new MovementController(new VoxelWorld());
  const inventoryUI = new InventoryUI({ inventory: c.inventory, document, window, onClose: () => ui.closeInventory() });
  const ui = new ChatUI({ document, window, controller: c, inventoryUI, clearInput: () => c.pause(), requestCapture: () => {}, requestUnlock: () => {}, storage: window.localStorage });
  t.after(() => { inventoryUI.dispose(); ui.dispose(); window.happyDOM.abort(); window.close(); });
  const key = (code, ctrlKey = false) => document.body.dispatchEvent(new window.KeyboardEvent('keydown', { code, key: code === 'Escape' ? 'Escape' : code, ctrlKey, bubbles: true, cancelable: true }));
  const mouse = (target, type, button = 0, shiftKey = false) => target.dispatchEvent(new window.MouseEvent(type, { button, shiftKey, bubbles: true, cancelable: true }));
  const slot = n => inventoryUI.slotViews.get(n);
  const click = (n, button = 0, shift = false) => { mouse(slot(n), 'mousedown', button, shift); mouse(window, 'mouseup', button, shift); };
  ui.onPointerLockChange(true); c.placementHeld = true; key('KeyE');
  assert.equal(ui.mode, 'inventory'); assert.equal(c.placementHeld, false);
  key('KeyW'); key('Space'); key('KeyR'); assert.equal(c.heldKeys.size, 0);
  c.inventory.slots[0] = block(7); c.inventory.changed(); click(0, 2);
  assert.equal(c.inventory.cursor.count, 4); assert.equal(c.inventory.slots[0].count, 3);
  mouse(slot(1), 'mousedown'); mouse(slot(2), 'mouseover');
  assert.equal(slot(1).classList.contains('drag-preview'), true); mouse(window, 'mouseup');
  assert.equal(c.inventory.slots[1].count, 2); assert.equal(c.inventory.slots[2].count, 2);
  c.inventory.cursor = block(3); inventoryUI.lastClick = null;
  mouse(slot(3), 'mousedown', 2); mouse(slot(4), 'mouseover', 2); mouse(window, 'mouseup', 2);
  assert.equal(c.inventory.slots[3].count, 1); assert.equal(c.inventory.slots[4].count, 1); assert.equal(c.inventory.cursor.count, 1);
  mouse(inventoryUI.root, 'mousedown', 2); assert.equal(c.inventory.cursor, null); assert.equal(c.drops.total(), 1n);
  mouse(slot(1), 'mouseover'); key('Digit9'); assert.equal(c.inventory.slots[8].count, 2);
  mouse(slot(8), 'mouseover'); key('KeyF'); assert.equal(c.inventory.offhand.count, 2);
  mouse(slot(40), 'mouseover'); key('KeyQ'); key('KeyQ', true); assert.equal(c.inventory.offhand, null); assert.equal(c.drops.total(), 3n);
  inventoryUI.lastClick = null; click(0); click(0); assert.ok(c.inventory.cursor.count >= 5, 'Double-click gathers matching stacks');
  key('Escape'); assert.equal(ui.mode, 'ready'); assert.equal(c.inventory.cursor, null);
  ui.onPointerLockChange(true); key('KeyE'); c.inventory.slots.fill(null); c.inventory.slots[9] = block(4); c.inventory.slots[10] = block(5); c.inventory.changed();
  inventoryUI.lastClick = null; click(9, 0, true); click(9, 0, true);
  assert.equal(c.inventory.slots[10], null); assert.equal(c.inventory.slots[0].count, 9);
  inventoryUI.lastClick = null; click(0); mouse(inventoryUI.root, 'mousedown'); assert.equal(c.inventory.cursor, null);
  assert.equal(c.drops.total(), 12n); key('KeyE'); assert.equal(ui.mode, 'ready');
  ui.onPointerLockChange(true); c.inventory.slots[0] = block(3); c.inventory.changed(); key('KeyF'); assert.equal(c.inventory.offhand.count, 3);
});

test('offhand renders in world and first person; preview turns smoothly within limits without changing real aim', () => {
  const c = new MovementController(new VoxelWorld()), model = createPlayerModel(), hand = createEmptyHand();
  c.inventory.slots[OFFHAND] = block(2); c.inventory.slots[0] = block(3);
  syncEquipment(model, c.inventory); updateEmptyHand(hand, { swingActive: false, swingProgress: 0 }, c.inventory);
  assert.equal(model.userData.equipment.leftItem.visible, true); assert.equal(hand.offhandItem.visible, true);
  assert.equal(hand.mainItem.visible, true); assert.equal(hand.rig.visible, false);
  const original = { ...c.player.animation }, preview = new InventoryPreviewPose(); preview.aim(100, -100);
  for (let n = 0; n < 30; n++) preview.step();
  assert.ok(preview.yaw > 0 && preview.yaw <= .65); assert.ok(preview.pitch <= .4); assert.ok(preview.torso < .24);
  assert.deepEqual(c.player.animation, original); preview.reset(); assert.equal(preview.yaw, 0);
});
