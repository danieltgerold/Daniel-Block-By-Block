import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Window } from 'happy-dom';
import * as THREE from 'three';
import { BLOCK_TYPES, blockDrops, blockFaceTexture } from '../src/block-types.js';
import { ITEMS, PlayerInventory } from '../src/inventory.js';
import { MINERALS, STONE_MATERIALS, STONE_SHAPES, TOOL_DEFINITIONS } from '../src/mining-content.js';
import { RECIPES } from '../src/recipes.js';
import { FurnaceEntity, SMELTING, FUELS } from '../src/smelting.js';
import { VoxelWorld } from '../src/voxel-world.js';
import { MovementController } from '../src/movement.js';
import { BlockBreaking } from '../src/block-breaking.js';
import { BreakingIndicator } from '../src/breaking-indicator.js';
import { miningProgress } from '../src/breaking-properties.js';
import { BlockPlacement } from '../src/block-placement.js';
import { damageMainTool } from '../src/tool-use.js';
import { blockBoxes, wallConnections } from '../src/block-shapes.js';
import { createItemMesh } from '../src/item-assets.js';
import { texturePixels } from '../src/block-textures.js';
import { commandCompletions } from '../src/chat-commands.js';
import { CreativeInventory } from '../src/creative-inventory.js';
import { InventoryUI } from '../src/inventory-ui.js';
const stack=(id,count=1,damage)=>({id,count,...(damage===undefined?{}:{damage})});
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-8,`${a} != ${b}`);
const ticks=(c,n)=>{for(let i=0;i<n;i++)c.update(.05);};

test('all stone variants, eight old ores, seven stores, minerals and 26 tools use the shared registry/art/catalog without changing flat layers',()=>{
  const ids=[...STONE_MATERIALS.map(v=>v[0]),...STONE_SHAPES.flatMap(v=>['slab','stairs','wall'].map(s=>`${v[0]}.${s}`)),...MINERALS.flatMap(v=>[`${v[0]}.ore`,v[5],...(v[4]?[`${v[0]}.block`]:[])]),...TOOL_DEFINITIONS.keys(),'farmland'];
  for(const id of ids){assert.ok(ITEMS.has(id),id);assert.ok(ITEMS.get(id).icon,id);assert.ok(commandCompletions('/give '+id).includes(`/give ${id} `));const mesh=createItemMesh(.25,id);assert.ok(mesh.geometry.getAttribute('position').count>0,id);}
  assert.equal([...BLOCK_TYPES.keys()].filter(id=>id.endsWith('.ore')).length,8);
  for(const bad of ['copper','raw.iron','raw.gold','deepslate.ore','nether.gold.ore'])assert.equal(ITEMS.has(bad),false);
  const w=new VoxelWorld();assert.deepEqual([0,1,2,3].map(y=>w.blockIdAt(0,y,0)),['bedrock','dirt','dirt','grass.block']);
  const catalog=new CreativeInventory(new PlayerInventory(),()=>true).items();for(const kind of ['slab','stairs','wall']) {const positions=STONE_SHAPES.map(v=>catalog.findIndex(i=>i.id===`${v[0]}.${kind}`));assert.ok(positions.every(p=>p>=0));const between=catalog.slice(Math.min(...positions),Math.max(...positions)+1);assert.ok(between.every(i=>i.creativeKind===kind));}
  for(const tool of TOOL_DEFINITIONS.values()){assert.equal(ITEMS.get(tool.id).maxStack,1);assert.equal(texturePixels(tool.id).length,1024);}
});

test('wall boxes connect dynamically to other materials and solid faces, stay narrow and reach 1.5 high; slabs/stairs keep their shape/state and proper drops',()=>{
  const w=new VoxelWorld({depth:0});w.setBlock(0,0,0,'stone.wall');let wall=w.blockAt(0,0,0);
  const isolated=w.boxesFor(wall);assert.equal(isolated.length,1);near(isolated[0].max.y,1.5);near(isolated[0].min.x,.25);
  w.setBlock(1,0,0,'mossy.cobblestone.wall');assert.equal(wallConnections(wall,w).east,true);assert.ok(w.boxesFor(wall).some(b=>b.max.x===1));near(Math.max(...w.boxesFor(wall,'selection').map(b=>b.max.y)),1);
  w.setBlock(1,0,0,'stone');assert.equal(wallConnections(wall,w).east,true);w.setBlock(1,0,0,false);assert.equal(wallConnections(wall,w).east,false);assert.equal(w.boxesFor(wall).length,1);
  w.setBlock(0,0,2,'stone.bricks.slab',{type:'double'});let b=w.blockAt(0,0,2);assert.deepEqual(blockDrops(b,{tool:stack('wood.pickaxe')}),[stack('stone.bricks.slab',2)]);assert.deepEqual(blockDrops(b),[]);
  w.setBlock(0,0,3,'mossy.stone.bricks.stairs',{half:'top',facing:'west',shape:'inner-left'});const saved=JSON.parse(JSON.stringify(w.save())),restored=new VoxelWorld();restored.load(saved);assert.equal(restored.blockStateAt(0,0,3).half,'top');assert.equal(restored.blockStateAt(0,0,3).facing,'west');assert.ok(blockBoxes(restored.blockAt(0,0,3)).length>1);
});

test('tool, shears, stone/polished/shape/storage recipes match translated/mirrored layouts and the real crafting session consumes exact ingredients',()=>{
  const ids=[...TOOL_DEFINITIONS.keys(),'stone.bricks','chiseled.stone.bricks',...STONE_SHAPES.flatMap(v=>['slab','stairs','wall'].map(s=>`${v[0]}.${s}`)),'polished.granite','polished.diorite','polished.andesite',...MINERALS.filter(v=>v[4]).map(v=>`${v[0]}.block`),'bucket'];
  for(const id of ids){const r=RECIPES.recipes.get(id);assert.ok(r,id);for(const mirror of [false,true]){
    const grid=Array(9).fill(null),dx=3-r.width,dy=3-r.height;
    r.cells.forEach((input,i)=>{if(input){const concrete=input.item??(i%2?'oak.planks':'pine.planks'),x=mirror?r.width-1-i%r.width:i%r.width;grid[(dy+Math.floor(i/r.width))*3+dx+x]=stack(concrete,input.count);}});
    assert.equal(RECIPES.match(grid,3,ITEMS)?.recipe.output.id,id,id);
  }}
  for(const [mineral,,,,hardness,item] of MINERALS)if(hardness){const result=RECIPES.match([stack(`${mineral}.block`),null,null,null],2,ITEMS);assert.deepEqual(result.recipe.output,stack(item,9));}
  const inv=new PlayerInventory();inv.crafting.begin(3);inv.slots[0]=stack('iron.ingot',3);inv.slots[1]=stack('stick',2);assert.equal(inv.crafting.fill('iron.pickaxe').ok,true);assert.equal(inv.crafting.take(),1);assert.deepEqual(inv.cursor,stack('iron.pickaxe'));assert.ok(inv.crafting.grid.every(s=>!s));
});

test('harvesting levels are separate from speed, ore amounts stay in range, stone drops cobble, shears collect leaves and swords accelerate leaves',()=>{
  for(const [ore,,,,,item] of MINERALS) {
    const def=BLOCK_TYPES.get(`${ore}.ore`),b={id:def.id,definition:def,state:{}};assert.deepEqual(blockDrops(b),[]);
    for(const material of ['wood','gold','stone','iron','diamond']) {
      const tool=ITEMS.get(`${material}.pickaxe`),drops=blockDrops(b,{toolDefinition:tool,random:()=>0});
      if(tool.tool.level<def.harvestLevel)assert.deepEqual(drops,[],`${material}/${ore}`);
      else {assert.equal(drops[0].id,['iron','gold'].includes(ore)?`${ore}.ore`:item);assert.equal(drops[0].count,['lapis','redstone'].includes(ore)?4:1);}
    }
  }
  for(const [id,max] of [['lapis.ore',8],['redstone.ore',5]])assert.equal(blockDrops({id,definition:BLOCK_TYPES.get(id)},{toolDefinition:ITEMS.get('diamond.pickaxe'),random:()=>.999999})[0].count,max);
  const stone={id:'stone',definition:BLOCK_TYPES.get('stone')};assert.deepEqual(blockDrops(stone,{tool:stack('wood.pickaxe')}),[stack('cobblestone')]);assert.deepEqual(blockDrops(stone,{tool:stack('diamond.axe')}),[]);
  const leaves={id:'pine.leaves',definition:BLOCK_TYPES.get('pine.leaves')};assert.deepEqual(blockDrops(leaves),[]);assert.deepEqual(blockDrops(leaves,{tool:stack('shears')}),[stack('pine.leaves')]);
  near(miningProgress(leaves.definition,ITEMS.get('wood.sword')),1.5/.2/30);assert.ok(miningProgress(leaves.definition,ITEMS.get('shears'))>=1);
  const iron=BLOCK_TYPES.get('iron.ore');near(miningProgress(iron,ITEMS.get('wood.pickaxe')),2/3/100);near(miningProgress(iron,ITEMS.get('stone.pickaxe')),4/3/30);near(miningProgress(iron,ITEMS.get('stone.pickaxe'),{grounded:false,underwater:true}),4/25/3/30);
});

function mine(id,tool) {
  const w=new VoxelWorld({depth:3}),c=new MovementController(w);c.teleport({x:.5,y:0,z:2.5});w.setBlock(0,1,0,id);c.inventory.slots[0]=stack(tool);
  const breaking=new BlockBreaking({world:w,controller:c,getAim:()=>({yaw:0,pitch:0})});c.onTick=()=>breaking.tick();breaking.press();return {w,c,breaking};
}
test('actual mining ticks, tool changes, progress indicator and 1.8 off-by-one durability use a single controller path',()=>{
  for(const [tool,time,drop] of [['wood.pickaxe',150,0n],['stone.pickaxe',23,1n],['iron.pickaxe',15,1n],['gold.pickaxe',25,0n]]) {
    const {w,c}=mine('iron.ore',tool);ticks(c,time-1);assert.equal(w.blockIdAt(0,1,0),'iron.ore');ticks(c,1);assert.equal(w.blockIdAt(0,1,0),null);assert.equal(c.drops.total(),drop);assert.equal(c.inventory.mainHand.damage,1);
  }
  const f=mine('diamond.ore','wood.pickaxe');ticks(f.c,5);f.c.inventory.slots[0]=stack('iron.pickaxe');ticks(f.c,1);near(f.breaking.progress,6/3/30);
  const bar=new BreakingIndicator(),camera=new THREE.PerspectiveCamera();bar.update(f.breaking,f.c.targetBlock(f.c.player,0,0),f.w,camera);assert.equal(bar.visible,true);bar.dispose();
  const c=new MovementController(new VoxelWorld());c.inventory.slots[0]=stack('wood.pickaxe');for(let i=0;i<59;i++)damageMainTool(c);assert.equal(c.inventory.mainHand.damage,59);damageMainTool(c);assert.equal(c.inventory.mainHand,null);
  c.inventory.slots[0]=stack('shears',1,238);damageMainTool(c);assert.equal(c.inventory.mainHand,null);
  const last=mine('stone','wood.pickaxe');last.c.inventory.mainHand.damage=59;ticks(last.c,23);assert.equal(last.c.inventory.mainHand,null);assert.equal(last.c.drops.piles[0].item,'cobblestone');
  const sword=mine('oak.leaves','wood.sword');ticks(sword.c,4);assert.equal(sword.c.inventory.mainHand.damage,2);const shear=mine('oak.leaves','shears');ticks(shear.c,1);assert.equal(shear.c.inventory.mainHand.damage,1);assert.equal(shear.c.drops.piles[0].item,'oak.leaves');
  c.setGameMode('creative');c.inventory.slots[0]=stack('gold.pickaxe',1,31);damageMainTool(c);assert.equal(c.inventory.mainHand.damage,31);
});

test('tool damage survives cursor/right-click/drag/shift/offhand, never stacks, remains separate in world piles, picks up and round-trips in snapshots',()=>{
  const inv=new PlayerInventory();inv.slots[0]=stack('iron.pickaxe',1,17);inv.click(0);assert.equal(inv.cursor.damage,17);inv.click(9,2);inv.shift(9);assert.equal(inv.slots[0].damage,17);inv.swap(0,40);inv.click(40);inv.drag([10,11],2);assert.equal(inv.slots[10].damage,17);
  inv.click(10);inv.slots[0]=stack('iron.pickaxe',1,23);inv.click(0);assert.equal(inv.cursor.damage,23);assert.equal(inv.slots[0].damage,17);inv.close();assert.equal(inv.slots.filter(s=>s?.id==='iron.pickaxe').length,2);assert.ok(inv.slots.filter(Boolean).every(s=>s.count===1));
  const w=new VoxelWorld(),c=new MovementController(w);c.teleport({x:0,y:4,z:0});c.drops.spawn('iron.pickaxe',1,{x:5,y:4,z:0},{stack:stack('iron.pickaxe',1,17)});c.drops.spawn('iron.pickaxe',1,{x:5,y:4,z:0},{stack:stack('iron.pickaxe',1,23)});c.update(.05);assert.equal(c.drops.piles.length,2);
  c.teleport({x:5,y:4,z:0});c.update(.05);assert.equal(c.drops.total(),0n);assert.deepEqual(c.inventory.slots.filter(Boolean).map(s=>s.damage).sort(),[17,23]);
  c.inventory.cursor=stack('gold.sword',1,12);c.drops.spawn('diamond.shovel',1,{x:12,y:5,z:12},{stack:stack('diamond.shovel',1,44)});const saved=JSON.parse(JSON.stringify(w.save())),r=new VoxelWorld(),rc=new MovementController(r);r.load(saved);
  assert.deepEqual(rc.inventory.slots,c.inventory.slots);assert.deepEqual(rc.inventory.cursor,c.inventory.cursor);assert.equal(rc.drops.piles[0].stackData.damage,44);assert.equal(rc.drops.total(),1n);
  c.inventory.drop(0);const thrown=c.drops.piles.find(p=>p.item==='iron.pickaxe');assert.equal(thrown.stackData.damage,17);
});

test('hoe creates shape-correct farmland, hydration/drying use world updates, recipes smelt for 200 ticks and coal burns 1600',t=>{
  const w=new VoxelWorld({depth:3}),c=new MovementController(w);c.teleport({x:.5,y:0,z:.5});c.inventory.slots[0]=stack('wood.hoe');const place=new BlockPlacement({controller:c,world:w,getAim:()=>({yaw:0,pitch:-Math.PI/2}),canInteract:()=>true});assert.equal(place.attempt(),true);assert.equal(w.blockIdAt(0,-1,0),'farmland');assert.equal(c.inventory.mainHand.damage,1);near(w.boxesFor(w.blockAt(0,-1,0))[0].max.y,-1/16);
  w.setBlock(1,-1,0,'water');w.step(1);assert.equal(w.blockStateAt(0,-1,0).moisture,7);assert.equal(blockFaceTexture('farmland',1,1,w.blockStateAt(0,-1,0)),'farmland.wet');w.setBlock(1,-1,0,'dirt');w.step(38);assert.equal(w.blockIdAt(0,-1,0),'dirt');
  assert.equal(FUELS.get('coal'),1600);
  for(const input of ['iron.ore','gold.ore','cobblestone','stone.bricks','sand','raw.porkchop']){const f=new FurnaceEntity({slots:[stack(input),stack('coal'),null]});for(let i=0;i<199;i++)f.tick();assert.equal(f.slots[2],null);f.tick();assert.equal(f.slots[2].id,SMELTING.get(input).output);assert.equal(f.burnTime,1401);}
  const window=new Window({settings:{disableJavaScriptEvaluation:true,disableJavaScriptFileLoading:true,disableCSSFileLoading:true}}),document=window.document;document.write(readFileSync(new URL('../index.html',import.meta.url),'utf8'));const ui=new InventoryUI({inventory:c.inventory,document,window});t.after(()=>{ui.dispose();window.happyDOM.abort();window.close();});
  c.inventory.slots[0]=stack('wood.pickaxe',1,30);c.inventory.changed();assert.ok(ui.hudViews.get(0).querySelector('.durability-bar'));c.inventory.click(0);assert.ok(ui.cursorView.querySelector('.durability-bar'));
  ui.open(3);ui.book.root.hidden=false;ui.book.render(true);assert.ok(ui.book.buttons.has('diamond.pickaxe'));assert.ok(ui.book.buttons.has('stone.wall'));
});
