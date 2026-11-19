import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Window } from 'happy-dom';
import * as THREE from 'three';
import { MovementController } from '../src/movement.js';
import { VoxelWorld } from '../src/voxel-world.js';
import { InventoryUI } from '../src/inventory-ui.js';
import { ChatUI } from '../src/chat-ui.js';
import { gameSimulationRunning } from '../src/gameplay-hud.js';
import { ITEMS, PlayerInventory, registerItem } from '../src/inventory.js';
import { texturePixels, BLOCK_TEXTURES } from '../src/block-textures.js';
import { createItemMesh } from '../src/item-assets.js';
import { displayProfile, ITEM_DISPLAY } from '../src/item-display.js';
import { createPlayerModel,animatePlayerModel,syncEquipment,createEmptyHand,updateEmptyHand } from '../src/player-visuals.js';
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-7,`${a} != ${b}`);
const stack=(id,count=1)=>({id,count});
function fixture(t) {
  const window=new Window({settings:{disableJavaScriptEvaluation:true,disableJavaScriptFileLoading:true,disableCSSFileLoading:true}}),document=window.document;
  document.write(readFileSync(new URL('../index.html',import.meta.url),'utf8'));
  const c=new MovementController(new VoxelWorld());
  const inventory=new InventoryUI({inventory:c.inventory,document,window,onClose:()=>ui.closeInventory()});
  const ui=new ChatUI({document,window,controller:c,inventoryUI:inventory,clearInput:o=>c.pause(o),requestCapture:()=>{},requestUnlock:()=>{}});
  let deaths=0;c.onDeath=()=>{deaths++;ui.showDeath();};ui.onPointerLockChange(true);
  t.after(()=>{inventory.dispose();ui.dispose();window.happyDOM.abort();window.close();});
  const frame=(dt=.05)=>{if(gameSimulationRunning(ui.mode))c.update(dt,{gameplayEnabled:ui.mode==='playing'});};
  return {c,ui,inventory,window,document,frame,deaths:()=>deaths};
}

test('chat, Escape, inventory/furnace and death keep water, falling blocks, furnace fuel/cooking and drops ticking; only living players pick up',t=>{
  for(const mode of ['chat','menu','inventory','furnace','death']) {
    const f=fixture(t),{c,ui}=f,w=c.world;
    w.setBlock(10,4,10,'water');w.setBlock(12,4,12,'furnace');w.setBlock(15,8,15,'sand');
    const furnace=w.furnaceAt(12,4,12);furnace.slots=[stack('raw.porkchop'),stack('oak.planks'),null];
    const falling=c.drops.spawn('dirt',2,{x:20,y:8,z:20},{thrown:true,velocity:{y:0}});
    c.drops.spawn('dirt',3,{x:20.1,y:8,z:20},{thrown:true,velocity:{y:0}});
    c.vitals.health=10;
    if(mode==='chat')ui.openChat();else if(mode==='menu')ui.pause();else if(mode==='inventory')ui.openInventory();
    else if(mode==='furnace')ui.openFurnace(furnace);else {c.inventory.slots[0]=stack('stone',3);c.vitals.health=0;c.die();}
    const at={x:c.player.x,y:c.player.y,z:c.player.z},hunger=c.vitals.hunger;
    c.drops.spawn('stone',1,{x:at.x,y:at.y+.1,z:at.z});
    for(let i=0;i<20;i++)f.frame();assert.ok(w.fluids.cells.size>1,mode);
    assert.ok(c.drops.piles.filter(p=>p.item==='dirt').every(p=>p.y<8),mode);assert.ok(c.drops.piles.filter(p=>p.item==='dirt').length<=1);
    for(let i=20;i<200;i++)f.frame();
    assert.equal(furnace.slots[2]?.id,'cooked.porkchop',mode);assert.equal(furnace.slots[1],null);assert.equal(furnace.burnTime,101);
    assert.equal(w.blockIdAt(15,4,15),'sand');near(c.drops.time,10);assert.equal(c.heldKeys.size,0);
    if(mode==='death') {
      assert.deepEqual({x:c.player.x,y:c.player.y,z:c.player.z},at);near(c.vitals.health,0);near(c.vitals.hunger,hunger);
      assert.ok(c.inventory.slots.slice(0,50).every(s=>!s));assert.equal(f.deaths(),1);near(c.reactions.pose().deathProgress,1);assert.equal(c.drops.total(),9n);
    }else{assert.ok(c.vitals.health>10,mode);assert.ok(c.inventory.slots.some(s=>s?.id==='stone'));}
    w.setBlock(10,4,10,false);for(let i=0;i<150;i++)f.frame();assert.equal(w.fluids.cells.size,0,mode);near(c.drops.time,17.5);
  }
});

test('chat/Escape release keys and pending actions while preserving midair momentum/interpolation at 30/144 FPS; returning does not replay ticks',t=>{
  for(const fps of [30,144])for(const mode of ['chat','menu']) {
    const f=fixture(t),baseline=new MovementController(new VoxelWorld());
    for(const c of [f.c,baseline]){c.teleport({x:.5,y:12,z:.5});c.player.vz=-.2;c.player.vy=.1;c.update(.025);}
    f.c.inventory.slots[0]=stack('raw.porkchop');f.c.vitals.hunger=10;f.c.eating.start();f.c.miningHeld=true;f.c.placementHeld=true;f.c.placementPresses=2;f.c.keyDown('KeyW');
    const before=f.c.renderState(),acc=f.c.accumulator,velocity=f.c.player.vz;
    if(mode==='chat')f.ui.openChat();else f.ui.pause();baseline.clearHeldInputs();
    near(f.c.player.vz,velocity);near(f.c.accumulator,acc);near(f.c.renderState().z,before.z);assert.equal(f.c.eating.active,null);assert.equal(f.c.miningHeld,false);assert.equal(f.c.placementHeld,false);assert.equal(f.c.placementPresses,0);
    const target=mode==='chat'?f.ui.elements['chat-input']:f.document.getElementById('player-name');
    target.dispatchEvent(new f.window.KeyboardEvent('keydown',{code:'KeyW',key:'w',bubbles:true,cancelable:true}));
    for(let i=0;i<fps/2;i++){f.frame(1/fps);baseline.update(1/fps,{gameplayEnabled:false});}
    for(const key of ['x','y','z','vx','vy','vz'])near(f.c.player[key],baseline.player[key]);assert.equal(f.c.heldKeys.size,0);assert.ok(f.c.player.z<before.z);
    const steps=f.c.totalSteps;f.ui.onPointerLockChange(true);f.frame();assert.equal(f.c.totalSteps,steps+1);
  }
});

test('death while typing/menu closes that interface once, freezes player/vitals, keeps world and item aging live and never picks up or duplicates death drops',t=>{
  for(const mode of ['chat','menu']) {
    const f=fixture(t),c=f.c;c.teleport({x:0,y:20,z:0});c.vitals.health=1;c.vitals.hunger=10;c.inventory.slots[0]=stack('stone',3);c.inventory.cursor=stack('stick',2);
    if(mode==='chat')f.ui.openChat();else f.ui.pause();
    for(let i=0;i<100&&!c.vitals.dead;i++)f.frame();assert.equal(f.ui.mode,'death');assert.equal(f.ui.elements['chat-input'].value,'');assert.equal(f.deaths(),1);assert.equal(c.drops.total(),5n);
    const player={x:c.player.x,y:c.player.y,z:c.player.z},health=c.vitals.toJSON(),worldTime=c.world.falling.time,dropTime=c.drops.time;
    for(let i=0;i<50;i++)f.frame();assert.equal(c.world.falling.time,worldTime+50);near(c.drops.time,dropTime+2.5);assert.deepEqual(c.vitals.toJSON(),health);assert.deepEqual({x:c.player.x,y:c.player.y,z:c.player.z},player);assert.equal(c.drops.total(),5n);assert.equal(f.deaths(),1);
    // Exercise expiration during death without simulating five minutes of water.
    c.drops.time=Math.max(...c.drops.piles.flatMap(p=>p.lots.map(l=>l.expires)))+.05;f.frame();assert.equal(c.drops.total(),0n);assert.ok(c.inventory.slots.every(s=>!s));
  }
  const slow=fixture(t);slow.c.teleport({x:0,y:-65,z:0});slow.c.vitals.health=4;slow.c.vitals.hunger=10;slow.c.vitals.voidTicks=9;slow.ui.openChat();
  slow.frame(.25);assert.equal(slow.ui.mode,'death');assert.equal(slow.c.totalSteps,5);assert.equal(slow.c.world.falling.time,5);near(slow.c.drops.time,.25);assert.equal(slow.deaths(),1);
});

const ordinary=['raw.porkchop','cooked.porkchop','bucket','water.bucket'];
test('ordinary sprites share thin silhouette-only geometry, nearest sampling and readable front/back UVs; pork art has one solid angled meat silhouette and little pale fat',()=>{
  for(const id of ordinary) {
    const a=createItemMesh(1,id),b=createItemMesh(1,id),g=a.geometry,p=g.getAttribute('position'),n=g.getAttribute('normal'),uv=g.getAttribute('uv');
    assert.equal(a.geometry,b.geometry);assert.equal(a.material,b.material);near(g.boundingBox.max.z-g.boundingBox.min.z,1/16);
    assert.equal(a.material.map.minFilter,THREE.NearestFilter);assert.equal(a.material.map.magFilter,THREE.NearestFilter);assert.equal(a.material.side,THREE.FrontSide);assert.equal(a.material.alphaTest,.5);
    let faceVertices=0;for(let i=0;i<n.count;i++)if(Math.abs(n.getZ(i))===1)faceVertices++;assert.equal(faceVertices,8);
    near(p.getX(0),-.5);near(p.getX(4),.5);near(uv.getX(0),0);near(uv.getX(4),0);
    const pixels=texturePixels(id),solid=(x,y)=>x>=0&&y>=0&&x<16&&y<16&&pixels[(y*16+x)*4+3]>0;
    let edges=0;for(let y=0;y<16;y++)for(let x=0;x<16;x++)if(solid(x,y))for(const [dx,dy] of [[1,0],[-1,0],[0,1],[0,-1]])if(!solid(x+dx,y+dy))edges++;
    assert.equal(p.count,8+edges*4,'only exposed opaque boundaries get edge quads');
  }
  for(const id of ordinary.slice(0,2)) {
    const t=BLOCK_TEXTURES.get(id);assert.equal(t.indices.length,256);assert.equal(t.palette[0],'#00000000');assert.ok([...t.indices].filter(i=>i===4).length<=6);
    for(let y=0;y<16;y++){const row=[...t.indices.slice(y*16,y*16+16)],a=row.findIndex(i=>i!==0),b=row.findLastIndex(i=>i!==0);if(a>=0)assert.ok(row.slice(a,b+1).every(i=>i!==0),'no holes in the cut of meat');}
    assert.match(decodeURIComponent(ITEMS.get(id).icon),/viewBox="0 0 16 16"/);
  }
  assert.notDeepEqual(texturePixels('raw.porkchop'),texturePixels('cooked.porkchop'));
  registerItem({id:'test.future.flat',name:'Future flat',maxStack:64,model:'flat',texture:'raw.porkchop'});assert.equal(displayProfile(ITEMS.get('test.future.flat')),'item');near(createItemMesh(1,'test.future.flat').geometry.boundingBox.max.z,1/32);
});

test('ordinary main/offhand items keep Java display scales, sit forward at animated palms in both F5 views, and have stable lower-corner first-person equip/swing/eat poses without arms',()=>{
  const inv=new PlayerInventory(),model=createPlayerModel(),hand=createEmptyHand(16/9),base={torsoYaw:0,headYaw:0,aimPitch:0,phase:0,amount:0,crouch:0,swingActive:false,swingProgress:0,equipHeight:1};
  near(ITEM_DISPLAY.generated.first.right.scale,.68);near(ITEM_DISPLAY.generated.third.right.scale,.55);
  for(const id of ordinary) {
    inv.slots[0]=stack(id);inv.slots[40]=stack(id);
    for(const size of [1,2])for(const pose of [base,{...base,amount:.8,phase:2,crouch:1},{...base,swingActive:true,swingProgress:.35},{...base,eating:true,eatAge:12}]) {
      let rear;
      for(const mode of [1,2]) {
        animatePlayerModel(model,{x:0,y:0,z:0,size},pose,mode,inv);syncEquipment(model,inv);model.updateMatrixWorld(true);
        const matrices=[];
        for(const [name,arm] of [['rightItem','Right Arm'],['leftItem','Left Arm']]) {
          const item=model.userData.equipment[name],joint=model.userData.joints[arm];assert.equal(item.parent,joint);assert.deepEqual(item.matrixWorld.elements,joint.matrixWorld.clone().multiply(item.matrix).elements);
          near(new THREE.Vector3().setFromMatrixScale(item.matrixWorld).x,.9375*.55*size);
          const center=new THREE.Vector3().applyMatrix4(item.matrix);assert.ok(center.y<-.4&&center.y>-.75);assert.ok(center.z<-.18&&center.z>-.4);matrices.push([...item.matrixWorld.elements]);
        }
        if(mode===1)rear=matrices;else assert.deepEqual(matrices,rear);
      }
    }
    updateEmptyHand(hand,base,inv);hand.scene.updateMatrixWorld(true);const rest=hand.mainItem.matrix.clone();assert.equal(hand.rig.visible,false);assert.ok(hand.doorHands.every(w=>!w.visible));
    for(const [i,item] of [hand.mainItem,hand.offhandItem].entries()) {
      const box=new THREE.Box3(),pixels=texturePixels(id);
      for(let y=0;y<16;y++)for(let x=0;x<16;x++)if(pixels[(y*16+x)*4+3])for(const a of [x,x+1])for(const b of [y,y+1])for(const z of [-1/32,1/32])box.expandByPoint(new THREE.Vector3(a/16-.5,.5-b/16,z).applyMatrix4(item.matrixWorld).project(hand.camera));
      assert.ok(i===0?box.getCenter(new THREE.Vector3()).x>.2:box.getCenter(new THREE.Vector3()).x<-.2);assert.ok(box.max.y<-.1);assert.ok(box.min.y<1&&box.max.y>-1);assert.ok(box.getSize(new THREE.Vector3()).x<.8);
    }
    updateEmptyHand(hand,{...base,swingActive:true,swingProgress:.4},inv);assert.equal(hand.mainItem.matrix.equals(rest),false);updateEmptyHand(hand,{...base,equipHeight:.2},inv);assert.ok(hand.mainItem.matrix.elements[13]<rest.elements[13]);
    if(ITEMS.get(id).food){updateEmptyHand(hand,{...base,eating:true,eatAge:12},inv);assert.equal(hand.mainItem.matrix.equals(rest),false);}
    updateEmptyHand(hand,base,inv);assert.ok(hand.mainItem.matrix.equals(rest));
  }
  for(const id of ['oak.door','pine.door']){inv.slots[0]=stack(id);updateEmptyHand(hand,base,inv);assert.equal(hand.mainItem.geometry.type,'PlaneGeometry');assert.ok(hand.doorHands.every(w=>w.children.every(c=>!c.visible||c===hand.mainItem)));assert.equal(hand.rig.visible,false);}
  inv.slots[0]=stack('stick');updateEmptyHand(hand,base,inv);assert.equal(displayProfile(ITEMS.get('stick')),'handheld');inv.slots[0]=stack('stone');updateEmptyHand(hand,base,inv);assert.equal(hand.mainItem.geometry.type,'BoxGeometry');
  inv.slots[0]=null;updateEmptyHand(hand,base,inv);assert.equal(hand.rig.visible,true);
});
