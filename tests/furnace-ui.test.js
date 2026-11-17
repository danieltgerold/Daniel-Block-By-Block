import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Window } from 'happy-dom';
import { MovementController } from '../src/movement.js';
import { VoxelWorld } from '../src/voxel-world.js';
import { InventoryUI } from '../src/inventory-ui.js';
import { ChatUI } from '../src/chat-ui.js';
import { FURNACE_INPUT as INPUT, FURNACE_FUEL as FUEL, FURNACE_OUTPUT as OUTPUT } from '../src/inventory.js';
const stack = (id, count = 1) => ({ id, count });
function fixture(t) {
  const window = new Window({ url: 'http://localhost:4173', settings: { disableJavaScriptEvaluation: true, disableJavaScriptFileLoading: true, disableCSSFileLoading: true } });
  const document = window.document; document.write(readFileSync(new URL('../index.html', import.meta.url), 'utf8'));
  const c = new MovementController(new VoxelWorld()); c.world.setBlock(0, 0, 0, 'furnace');
  const view = new InventoryUI({ inventory: c.inventory, document, window, onClose: () => ui.closeInventory() });
  const ui = new ChatUI({ document, window, controller: c, inventoryUI: view, clearInput: o => c.pause(o), requestCapture: () => {}, requestUnlock: () => {}, storage: window.localStorage });
  t.after(() => { view.dispose(); ui.dispose(); window.happyDOM.abort(); window.close(); });
  const key = (code, key = code) => document.body.dispatchEvent(new window.KeyboardEvent('keydown', { code, key, bubbles: true, cancelable: true }));
  const mouse = (target, type, button = 0, shiftKey = false) => target.dispatchEvent(new window.MouseEvent(type, { button, shiftKey, bubbles: true, cancelable: true }));
  const click = (index, button = 0, shift = false) => { mouse(view.slotViews.get(index), 'mousedown', button, shift); mouse(window, 'mouseup', button, shift); };
  ui.onPointerLockChange(true); const f = c.world.furnaceAt(0, 0, 0); ui.openFurnace(f);
  return { window, document, c, view, ui, f, key, mouse, click };
}

test('furnace UI shift routes input/fuel, rejects invalid insertion/output placement, updates indicators and preserves its contents on close', t => {
  const { c, ui, view, f, key, mouse, click, document, window } = fixture(t), i = c.inventory;
  i.slots[0] = stack('sand', 4); i.slots[1] = stack('oak.planks', 2); i.changed();
  click(0, 0, true); click(1, 0, true); assert.deepEqual(f.slots.slice(0, 2), [stack('sand', 4), stack('oak.planks', 2)]);
  i.cursor = stack('sand'); click(FUEL, 2); assert.deepEqual(f.slots[1], stack('oak.planks', 2)); assert.equal(i.cursor.id, 'sand');
  click(OUTPUT); assert.equal(f.slots[2], null); assert.equal(i.cursor.id, 'sand'); click(2); assert.equal(i.cursor, null);
  c.player.vz = -.1; const before = c.player.z;
  for (let tick = 0; tick < 200; tick++) c.update(.05, { gameplayEnabled: false });
  assert.ok(c.player.z < before); assert.deepEqual(f.slots[2], stack('glass')); assert.equal(f.slots[0].count, 3);
  assert.ok(document.getElementById('furnace-flame').value > 0); assert.equal(document.getElementById('furnace-progress').value, 0);
  key('Escape', 'Escape'); assert.equal(ui.mode, 'ready'); assert.equal(i.furnace, null); assert.equal(i.slots.length, 50); assert.equal(f.slots[2].count, 1);
  for (let tick = 0; tick < 100; tick++) c.update(.05, { gameplayEnabled: false }); assert.equal(f.cookTime, 100);
  ui.onPointerLockChange(true); ui.openFurnace(f);
  mouse(view.slotViews.get(OUTPUT), 'mouseover'); key('Digit9'); assert.equal(i.slots[8].id, 'glass'); assert.equal(f.slots[2], null);
  document.getElementById('furnace-book-toggle').click(); const button = view.book.buttons.get('smelting:sand.glass'); assert.ok(button && !button.hidden);
  button.dispatchEvent(new window.MouseEvent('click', { shiftKey: true, bubbles: true })); assert.equal(f.slots[0].count, 4); assert.equal(f.slots[2], null);
  assert.ok(view.root.classList.contains('furnace-view'));
  const time = c.drops.time; ui.pause(); assert.equal(ui.mode, 'menu'); assert.equal(c.drops.time, time);
});

test('breaking an open furnace closes the view, drops each real stack once, and returns the independent cursor stack', t => {
  const { c, ui, f } = fixture(t), i = c.inventory;
  f.slots = [stack('sand', 2), stack('stick'), stack('glass', 3)]; i.cursor = stack('oak.planks'); i.changed();
  c.world.destroyBlock(0, 0, 0, { gameMode: 'survival' });
  assert.equal(ui.mode, 'ready'); assert.equal(i.furnace, null); assert.equal(i.cursor, null); assert.equal(c.drops.total(), 7n);
  assert.equal(i.slots[0].id, 'oak.planks'); assert.ok(f.slots.every(s => s === null));
  assert.equal(c.world.destroyBlock(0, 0, 0, { gameMode: 'survival' }), false); assert.equal(c.drops.total(), 7n);
});
