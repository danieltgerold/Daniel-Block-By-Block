import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { VoxelWorld } from '../src/voxel-world.js';
import { MovementController } from '../src/movement.js';
import { BLOCK_TYPES } from '../src/block-types.js';
import { ITEMS } from '../src/inventory.js';
import { commandCompletions } from '../src/chat-commands.js';
import { buildChunkMesh } from '../src/voxel-mesh.js';
import { BlockBreaking } from '../src/block-breaking.js';
import { BreakingIndicator } from '../src/breaking-indicator.js';
import { migrateWorldData } from '../src/world-migration.js';
import { placeBlock } from '../src/block-actions.js';
const near = (a,b) => assert.ok(Math.abs(a-b)<1e-8, `${a} != ${b}`);
function fixture(id = 'dirt', state = {}) {
  const world = new VoxelWorld({ depth: 3 }), controller = new MovementController(world), aim = { yaw: 0, pitch: 0 };
  controller.teleport({ x: .5, y: 0, z: 2.5 });
  if (id.endsWith('.door')) { world.setBlock(0,0,0,'stone'); placeBlock(world,id,{x:0,y:0,z:0,normal:{x:0,y:1,z:0},point:{x:.5,y:1,z:.5}},0); }
  else world.setBlock(0,1,0,id,state);
  const breaking = new BlockBreaking({ controller, world, getAim: () => aim });
  controller.onTick = () => breaking.tick();
  const tick = (n=1) => { for(let i=0;i<n;i++)controller.update(.05,aim); };
  return { world, controller, breaking, aim, tick };
}

test('new flat worlds have four typed layers and safe feet at 4; generated grass reacts to cover and Test Block is absent', () => {
  const w = new VoxelWorld(), c = new MovementController(w);
  for (const x of [-17,0,16]) { assert.equal(w.blockIdAt(x,0,x),'bedrock'); assert.equal(w.blockIdAt(x,1,x),'dirt'); assert.equal(w.blockIdAt(x,2,x),'dirt'); assert.equal(w.blockIdAt(x,3,x),'grass.block'); assert.equal(w.blockIdAt(x,-1,x),null); assert.equal(w.blockIdAt(x,4,x),null); }
  near(c.player.y,4); near(w.findSpawn().y,4);
  w.setBlock(0,4,0,'stone'); assert.equal(w.blockIdAt(0,3,0),'dirt'); assert.ok(w.findSpawn().y>=4);
  const mesh = buildChunkMesh(new VoxelWorld(),0,0); near(Math.min(...mesh.positions.filter((_,i)=>i%3===1)),0); near(Math.max(...mesh.positions.filter((_,i)=>i%3===1)),4);
  assert.equal(BLOCK_TYPES.has('test.block'),false); assert.equal(ITEMS.has('test.block'),false); assert.ok(commandCompletions('/give bed').includes('/give bedrock ')); assert.equal(ITEMS.get('bedrock').maxStack,64);
});

test('legacy helper migration shifts once, preserves holes/builds/player/items, and adds bedrock without overwriting builds', () => {
  const old = { world: { version:2,depth:3,edits:[{x:0,y:-1,z:0,id:null,solid:false,state:{}},{x:1,y:0,z:0,id:'test.block',solid:true,state:{}},{x:2,y:-4,z:0,id:'oak.planks',solid:true,state:{}}]},
    player:{x:.5,y:.75,z:.5},inventory:{slots:[{id:'test.block',count:16},{id:'oak.log',count:5}],cursor:{id:'test.block',count:3}} };
  const snapshot=JSON.stringify(old), migrated=migrateWorldData(old); assert.equal(JSON.stringify(old),snapshot);
  near(migrated.data.player.y,4.75); assert.deepEqual(migrated.data.inventory.slots[0],{id:'dirt',count:16}); assert.equal(migrated.data.inventory.cursor.count,3);
  const w=new VoxelWorld(); w.load(old); assert.equal(w.blockIdAt(0,3,0),null); assert.equal(w.blockIdAt(1,4,0),'dirt'); assert.equal(w.blockIdAt(2,0,0),'oak.planks'); assert.equal(w.blockIdAt(0,0,0),'bedrock');
  const current=w.save(), restored=new VoxelWorld(); const result=restored.load(current); assert.equal(result.shiftY,0); assert.deepEqual(restored.save(),current); assert.equal(migrateWorldData(migrated.data).data.player.y,4.75);
});

test('central hardness metadata and actual Survival clock give the requested bare-hand breaking times', () => {
  for(const [id,ticks] of [['dirt',15],['grass.block',18],['stone',150],['cobblestone',200],['glass',9],['oak.planks',60],['oak.slab',60],['oak.door',90],['furnace',350]]) {
    assert.equal(BLOCK_TYPES.get(id).breakTicks,ticks); const f=fixture(id); if(id.endsWith('slab'))f.aim.pitch=-.25;
    f.breaking.press(); f.tick(ticks-1); assert.equal(f.world.blockIdAt(0,1,0),id,`${id} broke early`); f.tick(); assert.equal(f.world.blockIdAt(0,1,0),null,`${id} missed its tick`); assert.equal(f.breaking.target,null);
    if(id.endsWith('door')) assert.equal(f.world.blockIdAt(0,2,0),null);
    if(['stone','cobblestone','furnace','oak.door'].includes(id)) assert.equal(f.controller.drops.total(),1n);
  }
  const double=fixture('pine.slab',{type:'double'}); double.breaking.press(); double.tick(60); assert.equal(double.world.blockIdAt(0,1,0),null); assert.equal(double.controller.drops.total(),2n);
});

test('mining progress resets on target/state/reach/release/menu changes, ignores face changes and waits six ticks between breaks', () => {
  const f=fixture(); f.world.setBlock(0,1,-1,'dirt'); f.breaking.press(); f.tick(5); near(f.breaking.progress,1/3);
  const target=f.controller.targetBlock.bind(f.controller); f.controller.targetBlock=(...args)=>{const h=target(...args);return h?{...h,normal:{x:1,y:0,z:0}}:h;}; f.tick(); near(f.breaking.progress,6/15);
  f.world.setBlock(0,1,0,'dirt',{changed:true}); f.tick(); near(f.breaking.progress,1/15);
  f.world.setBlock(0,1,0,false);f.world.setBlock(0,1,0,'dirt');assert.equal(f.breaking.progress,0);
  f.controller.configure('reach',.1); f.tick(); assert.equal(f.breaking.progress,0); f.controller.configure('reach',4.5);
  f.breaking.press(); f.tick(15); assert.equal(f.world.blockIdAt(0,1,0),null); f.tick(6); assert.equal(f.breaking.progress,0); f.tick(14); assert.equal(f.world.blockIdAt(0,1,-1),'dirt'); f.tick(); assert.equal(f.world.blockIdAt(0,1,-1),null);
  const g=fixture(); g.breaking.press();g.tick(3);g.controller.setMining(false);assert.equal(g.breaking.progress,0);g.breaking.press();g.tick(2);g.controller.pause({preserveMomentum:true});assert.equal(g.breaking.target,null);
});

test('eye-underwater and airborne penalties multiply per tick; frame rates agree; bedrock is Survival-unbreakable and Creative-instant', () => {
  for(const [ground,water,ticks] of [[true,true,75],[false,false,75],[false,true,375]]) {
    const f=fixture();f.world.fluids.submerged=()=>water;f.controller.player.grounded=ground;f.breaking.press();
    for(let i=0;i<ticks-1;i++)f.breaking.tick();assert.equal(f.world.blockIdAt(0,1,0),'dirt');f.breaking.tick();assert.equal(f.world.blockIdAt(0,1,0),null);
  }
  for(const fps of [30,144]) {const f=fixture();let at=0;f.breaking.onBreak=()=>{at=f.controller.totalSteps;};f.breaking.press();for(let i=0;i<fps;i++)f.controller.update(1/fps,f.aim);assert.equal(at,15);}
  const changing=fixture();changing.breaking.press();for(let i=0;i<5;i++)changing.breaking.tick();changing.world.fluids.submerged=()=>true;for(let i=0;i<5;i++)changing.breaking.tick();changing.controller.player.grounded=false;for(let i=0;i<5;i++)changing.breaking.tick();near(changing.breaking.progress,5/15+5/75+5/375);
  const f=fixture('bedrock');f.breaking.press();f.tick(100);assert.equal(f.world.blockIdAt(0,1,0),'bedrock');assert.equal(f.breaking.target,null);assert.equal(f.breaking.progress,0);
  assert.equal(f.world.destroyBlock(0,1,0,{gameMode:'survival'}),false);f.controller.setGameMode('creative');f.breaking.press();assert.equal(f.world.blockIdAt(0,1,0),null);assert.equal(f.controller.drops.total(),0n);
});

test('progress uses reusable depth-tested rectangles on actual partial-block faces and hides immediately when target changes', () => {
  const f=fixture('oak.slab');f.aim.pitch=-.25;f.breaking.press();f.tick(10);
  const hit=f.controller.targetBlock(f.controller.player,0,-.25), indicator=new BreakingIndicator(), camera=new THREE.PerspectiveCamera();camera.position.set(.5,1.62,2.5);camera.lookAt(.5,1.25,.5);camera.updateMatrixWorld();
  indicator.update(f.breaking,hit,f.world,camera);assert.equal(indicator.visible,true);assert.equal(indicator.children.length,2);assert.equal(indicator.fill.geometry.type,'PlaneGeometry');assert.equal(indicator.fill.material.depthTest,true);assert.ok(indicator.fill.scale.x<indicator.background.scale.x);assert.ok(indicator.position.y<=1.5);
  const geometry=indicator.geometry;indicator.update(f.breaking,hit,f.world,camera);assert.equal(indicator.geometry,geometry);indicator.update(f.breaking,null,f.world,camera);assert.equal(indicator.visible,false);indicator.dispose();
});
