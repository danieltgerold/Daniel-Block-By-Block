import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Window } from 'happy-dom';
import { PlayerVitals } from '../src/player-vitals.js';
import { MovementController } from '../src/movement.js';
import { VoxelWorld } from '../src/voxel-world.js';
import { BlockPlacement, breakTargetBlock } from '../src/block-placement.js';
import { ITEMS } from '../src/inventory.js';
import { FurnaceEntity, SMELTING } from '../src/smelting.js';
import { CreativeInventory } from '../src/creative-inventory.js';
import { commandCompletions } from '../src/chat-commands.js';
import { GameplayHUD, gameSimulationRunning } from '../src/gameplay-hud.js';
import { ChatUI } from '../src/chat-ui.js';
import { createEmptyHand, updateEmptyHand } from '../src/player-visuals.js';
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-8,`${a} != ${b}`);
const stack=(id,count=1)=>({id,count});
const ticks=(c,n,input={})=>{for(let i=0;i<n;i++)c.update(.05,input);};
const body={y:0,grounded:true,sprinting:false,inWater:false,landingDamageDistance:0};

test('exhaustion preserves remainder, uses saturation first, never starves, and handles developer distances in constant time',()=>{
  const v=new PlayerVitals();v.exhaust(4);v.tick({player:body});near(v.saturation,5);near(v.exhaustion,4);
  v.exhaust(.1);v.tick({player:body});near(v.saturation,4);near(v.exhaustion,.1);near(v.hunger,20);
  v.saturation=.5;v.exhaust(8);v.tick({player:body});near(v.saturation,0);near(v.hunger,19);near(v.exhaustion,.1);
  v.hunger=0;for(let i=0;i<200;i++)v.tick({player:body});near(v.health,20);
  v.exhaust(1e100);v.processExhaustion();near(v.hunger,0);assert.ok(v.exhaustion<=4);
});

test('fast and slow regeneration use the correct timers, fractional healing and normal exhaustion; Creative preserves values',()=>{
  const v=new PlayerVitals({health:10});for(let i=0;i<9;i++)v.tick({player:body});near(v.health,10);
  v.tick({player:body});near(v.health,10+5/6);near(v.saturation,4);near(v.exhaustion,1);
  v.health=10;v.hunger=19;v.saturation=0;for(let i=0;i<79;i++)v.tick({player:body});near(v.health,10);
  v.tick({player:body});near(v.health,11);near(v.hunger,18);near(v.exhaustion,3);
  v.hunger=17;for(let i=0;i<100;i++)v.tick({player:body});near(v.health,11);assert.equal(v.regenTicks,0);
  const capped=new PlayerVitals({health:19.9,saturation:.6});for(let i=0;i<10;i++)capped.tick({player:body});near(capped.health,20);near(capped.saturation,.6);near(capped.exhaustion,.6);
  const before=v.toJSON();for(let i=0;i<100;i++)v.tick({player:{...body,sprinting:true},creative:true,distance:10,jumped:true});assert.deepEqual(v.toJSON(),before);
});

test('actual ground travel, swimming and jumps charge once; hunger gates sprint, walking and blocked movement do not charge',()=>{
  const w=new VoxelWorld({depth:3}), c=new MovementController(w);c.teleport({x:.5,y:0,z:2.5});
  ticks(c,10,{forward:1});near(c.vitals.exhaustion,0);
  const start={x:c.player.x,z:c.player.z};ticks(c,10,{forward:1,sprint:true});
  near(c.vitals.exhaustion,Math.hypot(c.player.x-start.x,c.player.z-start.z)*.1);
  c.teleport({x:.5,y:0,z:2.5});c.vitals.exhaustion=0;ticks(c,1,{jump:true});near(c.vitals.exhaustion,.05);ticks(c,3,{jump:true});near(c.vitals.exhaustion,.05);
  c.teleport({x:.5,y:0,z:2.5});c.vitals.exhaustion=0;ticks(c,1,{forward:1,sprint:true,jump:true});near(c.vitals.exhaustion,.2);
  c.teleport({x:.5,y:0,z:2.5});c.vitals.hunger=6;ticks(c,2,{forward:1,sprint:true});assert.equal(c.player.sprinting,false);
  c.vitals.hunger=7;ticks(c,1,{forward:1,sprint:true});assert.equal(c.player.sprinting,true);
  c.teleport({x:.5,y:0,z:1.3});w.setBlock(0,0,0,'stone');w.setBlock(0,1,0,'stone');c.vitals.exhaustion=0;ticks(c,10,{forward:1,sprint:true});near(c.vitals.exhaustion,0);
  const water=new PlayerVitals();water.tick({player:{...body,inWater:true,sprinting:true},distance:4,swimDistance:5});near(water.exhaustion,.05);
  c.teleport({x:.5,y:0,z:2.5});c.vitals.exhaustion=0;assert.equal(breakTargetBlock({controller:c,world:w,yaw:0,pitch:0}),true);near(c.vitals.exhaustion,.005);
  c.setGameMode('creative');c.vitals.hunger=0;const old=c.vitals.toJSON();ticks(c,20,{forward:1,sprint:true});assert.equal(c.player.sprinting,true);assert.deepEqual(c.vitals.toJSON(),old);
});

function eatingFixture(id='raw.porkchop') {
  const w=new VoxelWorld({depth:3}),c=new MovementController(w);c.teleport({x:.5,y:0,z:2.5});c.vitals.hunger=10;c.vitals.saturation=1;c.inventory.slots[0]=stack(id,2);
  const placement=new BlockPlacement({controller:c,world:w,getAim:()=>({yaw:0,pitch:0}),canInteract:()=>true});
  c.onTick=()=>placement.tick();return {w,c,placement};
}
test('eating uses exactly 32 game ticks, consumes once, caps saturation, cancels safely and preserves block interactions',()=>{
  for(const fps of [30,144]) {
    const {c,placement}=eatingFixture();placement.press();
    for(let frame=0;frame<Math.ceil(1.55*fps);frame++)c.update(1/fps);assert.equal(c.inventory.mainHand.count,2);
    while(c.totalSteps<32)c.update(1/fps);assert.equal(c.inventory.mainHand.count,1);near(c.vitals.hunger,13);near(c.vitals.saturation,2.8);assert.equal(c.eating.active,null);
  }
  for(const cancel of [f=>f.placement.release(),f=>f.c.inventory.select(1),f=>f.c.pause({preserveMomentum:true})]) {
    const f=eatingFixture();f.placement.press();ticks(f.c,31);cancel(f);ticks(f.c,1);assert.equal(f.c.inventory.slots[0].count,2);near(f.c.vitals.hunger,10);assert.equal(f.c.eating.active,null);
  }
  const f=eatingFixture('cooked.porkchop');f.c.vitals.hunger=18;f.c.vitals.saturation=19;f.placement.press();ticks(f.c,32);near(f.c.vitals.hunger,20);near(f.c.vitals.saturation,20);
  ticks(f.c,40);assert.equal(f.c.inventory.mainHand.count,1);assert.equal(f.c.eating.active,null);
  const menu=eatingFixture();menu.w.setBlock(0,1,0,'crafting.table');let opened=0;menu.placement.onUse=()=>{opened++;return true;};menu.placement.press();ticks(menu.c,1);assert.equal(opened,1);assert.equal(menu.c.eating.active,null);assert.equal(menu.c.inventory.mainHand.count,2);
  for(const id of ['raw.porkchop','cooked.porkchop']) {assert.equal(ITEMS.get(id).maxStack,64);assert.ok(ITEMS.get(id).icon);assert.ok(commandCompletions('/give '+id.slice(0,3)).includes('/give '+id+' '));assert.ok(new CreativeInventory(f.c.inventory,()=>true).items().some(i=>i.id===id));}
});

test('raw pork cooks after 200 ticks with existing fuel and is available in the furnace recipe book',()=>{
  const f=new FurnaceEntity({slots:[stack('raw.porkchop'),stack('oak.planks'),null]});
  assert.equal(SMELTING.get('raw.porkchop').ticks,200);for(let i=0;i<199;i++)f.tick();assert.equal(f.slots[2],null);
  f.tick();assert.deepEqual(f.slots[2],stack('cooked.porkchop'));assert.equal(f.slots[0],null);assert.equal(f.slots[1],null);assert.equal(f.burnTime,101);
});

function fall(height,{size=1,obstacle=null,mode='survival'}={}) {
  const w=new VoxelWorld({depth:0});w.setBlock(0,-1,0,'stone');if(obstacle)w.setBlock(0,0,0,obstacle);
  const c=new MovementController(w);c.configure('size',size);c.setGameMode(mode);c.teleport({x:.25,y:height,z:.25});
  for(let i=0;i<150&&!c.player.grounded&&!c.vitals.dead;i++)c.update(.05);return c;
}
test('fall damage uses the complete descent to full/partial landing surfaces, scales its safe distance, and ignores water and Creative',()=>{
  near(fall(3).vitals.health,20);near(fall(4).vitals.health,19);near(fall(4,{size:2}).vitals.health,20);
  const slab=fall(4.5,{obstacle:'oak.slab'});near(slab.player.y,.5);near(slab.vitals.health,19);
  const stairs=fall(5,{obstacle:'oak.stairs'});near(stairs.player.y,1);near(stairs.vitals.health,19);
  near(fall(12,{mode:'creative'}).vitals.health,20);
  for(const size of [1,2])for(const state of [{level:0,falling:false},{level:7,falling:false},{level:0,falling:true}]) {
    const w=new VoxelWorld({depth:0});w.setBlock(0,-1,0,'stone');w.setBlock(0,0,0,'water',state);
    const c=new MovementController(w);c.configure('size',size);c.teleport({x:.5,y:12,z:.5});c.player.vy=-20;c.player.damageFallDistance=6;c.update(.05);
    near(c.player.y,0);near(c.vitals.health,20);near(c.player.damageFallDistance,0);near(c.player.landingDamageDistance,0);
  }
  const w=new VoxelWorld({depth:0});w.setBlock(0,-1,0,'stone');w.setBlock(2,0,0,'water');const c=new MovementController(w);c.teleport({x:.5,y:4,z:.5});c.player.vy=-10;c.update(.05);near(c.vitals.health,19);
});

test('void hurts both modes every ten ticks; death drops owned inventory once and respawn restores starting vitals safely',()=>{
  for(const mode of ['survival','creative']) {
    const w=new VoxelWorld(),c=new MovementController(w);c.setGameMode(mode);c.teleport({x:.5,y:-65,z:.5});
    c.inventory.slots[0]=stack('stone',3);c.inventory.slots[40]=stack('raw.porkchop',2);c.inventory.slots[41]=stack('oak.planks',4);c.inventory.cursor=stack('stick',5);
    let deaths=0;c.onDeath=()=>deaths++;ticks(c,9);near(c.vitals.health,20);ticks(c,1);near(c.vitals.health,16);ticks(c,40);
    for(let i=0;i<50&&!c.vitals.dead;i++)c.update(.05); // Survival can briefly regenerate between void hits.
    near(c.vitals.health,0);assert.equal(deaths,1);assert.equal(c.drops.total(),14n);assert.equal(c.inventory.cursor,null);assert.ok(c.inventory.slots.slice(0,50).every(s=>!s));
    c.die();ticks(c,40);assert.equal(deaths,1);assert.equal(c.drops.total(),14n);
    c.respawn();near(c.player.y,4);assert.deepEqual(c.vitals.toJSON(),{health:20,hunger:20,saturation:5,exhaustion:0});assert.equal(c.player.damageFallDistance,0);
  }
});

test('vitals survive teleport and helper world snapshots; old player data gets starting values and inventory ticks still regenerate',()=>{
  const w=new VoxelWorld(),c=new MovementController(w);c.vitals.restore({health:8.25,hunger:19,saturation:2.4,exhaustion:3.3});
  c.teleport({x:5,y:8,z:5});near(c.vitals.health,8.25);near(c.vitals.hunger,19);assert.equal(c.player.damageFallDistance,0);
  const saved=JSON.parse(JSON.stringify(w.save())),r=new VoxelWorld(),rc=new MovementController(r);r.load(saved);assert.deepEqual(rc.vitals.toJSON(),c.vitals.toJSON());near(rc.player.y,8);
  rc.loadPlayer({x:0,y:4,z:0});assert.deepEqual(rc.vitals.toJSON(),{health:20,hunger:20,saturation:5,exhaustion:0});
  rc.vitals.health=10;ticks(rc,10,{gameplayEnabled:false});assert.ok(rc.vitals.health>10);assert.equal(gameSimulationRunning('inventory'),true);assert.equal(gameSimulationRunning('death'),false);assert.equal(gameSimulationRunning('menu'),false);
});

test('HUD full/half/empty icons, developer saturation, food motion and death/menu routing work without opening a browser',t=>{
  const window=new Window({settings:{disableJavaScriptEvaluation:true,disableJavaScriptFileLoading:true,disableCSSFileLoading:true}}),document=window.document;
  document.write(readFileSync(new URL('../index.html',import.meta.url),'utf8'));const c=new MovementController(new VoxelWorld()),hud=new GameplayHUD(document),ui=new ChatUI({document,window,controller:c,clearInput:options=>c.pause(options),requestCapture:()=>{},requestUnlock:()=>{}});
  t.after(()=>{ui.dispose();hud.dispose();window.happyDOM.abort();window.close();});
  c.vitals.health=3;hud.updateVitals(c,'playing');const icons=hud.vitalRows.get('health').icons;assert.deepEqual(icons.slice(0,3).map(i=>i.dataset.fill),['2','1','0']);assert.equal(hud.saturation.hidden,true);
  c.enableDeveloperMode();hud.updateVitals(c,'playing');assert.equal(hud.saturation.hidden,false);assert.match(hud.saturation.textContent,/Saturation: 5.0/);
  c.setGameMode('creative');hud.updateVitals(c,'playing');assert.equal(hud.survival.hidden,true);
  const hand=createEmptyHand();c.inventory.slots[0]=stack('raw.porkchop');updateEmptyHand(hand,{swingActive:false,equipHeight:1},c.inventory);const rest=hand.mainItem.matrix.clone();updateEmptyHand(hand,{swingActive:false,equipHeight:1,eating:true,eatAge:10},c.inventory);assert.equal(hand.mainItem.matrix.equals(rest),false);updateEmptyHand(hand,{swingActive:false,equipHeight:1,eating:false},c.inventory);assert.equal(hand.mainItem.matrix.equals(rest),true);
  c.onDeath=()=>ui.showDeath();c.vitals.health=0;c.die();assert.equal(ui.mode,'death');ui.pause();assert.equal(ui.mode,'death');ui.openInventory();assert.equal(ui.mode,'death');ui.respawn();assert.equal(ui.mode,'ready');assert.equal(c.vitals.health,20);
});
