import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { ITEMS, PlayerInventory, registerItem } from '../src/inventory.js';
import { BLOCK_TEXTURES, texturePixels } from '../src/block-textures.js';
import { createItemMesh, setItemAppearance } from '../src/item-assets.js';
import { createPlayerModel, animatePlayerModel, syncEquipment, createEmptyHand, updateEmptyHand } from '../src/player-visuals.js';
import { DroppedItems } from '../src/dropped-items.js';
import { DroppedItemRenderer } from '../src/dropped-item-renderer.js';
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-6,`${a} != ${b}`);
const stack=id=>({id,count:1});
const rest={torsoYaw:0,headYaw:0,aimPitch:0,phase:0,amount:0,crouch:0,swingActive:false,swingProgress:0,equipHeight:1};
function inspectSprite(mesh,texture) {
  const g=mesh.geometry,p=g.getAttribute('position'),uv=g.getAttribute('uv'),n=g.getAttribute('normal'),pixels=texturePixels(texture),map=mesh.material.map;
  const size=mesh.userData.displayContext==='firstperson'?1:mesh.userData.itemSize;
  assert.equal(map.flipY,false);assert.equal(map.minFilter,THREE.NearestFilter);assert.equal(map.magFilter,THREE.NearestFilter);assert.equal(map.generateMipmaps,false);
  assert.equal(map.wrapS,THREE.ClampToEdgeWrapping);assert.equal(map.wrapT,THREE.ClampToEdgeWrapping);assert.equal(mesh.material.alphaTest,.5);assert.equal(mesh.material.depthWrite,true);
  const solid=(x,y)=>x>=0&&y>=0&&x<16&&y<16&&pixels[(y*16+x)*4+3]>=128;
  // Read the actual uploaded texture, not just the logical art. Row zero on the
  // GPU corresponds to the bottom of the image; no extra flip is permissible.
  for(let y=0;y<16;y++)for(let x=0;x<16;x++) {
    const a=(y*16+x)*4,b=((15-y)*16+x)*4;
    assert.deepEqual([...map.image.data.slice(b,b+4)],[...pixels.slice(a,a+4)]);
  }
  const sides=new Set();
  for(let i=0;i<p.count;i++)if(n.getZ(i)) {
    // In local space, front AND back image must coincide with the same XY mask.
    near(uv.getX(i),p.getX(i)/size+.5);near(uv.getY(i),p.getY(i)/size+.5);
  }
  if(g.type!=='PlaneGeometry')for(let i=8;i<p.count;i+=4) {
    const x=Math.floor(uv.getX(i)*16),y=Math.floor((1-uv.getY(i))*16),nx=n.getX(i),ny=n.getY(i);
    assert.ok(solid(x,y));assert.equal(solid(x+nx,y-ny),false,'side borders opaque art, including hole boundaries');
    sides.add(`${x},${y},${nx},${ny}`);
    for(let j=i;j<i+4;j++) {
      near(uv.getX(j),(x+.5)/16);near(uv.getY(j),1-(y+.5)/16);
      if(nx)near(p.getX(j)/size,(x+(nx>0?1:0))/16-.5);
      if(ny)near(p.getY(j)/size,.5-(y+(ny<0?1:0))/16);
    }
  }
  if(g.type!=='PlaneGeometry') {
    let edges=0;for(let y=0;y<16;y++)for(let x=0;x<16;x++)if(solid(x,y))for(const [nx,ny] of [[1,0],[-1,0],[0,1],[0,-1]])if(!solid(x+nx,y-ny)){edges++;assert.ok(sides.has(`${x},${y},${nx},${ny}`));}
    assert.equal(sides.size,edges);assert.equal(p.count,8+4*edges);
  }
  const a=new THREE.Vector3(),b=new THREE.Vector3(),c=new THREE.Vector3();
  for(let i=0;i<g.index.count;i+=3) {
    const ia=g.index.getX(i),ib=g.index.getX(i+1),ic=g.index.getX(i+2);
    a.fromBufferAttribute(p,ia);b.fromBufferAttribute(p,ib);c.fromBufferAttribute(p,ic);
    assert.ok(b.sub(a).cross(c.sub(a)).dot(new THREE.Vector3().fromBufferAttribute(n,ia))>0,'outward triangle winding');
  }
}

test('all flat items align both picture faces, silhouette/hole sides, alpha rows and winding; textures/materials/geometry are shared and crisp',()=>{
  // An asymmetric ring plus one extension catches both horizontal and vertical
  // reversals even if a future item's artwork happens to be symmetric.
  const indices=new Uint8Array(256);for(let y=2;y<=10;y++)for(let x=2;x<=7;x++)if(x===2||x===7||y===2||y===10)indices[y*16+x]=1;
  indices[10*16+8]=1;indices[10*16+9]=1;
  BLOCK_TEXTURES.set('test.asymmetric.hole',{size:16,palette:['#00000000','#e96d41'],indices});
  registerItem({id:'test.future.sprite',name:'Future sprite',maxStack:64,model:'flat',texture:'test.asymmetric.hole'});
  for(const item of ITEMS.values())if(item.model==='flat') {
    const a=createItemMesh(1,item.id),b=createItemMesh(1,item.id);inspectSprite(a,item.texture);
    assert.equal(a.geometry,b.geometry);assert.equal(a.material,b.material);
  }
  const mesh=createItemMesh(1,'test.future.sprite'),ray=new THREE.Raycaster();
  const sample=hit=>{const data=mesh.material.map.image.data,x=Math.min(15,Math.floor(hit.uv.x*16)),y=Math.min(15,Math.floor(hit.uv.y*16));return data[(y*16+x)*4+3];};
  mesh.updateMatrixWorld(true);
  for(const sign of [-1,1])for(const [x,y] of [[2,2],[9,10],[4,5],[13,2]]) {
    ray.set(new THREE.Vector3((x+.5)/16-.5,.5-(y+.5)/16,sign),new THREE.Vector3(0,0,-sign));
    const visible=ray.intersectObject(mesh).some(hit=>sample(hit)>=128);
    assert.equal(visible,indices[y*16+x]===1,'front/back holes and extensions match the source');
  }
});

test('redrawn tool silhouettes differ by type, are connected, and stay identical across material palettes and all icon consumers',()=>{
  const mask=id=>[...texturePixels(id)].filter((_,i)=>i%4===3).map(a=>a>=128);
  const types=['pickaxe','axe','shovel','hoe','sword'];
  assert.equal(new Set(types.map(t=>JSON.stringify(mask(`iron.${t}`)))).size,5);
  for(const type of types)for(const material of ['wood','stone','iron','gold','diamond'])assert.deepEqual(mask(`${material}.${type}`),mask(`iron.${type}`));
  const axe=mask('iron.axe'),shovel=mask('iron.shovel');assert.ok(axe.filter(Boolean).length>shovel.filter(Boolean).length,'axe has a broad chopping blade, shovel a compact tip');
  for(const id of [...types.map(t=>`iron.${t}`),'shears']) {
    const m=mask(id),start=m.findIndex(Boolean),seen=new Set([start]),queue=[start];
    while(queue.length){const at=queue.pop(),x=at%16,y=Math.floor(at/16);for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){const nx=x+dx,ny=y+dy,next=ny*16+nx;if(nx>=0&&nx<16&&ny>=0&&ny<16&&m[next]&&!seen.has(next)){seen.add(next);queue.push(next);}}}
    assert.equal(seen.size,m.filter(Boolean).length,`${id}: no detached art pixels`);
    assert.match(decodeURIComponent(ITEMS.get(id).icon),/viewBox="0 0 16 16"/);
  }
  const scissors=mask('shears');assert.equal(scissors[12*16+4],false);assert.equal(scissors[12*16+10],false);
});

test('axe, shovel, sword and bucket keep aligned art through first-person equip/swing, both F5 poses, offhand and dropped rendering; switching restores proper geometry',()=>{
  const inv=new PlayerInventory(),model=createPlayerModel(),hand=createEmptyHand(16/9),scene=new THREE.Scene(),drops=new DroppedItems(null,inv),renderer=new DroppedItemRenderer(scene);
  for(const id of ['iron.axe','iron.shovel','iron.sword','bucket','oak.door']) {
    const definition=ITEMS.get(id);inv.slots[0]=inv.slots[40]=stack(id);
    for(const pose of [rest,{...rest,amount:.8,phase:2,crouch:1},{...rest,swingActive:true,swingProgress:.4}]) {
      let rear;
      for(const mode of [1,2]) {
        animatePlayerModel(model,{x:0,y:4,z:0,size:1},pose,mode,inv);syncEquipment(model,inv);model.updateMatrixWorld(true);
        const matrices=[];for(const [name,arm] of [['rightItem','Right Arm'],['leftItem','Left Arm']]) {
          const item=model.userData.equipment[name],joint=model.userData.joints[arm];assert.equal(item.parent,joint);inspectSprite(item,definition.texture);
          assert.deepEqual(item.matrixWorld.elements,joint.matrixWorld.clone().multiply(item.matrix).elements);matrices.push([...item.matrixWorld.elements]);
        }
        if(mode===1)rear=matrices;else assert.deepEqual(matrices,rear);
      }
      updateEmptyHand(hand,pose,inv);hand.scene.updateMatrixWorld(true);inspectSprite(hand.mainItem,definition.texture);inspectSprite(hand.offhandItem,definition.texture);
      assert.equal(hand.rig.visible,false);
    }
    updateEmptyHand(hand,rest,inv);hand.scene.updateMatrixWorld(true);const initial=hand.mainItem.matrixWorld.clone();updateEmptyHand(hand,{...rest,equipHeight:.2},inv);assert.ok(hand.mainItem.matrixWorldNeedsUpdate);updateEmptyHand(hand,rest,inv);hand.scene.updateMatrixWorld(true);assert.ok(hand.mainItem.matrixWorld.equals(initial));
    const pile=drops.spawn(id,1,{x:10,y:4,z:0});renderer.update(drops);const item=renderer.meshes.get(pile.id).children[0];inspectSprite(item,definition.texture);assert.equal(item.geometry,createItemMesh(.25,id).geometry);
  }
  const item=hand.mainItem;setItemAppearance(item,'stone');assert.equal(item.geometry.type,'BoxGeometry');setItemAppearance(item,'iron.shovel');inspectSprite(item,'iron.shovel');
  inv.slots[0]=null;updateEmptyHand(hand,rest,inv);assert.equal(hand.rig.visible,true);
});
