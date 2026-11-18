import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { VoxelWorld } from '../src/voxel-world.js';
import { MovementController } from '../src/movement.js';
import { BLOCK_TYPES } from '../src/block-types.js';
import { BlockBreaking } from '../src/block-breaking.js';
import { BreakingIndicator } from '../src/breaking-indicator.js';
import { miningProgress } from '../src/breaking-properties.js';
import { FallingBlockRenderer } from '../src/falling-block-renderer.js';
import { placeBlock } from '../src/block-actions.js';
const ticks = (w,n) => { for (let i=0;i<n;i++) w.step(.05); };
function mining(id) {
  const world=new VoxelWorld({depth:3}), controller=new MovementController(world), aim={yaw:0,pitch:0};
  controller.teleport({x:.5,y:0,z:2.5});
  if(BLOCK_TYPES.get(id).falling)world.setBlock(0,0,0,'stone');
  if(id.endsWith('.door')) { world.setBlock(0,0,0,'stone'); placeBlock(world,id,{x:0,y:0,z:0,normal:{x:0,y:1,z:0}},0); }
  else world.setBlock(0,1,0,id);
  if(['slab','stairs'].includes(BLOCK_TYPES.get(id).collisionShape)) aim.pitch=-.25;
  const breaking=new BlockBreaking({world,controller,getAim:()=>aim}); controller.onTick=()=>breaking.tick();
  return {world,controller,aim,breaking};
}

test('all Survival block types show a late-drawn depth-tested bar on an actual exposed face, including cloned equal states',()=>{
  const camera=new THREE.PerspectiveCamera(), bar=new BreakingIndicator(); camera.position.set(.5,1.62,2.5);camera.lookAt(.5,1.5,0);camera.updateMatrixWorld();
  for(const definition of BLOCK_TYPES.values()) {
    if(!definition.solid || definition.unbreakable)continue;
    const f=mining(definition.id), original=f.world.blockAt.bind(f.world);
    // Simulates serializers/shape queries returning equal state values with
    // different object identities, which must not reset mining or hide the bar.
    f.world.blockAt=(...args)=>{const b=original(...args);return b?{...b,definition:b.definition,state:{...b.state}}:null;};
    f.breaking.press();f.controller.update(.1,f.aim);
    assert.ok(f.breaking.progress>0,definition.id);
    const hit=f.controller.targetBlock(f.controller.player,f.aim.yaw,f.aim.pitch);
    bar.update(f.breaking,hit,f.world,camera);assert.equal(bar.visible,true,definition.id);
    assert.ok(bar.background.renderOrder>0);assert.ok(bar.fill.renderOrder>bar.background.renderOrder);
    assert.equal(bar.fill.material.depthTest,true);
    assert.ok(bar.fill.scale.x>0 && bar.fill.scale.x<bar.background.scale.x);
    f.breaking.dispose();
  }
  const ground=new VoxelWorld(), controller=new MovementController(ground), breaking=new BlockBreaking({world:ground,controller,getAim:()=>({yaw:0,pitch:-Math.PI/2})});
  breaking.press();breaking.tick();bar.update(breaking,controller.targetBlock(controller.player,0,-Math.PI/2),ground,camera);assert.equal(bar.visible,true);
  bar.dispose();
});

test('leaves take six real game ticks with an ordinary held item; future tool speed/harvest hooks are independent of drops',()=>{
  for(const fps of [30,144]) for(const id of ['oak.leaves','pine.leaves']) {
    const f=mining(id);f.controller.inventory.slots[0]={id:'stick',count:1};let brokeAt=0;
    f.breaking.onBreak=()=>brokeAt=f.controller.totalSteps;f.breaking.press();
    for(let frame=0;frame<Math.ceil(.35*fps);frame++)f.controller.update(1/fps,f.aim);
    assert.equal(brokeAt,6);assert.equal(brokeAt*.05,.30000000000000004);
  }
  const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-12), stone=BLOCK_TYPES.get('stone'); near(miningProgress(stone,{id:'dirt'}),1/150);
  near(miningProgress(stone,{tool:{type:'shovel',speed:8}}),1/150);
  assert.equal(miningProgress(stone,{tool:{type:'pickaxe',speed:8,level:1}}),8/1.5/30);
  assert.equal(miningProgress({...stone,harvestLevel:2},{tool:{type:'pickaxe',speed:8,level:1}}),8/1.5/100);
  near(miningProgress(stone,null,{grounded:false,underwater:true}),.04/1.5/100);
  assert.equal(miningProgress(BLOCK_TYPES.get('bedrock'),null),0);
});

test('sand/gravel wait two ticks, recheck support, and a removed support lets the stack settle once',()=>{
  const w=new VoxelWorld({depth:0});w.setBlock(0,0,0,'stone');w.setBlock(0,3,0,'stone');w.setBlock(0,4,0,'sand');w.setBlock(0,5,0,'gravel');ticks(w,2);assert.equal(w.falling.entities.length,0);
  w.setBlock(0,3,0,false);ticks(w,1);assert.equal(w.blockIdAt(0,4,0),'sand');ticks(w,1);assert.equal(w.blockIdAt(0,4,0),null);assert.equal(w.falling.entities.length,1);
  ticks(w,80);assert.equal(w.blockIdAt(0,1,0),'sand');assert.equal(w.blockIdAt(0,2,0),'gravel');assert.equal(w.falling.entities.length,0);assert.equal(w.pendingDrops.length,0);
  const supported=new VoxelWorld({depth:0});supported.setBlock(0,3,0,'sand');ticks(supported,1);supported.setBlock(0,2,0,'stone');ticks(supported,2);assert.equal(supported.blockIdAt(0,3,0),'sand');assert.equal(supported.falling.entities.length,0);
});

test('falling through water replaces the landing cell and wakes water; partial obstacles and players never get overwritten',()=>{
  const w=new VoxelWorld({depth:0});
  for(let x=-1;x<=1;x++)for(let z=-1;z<=1;z++)for(let y=0;y<=5;y++)if(y===0 || x!==0 || z!==0)w.setBlock(x,y,z,'stone');
  for(let y=1;y<=4;y++)w.setBlock(0,y,0,'water');w.setBlock(0,6,0,'sand');
  const changed=w.fluids.changed.bind(w.fluids);let replaced=false;w.fluids.changed=(x,y,z)=>{if(x===0&&y===1&&z===0&&w.blockIdAt(x,y,z)==='sand')replaced=true;changed(x,y,z);};
  ticks(w,80);assert.equal(w.blockIdAt(0,1,0),'sand');assert.equal(w.falling.entities.length,0);assert.equal(replaced,true);assert.equal(w.pendingDrops.length,0);
  for(const obstacle of ['oak.slab','oak.fence','oak.stairs','oak.door']) {
    const p=new VoxelWorld({depth:0});p.setBlock(0,0,0,'stone');
    if(obstacle.endsWith('door'))placeBlock(p,obstacle,{x:0,y:0,z:0,normal:{x:0,y:1,z:0}},0);else p.setBlock(0,1,0,obstacle);
    p.setBlock(0,5,0,'gravel');ticks(p,80);assert.equal(p.blockIdAt(0,1,0),obstacle);
    const settled=[...p.edits()].filter(e=>e.id==='gravel');
    assert.equal(settled.length+p.pendingDrops.filter(d=>d.stack.id==='gravel').reduce((n,d)=>n+d.stack.count,0),1,obstacle);
    assert.equal(p.falling.entities.length,0);
  }
  const p=new VoxelWorld({depth:0});p.setBlock(0,0,0,'stone');p.getPlayers=()=>[{x:.5,y:1,z:.5,size:2}];p.setBlock(0,5,0,'sand');ticks(p,80);assert.equal(p.blockIdAt(0,1,0),null);assert.equal(p.pendingDrops.length,1);
});

test('active falls survive helper save/load and inventory ticks, and use shared interpolated full-block visuals',()=>{
  const w=new VoxelWorld({depth:0});w.setBlock(0,0,0,'stone');w.setBlock(0,8,0,'sand');ticks(w,4);
  const saved=JSON.parse(JSON.stringify(w.save())), restored=new VoxelWorld();restored.load(saved);assert.deepEqual(restored.falling.save(),w.falling.save());
  const scene=new THREE.Scene(), renderer=new FallingBlockRenderer(scene);renderer.update(w.falling,.5,null);const mesh=scene.children[0], e=w.falling.entities[0];
  assert.equal(mesh.geometry.parameters.width,1);assert.equal(mesh.position.y,(e.previous.y+e.y)/2+.5);
  const c=new MovementController(w);c.teleport({x:10,y:1,z:10});const y=e.y;c.update(.2,{gameplayEnabled:false});assert.ok(e.y<y);
  ticks(w,80);ticks(restored,84);assert.equal(w.blockIdAt(0,1,0),'sand');assert.equal(restored.blockIdAt(0,1,0),'sand');assert.equal(restored.falling.entities.length,0);
  renderer.update(w.falling,0,null);assert.equal(scene.children.length,0);
});
