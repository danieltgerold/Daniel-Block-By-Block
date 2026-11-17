import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Window } from 'happy-dom';
import { CreativeInventory, CREATIVE_CATEGORIES } from '../src/creative-inventory.js';
import { PlayerInventory, ITEMS, registerItem } from '../src/inventory.js';
import { InventoryUI } from '../src/inventory-ui.js';
import { ChatUI } from '../src/chat-ui.js';
import { MovementController } from '../src/movement.js';
import { VoxelWorld } from '../src/voxel-world.js';
import { gameSimulationRunning } from '../src/gameplay-hud.js';
const stack = (id = 'stone', count = 1) => ({ id, count });
function fixture(t) {
  const window = new Window({ url: 'http://localhost:4173', settings: { disableJavaScriptEvaluation: true, disableJavaScriptFileLoading: true, disableCSSFileLoading: true } });
  const document = window.document; document.write(readFileSync(new URL('../index.html', import.meta.url), 'utf8'));
  const c = new MovementController(new VoxelWorld()); c.setGameMode('creative');
  const inventoryUI = new InventoryUI({ inventory: c.inventory, document, window, getGameMode: () => c.gameMode, onClose: () => ui.closeInventory() });
  const ui = new ChatUI({ document, window, controller: c, inventoryUI, clearInput: options => c.pause(options), requestCapture: () => {}, requestUnlock: () => {}, storage: window.localStorage });
  t.after(() => { inventoryUI.dispose(); ui.dispose(); window.happyDOM.abort(); window.close(); });
  const key = (code, target = document.body, options = {}) => {
    const event = new window.KeyboardEvent('keydown', { code, key: code === 'Escape' ? 'Escape' : code, bubbles: true, cancelable: true, ...options }); target.dispatchEvent(event); return event;
  };
  const mouse = (target, type, button = 0, shiftKey = false) => target.dispatchEvent(new window.MouseEvent(type, { button, shiftKey, bubbles: true, cancelable: true, clientX: 200, clientY: 180 }));
  const click = (target, button = 0, shift = false) => { mouse(target, 'mousedown', button, shift); mouse(window, 'mouseup', button, shift); };
  const catalog = id => inventoryUI.creative.cells.find(cell => cell.dataset.catalog === id);
  const hover = target => mouse(target, 'mouseover');
  ui.onPointerLockChange(true); key('KeyE');
  return { window, document, c, inventoryUI, ui, key, mouse, click, hover, catalog };
}

test('catalog templates implement click quantities, caps, replacement, cloning and throwing without consuming entries', () => {
  let enabled = true; const drops = [], inv = new PlayerInventory({ onDrop: s => drops.push(s) }), catalog = new CreativeInventory(inv, () => enabled);
  for (const button of [0, 2]) { inv.cursor = null; catalog.click('stone', button); assert.deepEqual(inv.cursor, stack()); }
  catalog.click('stone'); assert.equal(inv.cursor.count, 2); catalog.click('stone', 2); assert.equal(inv.cursor.count, 1);
  catalog.click('stone', 2, true); assert.equal(inv.cursor.count, 64);
  catalog.click('stone', 0, true); assert.equal(inv.cursor.count, 64); catalog.click('stone'); assert.equal(inv.cursor.count, 64);
  catalog.click('dirt', 2); assert.equal(inv.cursor.id, 'stone'); assert.equal(inv.cursor.count, 63);
  catalog.click('dirt'); assert.equal(inv.cursor, null); catalog.click('dirt'); assert.deepEqual(inv.cursor, stack('dirt'));
  catalog.click('stone', 1); assert.deepEqual(inv.cursor, stack('stone', 64));
  inv.slots[3] = stack('dirt', 5); catalog.hotbar('oak.door', 3); assert.deepEqual(inv.slots[3], stack('oak.door', 64));
  catalog.drop('pine.stairs'); catalog.drop('pine.stairs', true); assert.deepEqual(drops, [stack('pine.stairs'), stack('pine.stairs', 64)]);
  const templates = catalog.items('search').map(i => i.id);
  assert.equal(new Set(templates).size, ITEMS.size);
  assert.deepEqual(new Set(CREATIVE_CATEGORIES.flatMap(([id]) => catalog.items(id).map(i => i.id))), new Set(templates));
  assert.ok(catalog.items('search', 'PiNe.DoOr').some(i => i.id === 'pine.door'));
  assert.ok(catalog.items('search', 'Pine Door').some(i => i.id === 'pine.door'));
  enabled = false; const snapshot = JSON.stringify({ slots: inv.slots, cursor: inv.cursor });
  catalog.click('dirt'); catalog.hotbar('dirt', 0); catalog.drop('dirt'); catalog.clone(3); catalog.fill([0]); catalog.remove(3); catalog.destroy(true);
  assert.equal(JSON.stringify({ slots: inv.slots, cursor: inv.cursor }), snapshot); assert.equal(drops.length, 2);
});

test('creative real-slot cloning, middle-drag, armor restrictions and destruction are guarded and leave no drops', () => {
  const drops = [], inv = new PlayerInventory({ onDrop: s => drops.push(s) }), catalog = new CreativeInventory(inv, () => true);
  inv.slots[9] = stack('stone', 7); catalog.clone(9); assert.deepEqual(inv.cursor, stack('stone', 64)); assert.equal(inv.slots[9].count, 7);
  inv.cursor.count = 2; inv.slots[1] = stack('stone', 3); inv.slots[2] = stack('dirt', 8);
  catalog.fill([0, 1, 1, 2, 36, 40]); assert.equal(inv.slots[0].count, 64); assert.equal(inv.slots[1].count, 64);
  assert.deepEqual(inv.slots[2], stack('dirt', 8)); assert.equal(inv.slots[36], null); assert.equal(inv.slots[40].count, 64); assert.equal(inv.cursor.count, 2);
  catalog.destroy(); assert.equal(inv.cursor, null); assert.equal(inv.slots[9].count, 7);
  catalog.destroy(true); assert.ok(inv.slots.slice(0, 41).every(s => s === null)); assert.deepEqual(drops, []);
});

test('E routes modes to one shared inventory, keeps momentum/world running, and closing safely returns a cursor stack', t => {
  const f = fixture(t), { c, inventoryUI: view, ui, key } = f, inv = c.inventory;
  assert.equal(view.creative.active, true); assert.equal(view.creative.cells.length, 45); assert.equal(inv.crafting.active, false);
  view.creative.model.hotbar('pine.door', 0); view.creative.model.click('oak.stairs', 0, true);
  key('KeyE'); assert.equal(ui.mode, 'ready'); assert.equal(inv.cursor, null); assert.equal(inv.slots[0].id, 'pine.door'); assert.equal(inv.slots[1].count, 64);
  const before = JSON.stringify(inv.slots); ui.service.submit('/gamemode survival'); assert.equal(c.inventory, inv); assert.equal(JSON.stringify(inv.slots), before);
  ui.onPointerLockChange(true); key('KeyE'); assert.equal(view.creative.active, false); assert.equal(inv.crafting.active, true);
  assert.equal(view.creative.destroy.hidden, true); assert.equal(view.creative.tabs.hidden, true); key('Escape');
  ui.service.submit('/gamemode creative'); ui.onPointerLockChange(true);
  c.teleport({ x: 10, y: 5, z: 10 }); c.player.vz = -.5; c.player.vy = .1;
  const drop = c.drops.spawn('stone', 1, { x: 30, y: 5, z: 30 }, { velocity: { x: 0, y: 0, z: 0 } });
  c.world.setBlock(20, 0, 20, 'furnace'); const furnace = c.world.furnaceAt(20, 0, 20); furnace.slots = [stack('sand'), stack('oak.planks'), null];
  key('KeyE'); assert.equal(c.player.vz, -.5); const z = c.player.z, age = c.drops.time, dropY = drop.y; key('KeyW'); key('Space'); assert.equal(c.heldKeys.size, 0);
  assert.equal(gameSimulationRunning(ui.mode), true); c.update(.05, { gameplayEnabled: false });
  assert.ok(c.player.z < z); assert.ok(c.player.vz < 0); assert.ok(c.drops.time > age); assert.ok(drop.vy < 0); assert.equal(drop.y, dropY); assert.equal(furnace.cookTime, 1);
});

test('creative catalog UI clicks, numbered slots, Q, tooltips and search focus cannot trigger gameplay', t => {
  const f = fixture(t), { inventoryUI: view, c, key, click, hover, catalog, document, window } = f;
  click(catalog('oak.door')); assert.deepEqual(c.inventory.cursor, stack('oak.door')); click(catalog('oak.door'), 2); assert.equal(c.inventory.cursor, null);
  click(catalog('oak.door'), 0, true); assert.equal(c.inventory.cursor.count, 64); hover(catalog('oak.door'));
  assert.equal(view.tooltip.textContent, 'Oak Door'); key('Digit4'); assert.deepEqual(c.inventory.slots[3], stack('oak.door', 64));
  const total = c.drops.total(); key('KeyQ'); key('KeyQ', document.body, { ctrlKey: true }); assert.equal(c.drops.total() - total, 65n);
  key('KeyT'); assert.equal(document.activeElement, view.creative.search); assert.equal(view.creative.tab, 'search');
  view.creative.search.value = 'PINE DOOR'; view.creative.search.dispatchEvent(new window.Event('input'));
  assert.deepEqual(view.creative.cells.filter(cell => !cell.disabled).map(cell => cell.dataset.catalog), ['pine.door']);
  hover(catalog('pine.door')); const event = key('Digit9', view.creative.search); assert.equal(event.defaultPrevented, true); assert.equal(c.inventory.slots[8].id, 'pine.door');
  key('KeyW', view.creative.search); key('Space', view.creative.search); key('Slash', view.creative.search); assert.equal(c.heldKeys.size, 0); assert.equal(f.ui.mode, 'inventory');
  view.creative.search.value = 'no such item'; view.creative.search.dispatchEvent(new window.Event('input')); assert.ok(view.creative.cells.every(cell => cell.disabled));
  view.creative.search.value = ''; view.creative.search.dispatchEvent(new window.Event('input')); assert.equal(view.creative.scroll.disabled, true);
  key('Escape', view.creative.search); assert.equal(view.isOpen, false);
});

test('catalog hotbar deletion is scoped; Player Inventory supports real transfers, drags, cloning, swaps and delete', t => {
  const f = fixture(t), { inventoryUI: view, c, click, mouse, hover, key } = f, inv = c.inventory;
  inv.slots[0] = stack('stone', 12); click(view.slotViews.get(0), 0, true); assert.equal(inv.slots[0], null); assert.ok(inv.slots.slice(9, 36).every(s => !s));
  view.creative.select('inventory'); assert.equal(inv.crafting.active, false);
  inv.slots[0] = stack('stone', 7); view.render(); click(view.slotViews.get(0), 0, true); assert.equal(inv.slots[9].count, 7);
  click(view.slotViews.get(9), 1); assert.equal(inv.cursor.count, 64); assert.equal(inv.slots[9].count, 7);
  inv.cursor = stack('stone', 3); mouse(view.slotViews.get(1), 'mousedown', 1); hover(view.slotViews.get(2)); mouse(f.window, 'mouseup', 1);
  assert.equal(inv.slots[1].count, 64); assert.equal(inv.slots[2].count, 64); assert.equal(inv.cursor.count, 3);
  click(view.creative.destroy); assert.equal(inv.cursor, null);
  click(view.slotViews.get(9), 2); assert.equal(inv.cursor.count, 4); assert.equal(inv.slots[9].count, 3);
  mouse(view.slotViews.get(3), 'mousedown'); hover(view.slotViews.get(4)); mouse(f.window, 'mouseup'); assert.equal(inv.slots[3].count, 2); assert.equal(inv.slots[4].count, 2);
  inv.cursor = stack('stone', 2); mouse(view.slotViews.get(5), 'mousedown', 2); hover(view.slotViews.get(6)); mouse(f.window, 'mouseup', 2);
  assert.equal(inv.slots[5].count, 1); assert.equal(inv.slots[6].count, 1); assert.equal(inv.cursor, null);
  inv.cursor = stack('stone', 3); click(view.root, 1); assert.equal(inv.cursor.count, 3); click(view.creative.destroy);
  hover(view.slotViews.get(6)); key('KeyF'); assert.equal(inv.offhand.count, 1); hover(view.slotViews.get(9)); key('Digit8'); assert.equal(inv.slots[7].count, 3);
  const drops = c.drops.total(); click(view.creative.destroy, 0, true); assert.ok(inv.slots.slice(0, 41).every(s => !s)); assert.equal(c.drops.total(), drops);
});

test('catalog scrolls by rows without recreating cells and resets after filtering', t => {
  const f = fixture(t), { inventoryUI: view, window } = f, ids = [];
  t.after(() => ids.forEach(id => ITEMS.delete(id)));
  for (let n = 0; n < 65; n++) { const id = `catalog.test.${n}`; ids.push(id); registerItem({ id, name: `Catalog Test ${n}`, maxStack: 64, creativeCategory: 'building' }); }
  view.creative.select('search'); const cells = [...view.creative.cells]; assert.equal(view.creative.scroll.disabled, false);
  const first = cells[0].dataset.catalog; view.creative.area.dispatchEvent(new window.WheelEvent('wheel', { deltaY: 100, cancelable: true }));
  assert.equal(view.creative.row, 1); assert.notEqual(cells[0].dataset.catalog, first); assert.deepEqual(view.creative.cells, cells);
  view.creative.scroll.value = view.creative.scroll.max; view.creative.scroll.dispatchEvent(new window.Event('input')); assert.ok(view.creative.row > 1);
  view.creative.search.value = 'catalog.test.64'; view.creative.search.dispatchEvent(new window.Event('input'));
  assert.equal(view.creative.row, 0); assert.equal(view.creative.cells[0].dataset.catalog, 'catalog.test.64'); assert.equal(view.creative.scroll.disabled, true);
});
