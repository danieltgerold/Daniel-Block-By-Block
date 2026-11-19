import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Window } from 'happy-dom';
import { MovementController } from '../src/movement.js';
import { VoxelWorld } from '../src/voxel-world.js';
import { InventoryUI } from '../src/inventory-ui.js';
import { ChatUI } from '../src/chat-ui.js';
import { CRAFT_START as C, CRAFT_OUTPUT } from '../src/inventory.js';
import { BlockPlacement, breakTargetBlock } from '../src/block-placement.js';
const stack = (id, count = 1) => ({ id, count });
function fixture(t) {
  const window = new Window({ url: 'http://localhost:4173', settings: { disableJavaScriptEvaluation: true, disableJavaScriptFileLoading: true, disableCSSFileLoading: true } });
  const document = window.document; document.write(readFileSync(new URL('../index.html', import.meta.url), 'utf8'));
  const c = new MovementController(new VoxelWorld({ depth: 3 })); let cameras = 0;
  const inventoryUI = new InventoryUI({ inventory: c.inventory, document, window, onClose: () => ui.closeInventory() });
  const ui = new ChatUI({ document, window, controller: c, inventoryUI,
    clearInput: options => c.pause(options), requestCapture: () => {}, requestUnlock: () => {}, onCameraCycle: () => cameras++, storage: window.localStorage });
  t.after(() => { inventoryUI.dispose(); ui.dispose(); window.happyDOM.abort(); window.close(); });
  const key = (code, target = document.body, key = code) => {
    const event = new window.KeyboardEvent('keydown', { code, key, bubbles: true, cancelable: true }); target.dispatchEvent(event); return event;
  };
  const mouse = (target, type = 'mousedown', button = 0, shiftKey = false) => target.dispatchEvent(new window.MouseEvent(type, { button, shiftKey, bubbles: true, cancelable: true }));
  const click = (slot, button = 0, shift = false) => { mouse(inventoryUI.slotViews.get(slot), 'mousedown', button, shift); mouse(window, 'mouseup', button, shift); };
  ui.onPointerLockChange(true);
  return { c, ui, inventoryUI, document, window, key, mouse, click, cameras: () => cameras };
}

test('real inventory input slots support drag/split/output, and recipe search, filters and missing ghosts cannot trigger gameplay or create items', t => {
  const f = fixture(t), { c, ui, inventoryUI: view, key, mouse, click, document, window } = f, i = c.inventory;
  i.slots[0] = stack('oak.planks', 4); i.changed(); key('KeyE');
  assert.equal(i.crafting.size, 2); assert.equal(view.slotViews.get(C + 4).hidden, true);
  click(0); assert.equal(i.cursor.count, 4);
  mouse(view.slotViews.get(C)); mouse(view.slotViews.get(C + 2), 'mouseover'); mouse(window, 'mouseup');
  assert.equal(i.slots[C].count, 2); assert.equal(i.slots[C + 2].count, 2); assert.equal(i.cursor, null);
  assert.equal(view.stackAt(CRAFT_OUTPUT).id, 'stick'); click(CRAFT_OUTPUT, 2);
  assert.deepEqual(i.cursor, stack('stick', 4)); assert.equal(i.slots[C].count, 1);
  click(CRAFT_OUTPUT, 0, true); assert.equal(i.slots[C], null); assert.equal(i.slots[0].count, 4);
  const node = view.hudViews.get(0).firstChild; i.changed(); assert.equal(view.hudViews.get(0).firstChild, node, 'Unchanged icons are reused');
  document.getElementById('recipe-book-toggle').click(); assert.equal(view.book.root.hidden, false);
  assert.equal([...view.book.buttons.values()].filter(b => !b.hidden).length, 4);
  const before = JSON.stringify(i.slots); view.book.buttons.get('pine.planks').click();
  assert.equal(JSON.stringify(i.slots), before); assert.equal(i.cursor.count, 4); assert.equal(i.crafting.output, null);
  assert.equal(view.book.ghost.hidden, false); assert.ok(view.book.ghostSlots[0].classList.contains('missing'));
  assert.equal(view.book.ghostGrid.querySelectorAll('[data-slot]').length, 0);
  const search = view.book.search; search.focus(); search.value = 'pine'; search.dispatchEvent(new window.Event('input', { bubbles: true }));
  assert.deepEqual([...view.book.buttons].filter(([, b]) => !b.hidden).map(([id]) => id), ['pine.planks']);
  for (const code of ['KeyE', 'KeyT', 'KeyW', 'Digit9', 'F5']) key(code, search);
  assert.equal(ui.mode, 'inventory'); assert.equal(i.selected, 0); assert.equal(c.heldKeys.size, 0); assert.equal(f.cameras(), 0);
  view.book.only.checked = true; view.book.only.dispatchEvent(new window.Event('change'));
  assert.equal([...view.book.buttons.values()].filter(b => !b.hidden).length, 0);
  i.insert('pine.log', 2); assert.equal(view.book.buttons.get('pine.planks').hidden, false);
  view.book.buttons.get('pine.planks').dispatchEvent(new window.MouseEvent('click', { shiftKey: true, bubbles: true }));
  assert.equal(i.slots[C].count, 2); assert.equal(i.slots[C].id, 'pine.log'); assert.equal(i.cursor.count, 4);
  view.book.category.value = 'materials'; view.book.category.dispatchEvent(new window.Event('change'));
  assert.equal([...view.book.buttons.values()].filter(b => !b.hidden).length, 0);
  key('Escape', search, 'Escape'); assert.equal(ui.mode, 'ready'); assert.equal(i.cursor, null);
  assert.equal(i.slots.filter(s => s?.id === 'stick').reduce((n, s) => n + s.count, 0), 8);
  assert.equal(c.drops.total(), 0n);
});

test('reached Crafting Table opens a live 3x3 interface, keeps momentum, returns inputs, and crouch/use/reach preserve placement rules', t => {
  const f = fixture(t), { c, ui, inventoryUI: view, key, click } = f, i = c.inventory;
  c.world.setBlock(0, 1, 0, 'crafting.table'); c.teleport({ x: 3.5, y: .2, z: .5 });
  i.slots[0] = stack('stick', 3); c.player.vx = .12; c.player.vz = -.15; c.player.vy = .05;
  let uses = 0;
  const placement = new BlockPlacement({ controller: c, world: c.world, getAim: () => ({ yaw: Math.PI / 2, pitch: 0 }),
    canInteract: () => ui.mode === 'playing', onUse: block => { assert.equal(block.id, 'crafting.table'); uses++; ui.openInventory(3); return true; } });
  c.onTick = () => placement.tick(); placement.press(); c.update(.05);
  assert.equal(uses, 1); assert.equal(ui.mode, 'inventory'); assert.equal(i.crafting.size, 3);
  assert.equal(view.slotViews.get(C + 8).hidden, false); assert.equal(view.root.classList.contains('table-view'), true);
  assert.equal(i.slots[0].count, 3); assert.ok(c.player.vz < 0); assert.equal(c.placementHeld, false);
  const before = c.player.z, time = c.drops.time; c.update(.05, { gameplayEnabled: false });
  assert.ok(c.player.z < before); assert.ok(c.drops.time > time); assert.equal(uses, 1);
  i.slots[C + 8] = stack('pine.log', 2); i.changed(); assert.equal(i.crafting.output.id, 'pine.planks');
  click(CRAFT_OUTPUT); assert.equal(i.cursor.count, 4); assert.equal(i.slots[C + 8].count, 1);
  key('Escape', undefined, 'Escape'); assert.equal(ui.mode, 'ready'); assert.equal(i.slots[C + 8], null);
  assert.equal(i.slots.filter(s => s?.id === 'pine.log').reduce((n, s) => n + s.count, 0), 1);
  assert.equal(i.slots.filter(s => s?.id === 'pine.planks').reduce((n, s) => n + s.count, 0), 4);
  ui.onPointerLockChange(true); c.teleport({ x: 3.5, y: .2, z: .5 }); c.player.crouching = true; c.player.eyeOffset = 1.27;
  i.slots[0] = stack('stone', 3); assert.equal(placement.attempt(), true);
  assert.equal(uses, 1); assert.equal(c.world.blockIdAt(1, 1, 0), 'stone'); assert.equal(i.slots[0].count, 2);
  c.world.setBlock(1, 1, 0, false); c.configure('reach', 1); c.player.crouching = false;
  assert.equal(placement.attempt(), false); assert.equal(uses, 1);
  c.configure('reach', 4.5); assert.equal(breakTargetBlock({ controller: c, world: c.world, yaw: Math.PI / 2, pitch: 0 }), true);
  assert.equal(c.drops.piles[0].item, 'crafting.table'); assert.equal(c.drops.total(), 1n);
  key('KeyE'); assert.equal(i.crafting.size, 2, 'E opens the player grid again');
});
