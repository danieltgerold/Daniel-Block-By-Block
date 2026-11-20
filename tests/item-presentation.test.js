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
import { displayProfile, itemGrip } from '../src/item-display.js';
import { createPlayerModel, animatePlayerModel, syncEquipment, createEmptyHand, updateEmptyHand } from '../src/player-visuals.js';
const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-7, `${a} != ${b}`);
const base = { torsoYaw: .2, headYaw: .1, aimPitch: -.4, phase: 2, amount: .8, crouch: 0, swingActive: false, swingProgress: 0 };

test('Door uses a complete flat picture with a filled interior in every item context; placed panels stay unchanged', () => {
  for (const wood of ['oak', 'pine']) {
    const id = `${wood}.door`, item = ITEMS.get(id), pixels = texturePixels(item.texture);
    assert.equal(BLOCK_TEXTURES.get(item.texture).indices.length, 256);
    assert.equal(pixels[3], 0);
    assert.notDeepEqual(BLOCK_TEXTURES.get('oak.door.item').indices, BLOCK_TEXTURES.get('pine.door.item').indices, 'panelled Oak and banded Pine have distinct artwork');
    for (let y = 1; y < 15; y++) for (let x = 3; x < 13; x++) assert.equal(pixels[(y * 16 + x) * 4 + 3], 255, 'no interior holes');
    assert.match(decodeURIComponent(item.icon), /viewBox="0 0 16 16"/);
    const mesh = createItemMesh(1, id), box = mesh.geometry.boundingBox;
    near(box.max.z - box.min.z, 0); assert.equal(mesh.geometry.type, 'PlaneGeometry');
    assert.equal(mesh.geometry.getAttribute('position').count, 4); assert.equal(mesh.material.vertexColors, false);
    assert.equal(createItemMesh(1, id).geometry, mesh.geometry);
    assert.equal(mesh.material.alphaTest, .5); assert.equal(mesh.material.side, THREE.DoubleSide);
    const drop = createItemMesh(.25, id); near(drop.geometry.boundingBox.max.z - drop.geometry.boundingBox.min.z, 0);
    const w = new VoxelWorld({ depth: 3 }); placeBlock(w, id, { x: 0, y: -1, z: 0, normal: { x: 0, y: 1, z: 0 }, point: { x: .5, y: 0, z: .5 } }, 0);
    assert.deepEqual(blockBoxes(w.blockAt(0, 0, 0)), [[0, 0, .8125, 1, 1, 1]]);
    assert.deepEqual(blockBoxes(w.blockAt(0, 1, 0)), [[0, 0, .8125, 1, 1, 1]]);
  }
});

test('flat picture and handle profiles grip at actual palms, follow arm poses and restore their first-person renderer frames', () => {
  for(const id of ['stick','oak.door','pine.door']) {
    const inventory=new PlayerInventory(),model=createPlayerModel(),hand=createEmptyHand(16/9),profile=displayProfile(ITEMS.get(id));
    inventory.slots[0]=inventory.slots[40]={id,count:1};
    for(const size of [1,2])for(const pose of [base,{...base,crouch:1},{...base,swingActive:true,swingProgress:.35}]) {
      let previous;
      for(const view of [1,2]) {
        animatePlayerModel(model,{x:3,y:4,z:-5,size},pose,view,inventory);syncEquipment(model,inventory);model.updateMatrixWorld(true);
        const matrices=[];
        for(const [key,arm] of [['rightItem','Right Arm'],['leftItem','Left Arm']]) {
          const item=model.userData.equipment[key],joint=model.userData.joints[arm],grip=itemGrip(profile).applyMatrix4(item.matrix);
          near(grip.y,-(profile==='handheld'?9.5:9)*.9375/16);
          assert.deepEqual(item.matrixWorld.elements,joint.matrixWorld.clone().multiply(item.matrix).elements);matrices.push([...item.matrixWorld.elements]);
        }
        if(view===1)previous=matrices;else assert.deepEqual(matrices,previous);
      }
    }
    updateEmptyHand(hand,base,inventory);hand.scene.updateMatrixWorld(true);const initial=hand.mainItem.matrixWorld.clone();
    assert.equal(hand.rig.visible,false);assert.equal(hand.mainItem.parent,hand.itemHands[0]);assert.equal(hand.itemHands[0].children.length,1);
    updateEmptyHand(hand,{...base,swingActive:true,swingProgress:.35},inventory);hand.scene.updateMatrixWorld(true);assert.equal(hand.mainItem.matrixWorld.equals(initial),false);
    updateEmptyHand(hand,{...base,equipHeight:.2},inventory);assert.ok(hand.itemHands[0].matrix.elements[13]<-.8);
    updateEmptyHand(hand,base,inventory);hand.scene.updateMatrixWorld(true);assert.ok(hand.mainItem.matrixWorld.equals(initial));
    inventory.slots[0]={id:'grass.block',count:1};updateEmptyHand(hand,base,inventory);assert.equal(hand.mainItem.geometry.type,'BoxGeometry');assert.equal(hand.mainItem.parent,hand.itemHands[0]);
    inventory.slots[0]=null;updateEmptyHand(hand,base,inventory);assert.equal(hand.rig.visible,true);assert.equal(hand.itemHands[0].visible,false);
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
