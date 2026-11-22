import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import * as THREE from 'three';
import { ITEMS, PlayerInventory } from '../src/inventory.js';
import { TOOL_SPRITES } from '../src/tool-art.js';
import { texturePixels } from '../src/block-textures.js';
import { ITEM_DISPLAY, displayProfile, itemGrip, itemModelTransform, itemSourceTransform } from '../src/item-display.js';
import { MODEL_SCALE, createEmptyHand, updateEmptyHand, createPlayerModel, animatePlayerModel, syncEquipment } from '../src/player-visuals.js';
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-7,`${a} != ${b}`);
const rest={torsoYaw:0,headYaw:0,aimPitch:0,amount:0,phase:0,crouch:0,swingActive:false,swingProgress:0,equipHeight:1};
const examples=['diamond.sword','diamond.axe','diamond.shovel','bucket','oak.door','grass.block'];
const stack=id=>({id,count:1});

test('all 26 offline sprites register synchronously and preserve the supplied RGBA artwork exactly',()=>{
  assert.equal(Object.keys(TOOL_SPRITES).length,26);
  for(const [id,art] of Object.entries(TOOL_SPRITES)) {
    assert.ok(ITEMS.get(id).icon);assert.equal(ITEMS.get(id).maxStack,1);
    const expected=art.rows.flatMap(row=>[...row].flatMap(c=>art.palette[parseInt(c,36)].slice(1).match(/../g).map(n=>parseInt(n,16))));
    assert.deepEqual([...texturePixels(id)],expected);assert.equal(expected.length,1024);
  }
  // Digests of the user-supplied source pixels, independent of its conversion.
  for(const [id,digest] of [
    ['diamond.sword','7970bb61e95cdf1701d0d9ad70132ce05b0c01eef268cc1654b66ce3b431c533'],
    ['diamond.axe','487d8fa98bfc33640421bd7ccfec3428b8567d801df62bcc40e033f99b41ade6'],
    ['diamond.shovel','56b7e12e6d069bd8ee82dfa5e9c0b29dcf622fcf13bfaad9e66b49deb749563a'],
    ['shears','6689c74bc9b51130d595ed0c79a7525c09c7e0c6f0e714ab3b66036ddea830b0'],
  ])assert.equal(createHash('sha256').update(texturePixels(id)).digest('hex'),digest);
});

test('1.8.9 tool model settings retain their translations and source grips, independently of renderer scale',()=>{
  assert.deepEqual(ITEM_DISPLAY.handheld.first,{rotation:[0,-135,25],translation:[0,4,2],scale:1.7});
  assert.deepEqual(ITEM_DISPLAY.handheld.third,{rotation:[0,90,-35],translation:[0,1.25,-3.5],scale:.85});
  for(const view of ['first','third']) {
    const grip=itemGrip('handheld').applyMatrix4(itemSourceTransform('handheld',view));near(grip.length(),0);
    grip.applyMatrix4(itemModelTransform('handheld',view));const translation=ITEM_DISPLAY.handheld[view].translation;
    near(grip.x,translation[0]/16);near(grip.y,translation[1]/16);near(grip.z,translation[2]/16);
    assert.ok(grip.length()>0,'source alignment must not inverse-cancel the model translation');
  }
});

test('sword, axe, shovel, bucket, door and block follow real arm ends in rear/front views, including both hands, size, walking, crouch and swing',()=>{
  const inventory=new PlayerInventory(),model=createPlayerModel();
  for(const id of examples) {
    inventory.slots[0]=inventory.slots[40]=stack(id);const profile=displayProfile(ITEMS.get(id));
    for(const size of [.5,1,2])for(const pose of [rest,{...rest,phase:2,amount:.8,crouch:1},{...rest,swingActive:true,swingProgress:.4}]) {
      let rear;
      for(const view of [1,2]) {
        animatePlayerModel(model,{x:2,y:4,z:-3,size},pose,view,inventory);syncEquipment(model,inventory);model.updateMatrixWorld(true);
        const matrices=[];
        for(const [name,arm,sign] of [['rightItem','Right Arm',1],['leftItem','Left Arm',-1]]) {
          const item=model.userData.equipment[name],joint=model.userData.joints[arm];
          assert.equal(item.parent,joint);assert.deepEqual(item.matrixWorld.elements,joint.matrixWorld.clone().multiply(item.matrix).elements);
          if(profile==='block') {
            assert.equal(item.geometry.type,'BoxGeometry');near(item.matrix.getMaxScaleOnAxis(),.3515625);
            if(pose===rest)assert.ok(new THREE.Vector3(0,1,0).transformDirection(item.matrixWorld).y>.98);
          } else {
            const grip=itemGrip(profile).applyMatrix4(item.matrix);
            near(grip.x,sign*MODEL_SCALE);near(grip.y,-(profile==='handheld'?9.5:9)*MODEL_SCALE);
            assert.ok(grip.y>=-10*MODEL_SCALE&&grip.y<=-8*MODEL_SCALE,'within the end of the actual arm');assert.ok(Math.abs(grip.z)<=2*MODEL_SCALE+1e-8);
            near(new THREE.Vector3().setFromMatrixScale(item.matrixWorld).x,.9375*ITEM_DISPLAY[profile].third.scale*size);
          }
          matrices.push([...item.matrixWorld.elements]);
        }
        if(view===1)rear=matrices;else assert.deepEqual(matrices,rear,'changing camera cannot change the grip');
        if(profile==='handheld'&&pose===rest) {
          const direction=new THREE.Vector3(1,1,0).transformDirection(model.userData.equipment.rightItem.matrixWorld);
          assert.ok(direction.z<-.7&&direction.y>0,'working end points ahead of the hand, never back toward the player');
        }
      }
    }
  }
});

test('first-person pictures are readable lower-right, tool tips extend up/away, offhand is a single mirror, and equip/use/swing have one parent',()=>{
  const inventory=new PlayerInventory(),hand=createEmptyHand(16/9);
  for(const id of examples) {
    inventory.slots[0]=inventory.slots[40]=stack(id);const profile=displayProfile(ITEMS.get(id));updateEmptyHand(hand,rest,inventory);hand.scene.updateMatrixWorld(true);
    const right=hand.mainItem,left=hand.offhandItem;
    for(const point of [itemGrip(profile),new THREE.Vector3(.4,.4,0),new THREE.Vector3(-.4,.4,0)]) {
      const a=point.clone().applyMatrix4(right.matrixWorld),b=point.clone().applyMatrix4(left.matrixWorld);near(a.x,-b.x);near(a.y,b.y);near(a.z,b.z);
    }
    assert.equal(right.parent,hand.itemHands[0]);assert.equal(left.parent,hand.itemHands[1]);assert.equal(hand.rig.visible,false);
    assert.equal(hand.itemHands[0].children.length,1,'no second hand/model transform behind the item');
    if(profile==='handheld') {
      const direction=new THREE.Vector3(1,1,0).transformDirection(right.matrixWorld);assert.ok(direction.y>.8&&direction.z<-.3);
      const grip=itemGrip(profile).applyMatrix4(right.matrixWorld);near(grip.x,.56+Math.SQRT1_2*.4*2/16);near(grip.y,-.42);near(grip.z,-.72+Math.SQRT1_2*.4*2/16);
      near(new THREE.Vector3().setFromMatrixScale(right.matrixWorld).x,.4*1.7);
    }
    if(profile!=='block') {
      const pixels=texturePixels(ITEMS.get(id).texture),box=new THREE.Box3();
      for(let y=0;y<16;y++)for(let x=0;x<16;x++)if(pixels[(y*16+x)*4+3]>=128)for(const xx of [x,x+1])for(const yy of [y,y+1])box.expandByPoint(new THREE.Vector3(xx/16-.5,.5-yy/16,0).applyMatrix4(right.matrixWorld).project(hand.camera));
      assert.ok(box.min.x>0&&box.max.x<1,'complete working end stays on the right and within the viewport');assert.ok(box.max.y<.5&&box.max.y>-.5);assert.ok(box.min.y<-.7);
      // Visible front points toward the camera; the old reversed/edge-on basis failed this.
      const normal=new THREE.Vector3(0,0,1).transformDirection(right.matrixWorld);assert.ok(normal.z>.4);
    }
    const local=right.matrix.clone(),initial=right.matrixWorld.clone();
    for(const pose of [{...rest,swingActive:true,swingProgress:.35},{...rest,equipHeight:.2},...(id==='bucket'?[{...rest,eating:true,eatAge:8}]:[])]) {
      updateEmptyHand(hand,pose,inventory);hand.scene.updateMatrixWorld(true);assert.ok(right.matrix.equals(local));assert.equal(right.matrixWorld.equals(initial),false);
    }
    updateEmptyHand(hand,rest,inventory);hand.scene.updateMatrixWorld(true);assert.ok(right.matrixWorld.equals(initial),'rest pose restores without accumulating offsets');
  }
  inventory.slots[0]=null;updateEmptyHand(hand,rest,inventory);assert.equal(hand.rig.visible,true);assert.equal(hand.itemHands[0].visible,false);
});
