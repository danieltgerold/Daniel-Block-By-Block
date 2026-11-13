import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Window } from 'happy-dom';
import { ChatUI } from '../src/chat-ui.js';
import { InventoryUI } from '../src/inventory-ui.js';
import { MovementController } from '../src/movement.js';
import { VoxelWorld } from '../src/voxel-world.js';
import { LocalPlayerProfile, PROFILE_STORAGE_KEY, validateName } from '../src/chat.js';
function fixture(t) {
  const window = new Window({ url: 'http://localhost:4173', settings: { disableJavaScriptEvaluation: true, disableJavaScriptFileLoading: true, disableCSSFileLoading: true } });
  const document = window.document; document.write(readFileSync(new URL('../index.html', import.meta.url), 'utf8'));
  const controller = new MovementController(new VoxelWorld());
  const inventoryUI = new InventoryUI({ inventory: controller.inventory, document, window, onClose: () => ui.closeInventory() });
  const ui = new ChatUI({ document, window, controller, inventoryUI, clearInput: () => controller.pause(), requestCapture: () => {}, requestUnlock: () => {}, storage: window.localStorage });
  t.after(() => { inventoryUI.dispose(); ui.dispose(); window.happyDOM.abort(); window.close(); });
  return { window, document, controller, inventoryUI, ui };
}
test('names reject all whitespace, keep the 16-character rule and migrate old saved names without changing identity', () => {
  for (const value of ['Has Space', ' Leading', 'Trailing ', 'Tab\tName', 'Line\nName', 'server', 'SERVER']) assert.equal(validateName(value).ok, false);
  assert.equal(validateName('Player123').ok, true); assert.equal(validateName('A'.repeat(17)).ok, false);
  const data = new Map([[PROFILE_STORAGE_KEY, JSON.stringify({ id: 'same-id', displayName: 'Local Player' })]]);
  const profile = new LocalPlayerProfile({ getItem: key => data.get(key), setItem: (key, value) => data.set(key, value) });
  assert.deepEqual(profile.player, { id: 'same-id', displayName: 'LocalPlayer' });
  assert.equal(profile.rename('New Name').ok, false); assert.equal(profile.player.displayName, 'LocalPlayer');
  assert.equal(new LocalPlayerProfile(null, () => 'new-id').player.displayName, 'player1');
});
test('developer sequence accepts Shift and physical B/A keys across layouts without moving the player; /devmode is a reliable fallback', t => {
  const f = fixture(t); f.ui.onPointerLockChange(true);
  const key = (code, value = code, extra = {}) => {
    const event = new f.window.KeyboardEvent('keydown', { code, key: value, ...extra, bubbles: true, cancelable: true });
    f.document.body.dispatchEvent(event); return event;
  };
  const sequence = ['ArrowUp', 'ArrowUp', 'ArrowDown', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'ArrowLeft', 'ArrowRight'];
  sequence.forEach((code, i) => { assert.equal(key(code).defaultPrevented, true); if (i === 0) key(code, code, { repeat: true }); });
  key('ShiftLeft', 'Shift'); key('KeyB', 'β', { shiftKey: true }); key('KeyA', 'α', { shiftKey: true });
  assert.equal(key('Enter').defaultPrevented, true); assert.equal(f.controller.developerMode, true); assert.equal(f.controller.heldKeys.size, 0);
  assert.equal(f.ui.service.messages.at(-1).text, 'You have entered developer mode.');
  f.controller.developerMode = false; f.ui.service.submit('/devmode'); assert.equal(f.controller.developerMode, true);
  assert.deepEqual(f.ui.service.completions('/dev'), ['/devmode ']);
  f.ui.service.submit('/speed 300'); assert.equal(f.controller.walkSpeed, 300);
});
test('Creative selects five-block reach and Survival restores 4.5, with mode-aware resets and size scaling', t => {
  const { controller: c, ui } = fixture(t);
  c.configure('reach', 20); ui.service.submit('/gamemode creative'); assert.equal(c.settings.reach, 5);
  c.configure('size', 2); assert.equal(c.effective.reach, 10);
  c.configure('reach', 12); ui.service.submit('/reach default'); assert.equal(c.settings.reach, 5);
  ui.service.submit('/default'); assert.equal(c.settings.reach, 5); assert.equal(c.size, 1);
  ui.service.submit('/gamemode survival'); assert.equal(c.settings.reach, 4.5);
});
test('top overlays and inventory text are removed; hovering a block immediately shows its name and empty slots/closing hide it', t => {
  const f = fixture(t), panel = f.document.getElementById('inventory-panel');
  assert.equal(f.document.getElementById('playing-hint'), null); assert.equal(f.document.querySelector('.milestone'), null);
  assert.doesNotMatch(panel.textContent, /Inventory|Offhand|Crafting|Shift-click|Ctrl\+Q|Close/);
  f.controller.inventory.slots[0] = { id: 'test.block', count: 1 }; f.controller.inventory.changed();
  f.ui.onPointerLockChange(true); f.ui.openInventory();
  const hover = index => f.inventoryUI.slotViews.get(index).dispatchEvent(new f.window.MouseEvent('mouseover', { clientX: 120, clientY: 100, bubbles: true }));
  hover(0); assert.equal(f.inventoryUI.tooltip.hidden, false); assert.equal(f.inventoryUI.tooltip.textContent, 'Test Block');
  hover(1); assert.equal(f.inventoryUI.tooltip.hidden, true);
  hover(0); f.controller.inventory.slots[0] = null; f.controller.inventory.changed(); assert.equal(f.inventoryUI.tooltip.hidden, true);
  f.ui.closeInventory(); assert.equal(f.inventoryUI.tooltip.hidden, true);
});
