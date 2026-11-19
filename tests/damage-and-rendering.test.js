import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Window } from 'happy-dom';
import * as THREE from 'three';
import { MovementController } from '../src/movement.js';
import { VoxelWorld } from '../src/voxel-world.js';
import { PlayerReactions, applyCameraReaction } from '../src/player-reactions.js';
import { createPlayerModel, animatePlayerModel, syncEquipment, updatePlayerCamera } from '../src/player-visuals.js';
import { DEFAULT_SETTINGS, fallDamage } from '../src/player-settings.js';
import { ChatService, LocalPlayerProfile } from '../src/chat.js';
import { RenderPreferences, renderPixelRatio } from '../src/render-preferences.js';
import { GameplayHUD } from '../src/gameplay-hud.js';
import { ChatUI } from '../src/chat-ui.js';
import { ChunkRenderer } from '../src/chunk-renderer.js';
import { getBlockMaterials } from '../src/block-assets.js';
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-7,`${a} != ${b}`);
const tick=(c,n=1,input={})=>{for(let i=0;i<n;i++)c.update(.05,input);};
function floor() {return new MovementController(new VoxelWorld({depth:3}));}
function land(c) {for(let i=0;i<1000&&!c.player.grounded&&!c.vitals.dead;i++)tick(c);assert.equal(c.player.grounded,true);}

test('damage events trigger one interpolated ten-tick roll; undamaging/Creative landings do not; aim, camera collision and hand alignment stay independent',()=>{
  const c=floor();c.teleport({x:.5,y:4,z:.5});land(c);assert.equal(c.reactions.hurtSerial,1);near(c.vitals.health,19);
  tick(c,2);const pose=c.reactions.pose(.5);assert.ok(Math.abs(pose.hurtRoll)>.02&&Math.abs(pose.hurtRoll)<.18);
  const ray=c.interactionRay(c.player,.4,-.3),handCamera=new THREE.PerspectiveCamera();
  for(const mode of [0,1,2]) {
    const camera=new THREE.PerspectiveCamera();updatePlayerCamera(camera,mode,c.renderState(),.4,-.3,c.world);
    const at=camera.position.clone(),rotation=camera.quaternion.clone();applyCameraReaction(camera,handCamera,pose,mode);
    assert.ok(camera.position.equals(at));assert.equal(camera.quaternion.equals(rotation),false);near(handCamera.rotation.z,pose.hurtRoll);
    assert.deepEqual(c.interactionRay(c.player,.4,-.3),ray);
    updatePlayerCamera(camera,mode,c.renderState(),.4,-.3,c.world);applyCameraReaction(camera,handCamera,pose,mode,0);assert.ok(camera.quaternion.angleTo(rotation)<1e-7);
  }
  tick(c,10);near(c.reactions.pose(.9).hurtRoll,0);assert.equal(c.reactions.hurtSerial,1);
  c.teleport({x:.5,y:3,z:.5});land(c);near(c.reactions.pose().hurtRoll,0);assert.equal(c.reactions.hurtSerial,0);
  c.setGameMode('creative');c.teleport({x:.5,y:10,z:.5});land(c);assert.equal(c.reactions.hurtSerial,0);
  c.teleport({x:.5,y:-65,z:.5});tick(c,10);assert.equal(c.reactions.hurtSerial,1);tick(c,10);assert.equal(c.reactions.hurtSerial,2);
  c.reactions.clearHurt();near(c.reactions.pose().hurtRoll,0);c.teleport({x:.5,y:0,z:.5});near(c.reactions.pose().hurtRoll,0);
});

test('normal enlarged and high jumps are safe, scaled extra falls damage once and multiplier rounds last without affecting void or water',()=>{
  for(const [size,jump] of [[1,DEFAULT_SETTINGS.jump],[4,DEFAULT_SETTINGS.jump],[1,8],[4,8]]) {
    const c=floor();assert.equal(c.configureSettings({size,jump}).ok,true);c.teleport({x:.5,y:0,z:.5});tick(c,1,{jump:true});land(c);near(c.vitals.health,20);assert.equal(c.reactions.hurtSerial,0);
  }
  for(const size of [.5,1,4]) {const c=floor();c.configure('size',size);c.teleport({x:.5,y:4*size,z:.5});land(c);near(c.vitals.health,19);}
  // Directly measure the same controller's jump from a four-block platform,
  // then remove that platform so it lands four blocks below takeoff.
  const w=new VoxelWorld({depth:3}),c=new MovementController(w);w.setBlock(0,3,0,'stone');c.configure('jump',8);c.teleport({x:.5,y:4,z:.5});tick(c,1,{jump:true});w.setBlock(0,3,0,false);land(c);near(c.player.y,0);near(c.vitals.health,16);
  for(const [distance,settings,expected] of [[3,{},0],[4,{},1],[16,{size:4},1],[6,{falldamage:.5},2],[4,{falldamage:2},2],[100,{falldamage:0},0],[12,{jump:10},2]])near(fallDamage(distance,settings),expected);
  for(const state of [{level:0,falling:false},{level:7,falling:false},{level:0,falling:true}]) {
    const water=new VoxelWorld({depth:0});water.setBlock(0,-1,0,'stone');water.setBlock(0,0,0,'water',state);const wet=new MovementController(water);wet.configureSettings({size:4,falldamage:255});wet.teleport({x:.5,y:30,z:.5});wet.player.vy=-40;tick(wet);near(wet.vitals.health,20);assert.equal(wet.reactions.hurtSerial,0);
  }
  const voidPlayer=floor();voidPlayer.configure('falldamage',0);voidPlayer.teleport({x:0,y:-65,z:0});tick(voidPlayer,10);near(voidPlayer.vitals.health,16);
});

test('/falldamage supports range errors, help, default/autocomplete, developer values, /default and compatible saved settings',()=>{
  const c=floor(),chat=new ChatService({profile:new LocalPlayerProfile(null,()=> 'test'),controller:c});
  assert.deepEqual(chat.completions('/fal'),['/falldamage ']);assert.deepEqual(chat.completions('/falldamage d'),['/falldamage default']);
  chat.submit('/help');assert.match(chat.messages.at(-1).text,/\/falldamage <value>/);
  for(const value of ['-1','256','Infinity','NaN','']){chat.submit('/falldamage '+value);near(c.settings.falldamage,1);assert.match(chat.messages.at(-1).text,/between 0 and 255/);}
  chat.submit('/falldamage .5');near(c.settings.falldamage,.5);c.configure('size',2);chat.submit('/falldamage 2');assert.doesNotMatch(chat.messages.at(-1).text,/Effective/);
  const saved=JSON.parse(JSON.stringify(c.world.save())),restored=floor();restored.world.load(saved);near(restored.settings.falldamage,2);near(restored.size,2);
  chat.submit('/falldamage default');near(c.settings.falldamage,1);chat.submit('/falldamage 0');chat.submit('/default');assert.deepEqual(c.settings,DEFAULT_SETTINGS);
  chat.submit('/devmode');chat.submit('/falldamage 300.5');near(c.settings.falldamage,300.5);chat.submit('/falldamage -1');near(c.settings.falldamage,300.5);
  const old=floor();old.loadPlayer({x:0,y:0,z:0});near(old.settings.falldamage,1);near(old.vitals.saturation,5);
});

test('death tips the size-scaled avatar over twenty visual ticks with held-item art, pauses world time, and respawn resets saturation/cache/HUD and all reactions',t=>{
  const window=new Window({settings:{disableJavaScriptEvaluation:true,disableJavaScriptFileLoading:true,disableCSSFileLoading:true}}),document=window.document;
  document.write(readFileSync(new URL('../index.html',import.meta.url),'utf8'));const c=floor(),hud=new GameplayHUD(document);
  const ui=new ChatUI({document,window,controller:c,clearInput:o=>c.pause(o),requestCapture:()=>{},requestUnlock:()=>{}});
  t.after(()=>{ui.dispose();hud.dispose();window.happyDOM.abort();window.close();});
  c.enableDeveloperMode();c.configure('size',2);c.inventory.slots[0]={id:'stone',count:3};c.inventory.slots[40]={id:'oak.planks',count:2};c.vitals.saturation=17;c.vitals.exhaustion=3.9;c.vitals.regenTicks=8;c.vitals.health=0;
  c.world.playerData={...c.savePlayer(),saturation:19};c.onDeath=()=>ui.showDeath();c.die();assert.equal(ui.mode,'death');assert.equal(c.drops.total(),5n);
  const worldTime=c.world.falling.time,dropTime=c.drops.time,model=createPlayerModel(),pose=c.renderState().animation;
  for(let i=0;i<20;i++)c.reactions.advanceDeath(.05);const reaction=c.reactions.pose();near(reaction.deathProgress,1);assert.ok(Math.abs(reaction.deathRoll)>.1);
  animatePlayerModel(model,c.renderState(),{...pose,deathProgress:reaction.deathProgress},1,c.deathEquipment);syncEquipment(model,c.deathEquipment);near(model.rotation.z,Math.PI/2);near(model.scale.x,2);assert.equal(model.userData.equipment.rightItem.visible,true);assert.equal(model.userData.equipment.leftItem.visible,true);
  model.updateMatrixWorld(true);const bodyBounds=new THREE.Box3();for(const part of Object.values(model.userData.parts))bodyBounds.union(new THREE.Box3().setFromObject(part));assert.ok(bodyBounds.min.y>=-1e-4);
  animatePlayerModel(model,c.renderState(),{...pose,deathProgress:1},0,c.deathEquipment);assert.equal(model.visible,false);
  c.reactions.advanceDeath(50);c.die();assert.equal(c.world.falling.time,worldTime);near(c.drops.time,dropTime);assert.equal(c.drops.total(),5n);
  ui.respawn();assert.deepEqual(c.vitals.toJSON(),{health:20,hunger:20,saturation:5,exhaustion:0});near(c.vitals.regenTicks,0);near(c.vitals.voidTicks,0);assert.equal(c.eating.active,null);assert.equal(c.deathEquipment,null);near(c.reactions.pose().deathProgress,0);near(c.world.playerData.saturation,5);
  hud.updateVitals(c,'playing');assert.match(hud.saturation.textContent,/5.0/);c.setGameMode('creative');c.setGameMode('survival');near(c.vitals.saturation,5);
  for(const fps of [30,144]) {const r=new PlayerReactions();r.die();for(let frame=0;frame<fps;frame++)r.advanceDeath(1/fps);near(r.pose().deathProgress,1);}
});

test('resolution and tilt preferences persist without changing HUD scale, and stationary chunk caching wakes on camera/FOV/terrain/water changes',t=>{
  const window=new Window({settings:{disableJavaScriptEvaluation:true,disableJavaScriptFileLoading:true,disableCSSFileLoading:true}}),document=window.document;document.write(readFileSync(new URL('../index.html',import.meta.url),'utf8'));
  let resized=0,p=new RenderPreferences(document,window.localStorage,()=>resized++);t.after(()=>{p.dispose();window.happyDOM.abort();window.close();});near(p.pixelRatio(2),1);near(renderPixelRatio(1.5,.75),.75);
  for(const [id,value] of [['render-scale','0.75'],['damage-tilt','0']]) {const field=document.getElementById(id);field.value=value;field.dispatchEvent(new window.Event('change'));}
  assert.equal(resized,1);near(p.damageTilt,0);p.dispose();p=new RenderPreferences(document,window.localStorage);near(p.pixelRatio(2),.75);near(p.damageTilt,0);assert.equal(document.querySelector('#crosshair svg').getAttribute('width'),'15');
  const w=new VoxelWorld(),scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera(75,16/9,.05,500);camera.position.set(.5,5.62,2.5);camera.lookAt(.5,4,-10);const chunks=new ChunkRenderer(w,scene,getBlockMaterials('dirt'),{viewDistance:32});t.after(()=>chunks.dispose());
  for(let i=0;i<20;i++)chunks.update(camera);let queries=0;const bounds=w.chunkBounds.bind(w);w.chunkBounds=(...args)=>{queries++;return bounds(...args);};chunks.update(camera);assert.equal(queries,0);
  camera.rotation.y+=.1;chunks.update(camera);assert.ok(queries>0);queries=0;camera.fov=90;camera.updateProjectionMatrix();chunks.update(camera);assert.ok(queries>0);
  w.setBlock(0,4,-1,'stone');queries=0;chunks.update(camera);assert.ok(queries>0);w.setBlock(0,5,-1,'water');queries=0;chunks.update(camera);assert.ok(queries>0);
  for(let i=0;i<20;i++)chunks.update(camera);queries=0;chunks.update(camera);assert.equal(queries,0);
});
