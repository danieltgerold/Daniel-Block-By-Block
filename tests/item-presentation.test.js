import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { Window } from 'happy-dom';
import { ITEMS, PlayerInventory } from '../src/inventory.js';
import { BLOCK_TEXTURES, texturePixels } from '../src/block-textures.js';
import { createItemMesh } from '../src/item-assets.js';
import { blockBoxes } from '../src/block-shapes.js';
import { placeBlock } from '../src/block-actions.js';
import { VoxelWorld } from '../src/voxel-world.js';
import { FurnaceEntity } from '../src/smelting.js';
import { InventoryUI } from '../src/inventory-ui.js';
import { ITEM_DISPLAY, itemModelTransform, itemSourceAlignment } from '../src/item-display.js';
import { createPlayerModel, animatePlayerModel, syncEquipment, createEmptyHand, updateEmptyHand } from '../src/player-visuals.js';
const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-7, `${a} != ${b}`);
const base = { torsoYaw: .2, headYaw: .1, aimPitch: -.4, phase: 2, amount: .8, crouch: 0, swingActive: false, swingProgress: 0 };

test('Door uses a complete flat picture with a filled interior in every item context; placed panels stay unchanged', () => {
  for (const wood of ['oak', 'pine']) {
    const id = `${wood}.door`, item = ITEMS.get(id), pixels = texturePixels(item.texture);
    assert.equal(BLOCK_TEXTURES.get(item.texture).indices.length, 256);
    assert.equal(pixels[3], 0);
    for (let y = 1; y < 15; y++) for (let x = 3; x < 13; x++) assert.equal(pixels[(y * 16 + x) * 4 + 3], 255, 'no interior holes');
    assert.match(decodeURIComponent(item.icon), /viewBox="0 0 16 16"/);
    const mesh = createItemMesh(1, id), box = mesh.geometry.boundingBox;
    near(box.max.z - box.min.z, 0); assert.equal(mesh.geometry.type, 'PlaneGeometry');
    assert.equal(mesh.geometry.getAttribute('position').count, 4); assert.equal(mesh.material.vertexColors, false);
    assert.equal(createItemMesh(1, id).geometry, mesh.geometry);
    assert.equal(mesh.material.alphaTest, .5); assert.equal(mesh.material.side, THREE.DoubleSide);
    const drop = createItemMesh(.25, id); near(drop.geometry.boundingBox.max.z - drop.geometry.boundingBox.min.z, 0);
    const w = new VoxelWorld(); placeBlock(w, id, { x: 0, y: -1, z: 0, normal: { x: 0, y: 1, z: 0 }, point: { x: .5, y: 0, z: .5 } }, 0);
    assert.deepEqual(blockBoxes(w.blockAt(0, 0, 0)), [[0, 0, .8125, 1, 1, 1]]);
    assert.deepEqual(blockBoxes(w.blockAt(0, 1, 0)), [[0, 0, .8125, 1, 1, 1]]);
  }
});

test('both sprite profiles grip by their end, use model-unit TRS, and follow animated hands in both F5 views', () => {
  for (const id of ['stick', 'oak.door', 'pine.door']) {
    const inventory = new PlayerInventory(), model = createPlayerModel(), profile = ITEMS.get(id).display;
    inventory.slots[0] = { id, count: 1 }; inventory.slots[40] = { id, count: 1 };
    for (const sign of [1, -1]) for (const view of ['first', 'third']) {
      const m = itemModelTransform(profile, view, sign), reference = ITEM_DISPLAY[profile][view][sign > 0 ? 'right' : 'left'];
      const origin = new THREE.Vector3().applyMatrix4(m);
      near(origin.x, sign * reference.translation[0] / 16); near(origin.y, reference.translation[1] / 16); near(origin.z, reference.translation[2] / 16);
      const grip = profile === 'handheld' ? new THREE.Vector3(-.3125, -.3125, 0) : new THREE.Vector3(0, -.40625, 0);
      near(grip.applyMatrix4(itemSourceAlignment(profile, view, sign)).applyMatrix4(m).length(), 0);
    }
    for (const size of [1, 2]) for (const pose of [base, { ...base, crouch: 1 }, { ...base, swingActive: true, swingProgress: .35 }]) {
      let rear;
      for (const view of [1, 2]) {
        animatePlayerModel(model, { x: 3, y: 4, z: -5, size }, pose, view, inventory); syncEquipment(model, inventory); model.updateMatrixWorld(true);
        const matrices = [];
        for (const [key, arm] of [['rightItem', 'Right Arm'], ['leftItem', 'Left Arm']]) {
          const item = model.userData.equipment[key], joint = model.userData.joints[arm]; assert.equal(item.parent, joint);
          const expected = joint.matrixWorld.clone().multiply(item.matrix); assert.deepEqual(item.matrixWorld.elements, expected.elements);
          near(new THREE.Vector3().setFromMatrixScale(item.matrixWorld).x, .9375 * (profile === 'handheld' ? .85 : .55) * size);
          if (profile === 'generated') {
            const sign = key === 'rightItem' ? 1 : -1, pixel = .9375 / 16;
            const grip = new THREE.Vector3(0, -.40625, 0).applyMatrix4(item.matrix);
            near(grip.x, sign * pixel); near(grip.y, -9 * pixel); near(grip.z, -2 * pixel - .001);
            assert.ok(grip.y > -10 * pixel && grip.y < -8 * pixel, 'grip overlaps the palm rather than floating below the hand');
          }
          matrices.push([...item.matrixWorld.elements]);
        }
        if (view === 1) rear = matrices; else assert.deepEqual(matrices, rear);
      }
    }
    const hand = createEmptyHand(16 / 9); updateEmptyHand(hand, base, inventory); hand.scene.updateMatrixWorld(true); hand.camera.updateProjectionMatrix();
    assert.equal(hand.rig.visible, false, 'held picture never draws an empty-hand arm behind it');
    for (const mesh of [hand.mainItem, hand.offhandItem]) {
      const vertices = mesh.geometry.getAttribute('position'), projected = new THREE.Box3();
      for (let n = 0; n < vertices.count; n++) projected.expandByPoint(new THREE.Vector3().fromBufferAttribute(vertices, n).applyMatrix4(mesh.matrixWorld).project(hand.camera));
      assert.ok(projected.max.x > -1 && projected.min.x < 1 && projected.max.y > -1 && projected.min.y < 1, 'resting sprite is in view');
      assert.ok(projected.getSize(new THREE.Vector3()).x < 1, 'not oversized across the screen');
      if (profile === 'generated') {
        assert.ok(projected.max.y < -.2, 'Door stays entirely in the lower view, clear of the crosshair');
        assert.ok(projected.getSize(new THREE.Vector3()).y < .5, 'Door occupies less than a quarter of the screen height');
        assert.ok(projected.getSize(new THREE.Vector3()).x < .35, 'Door is a compact held picture');
        assert.ok(projected.min.y > -1, 'complete Door stays on-screen at rest');
      }
    }
    const rest = [...hand.mainItem.matrix.elements]; updateEmptyHand(hand, { ...base, swingActive: true, swingProgress: .35 }, inventory);
    assert.notDeepEqual(hand.mainItem.matrix.elements, rest); updateEmptyHand(hand, { ...base, equipHeight: .2 }, inventory);
    assert.ok(hand.mainItem.position.y < -.9); updateEmptyHand(hand, base, inventory); assert.deepEqual(hand.mainItem.matrix.elements, rest);
    inventory.slots[0] = { id: 'grass.block', count: 1 }; // Return to the ordinary block path.
    updateEmptyHand(hand, base, inventory); assert.equal(hand.mainItem.geometry.type, 'BoxGeometry');
    inventory.slots[0] = null; updateEmptyHand(hand, base, inventory); assert.equal(hand.rig.visible, true); assert.equal(hand.mainItem.visible, false);
  }
});

test('carried icon centers on viewport pointer across player/table/furnace/book layouts and keeps count/tooltips/clicks', t => {
  const window = new Window({ settings: { disableJavaScriptEvaluation: true, disableJavaScriptFileLoading: true, disableCSSFileLoading: true } });
  const document = window.document; document.write(readFileSync(new URL('../index.html', import.meta.url), 'utf8'));
  const style = document.createElement('style'); style.textContent = readFileSync(new URL('../src/style.css', import.meta.url), 'utf8'); document.head.append(style);
  const inventory = new PlayerInventory(), ui = new InventoryUI({ inventory, document, window });
  t.after(() => { ui.dispose(); window.happyDOM.abort(); window.close(); });
  for (const context of [2, 3, 'furnace']) {
    if (context === 'furnace') ui.openFurnace(new FurnaceEntity()); else ui.open(context);
    document.getElementById('recipe-book').hidden = false;
    for (const [x, y] of [[64, 80], [1000, 700]]) {
      inventory.cursor = { id: 'oak.door', count: 7 };
      window.dispatchEvent(new window.MouseEvent('mousemove', { clientX: x, clientY: y })); ui.render();
      assert.equal(ui.cursorView.style.left, `${x}px`); assert.equal(ui.cursorView.style.top, `${y}px`);
      assert.equal(window.getComputedStyle(ui.cursorView).transform, 'translate(-50%, -50%)');
      const icon = ui.cursorView.querySelector('.item-icon'), count = ui.cursorView.querySelector('.stack-count');
      assert.equal(window.getComputedStyle(icon).transform, 'translate(-50%, -50%)');
      assert.equal(window.getComputedStyle(ui.cursorView).pointerEvents, 'none'); assert.equal(count.textContent, '7');
      assert.equal(window.getComputedStyle(count).right, '3px');
    }
    inventory.cursor = null; inventory.slots[0] = { id: 'oak.door', count: 1 }; ui.render();
    ui.slotViews.get(0).dispatchEvent(new window.MouseEvent('mouseover', { clientX: 50, clientY: 60, bubbles: true }));
    assert.equal(ui.tooltip.hidden, false); assert.match(ui.tooltip.textContent, /Oak Door/); ui.close();
  }
});
