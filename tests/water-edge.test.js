import test from 'node:test';
import assert from 'node:assert/strict';
import { VoxelWorld } from '../src/voxel-world.js';
import { MovementController } from '../src/movement.js';
import { DEFAULT_JUMP_HEIGHT } from '../src/player-settings.js';
import { canEscapeWater } from '../src/water-edge.js';
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-7,`${a} != ${b}`);
function pool({level=0,tall=false,ceiling=false,bank='stone',size=1,jump=DEFAULT_JUMP_HEIGHT,edge=false}={}) {
  const w=new VoxelWorld({depth:0});
  for(let x=-4;x<=4;x++)for(let z=-4;z<=4;z++) {
    w.setBlock(x,3,z,'stone');
    if(Math.abs(x)<=2&&Math.abs(z)<=2)w.setBlock(x,4,z,'water',{level:x===2?level:0});
    else {w.setBlock(x,4,z,bank,bank.endsWith('stairs')?{facing:'east'}:{});if(tall)for(let y=5;y<=7;y++)w.setBlock(x,y,z,'stone');}
    if(ceiling)w.setBlock(x,6,z,'stone');
  }
  const c=new MovementController(w);c.teleport({x:.5,y:4.2,z:.5});assert.equal(c.configureSettings({size,jump}).ok,true);
  c.teleport({x:edge?3-.35*size:.5,y:edge&&!ceiling?4.65:4.2,z:.5});return c;
}
function swimOut(c,input={forward:1,jump:true,yaw:-Math.PI/2},top=5,fps=20) {
  let boosts=0,maxRise=0;
  for(let i=0;i<fps*8;i++) {
    const y=c.player.y;c.update(1/fps,input);maxRise=Math.max(maxRise,c.player.y-y);
    if(Math.abs(c.player.vy-.3*c.size*c.jumpLaunchVelocity/.42)<1e-7)boosts++;
    assert.equal(c.world.intersectsPlayer(c.player),false,'escape clipped a solid shape');
    if(c.player.grounded&&Math.abs(c.player.y-top)<1e-6)return {ticks:c.totalSteps,boosts,maxRise};
  }
  assert.fail(`stuck at ${JSON.stringify({x:c.player.x,y:c.player.y,z:c.player.z,vy:c.player.vy})}`);
}

test('source at Y=4 escapes onto a Y=5 full-block bank from four directions and a diagonal without snapping',()=>{
  for(const [x,z] of [[1,0],[-1,0],[0,1],[0,-1]]) {
    const c=pool(),result=swimOut(c,{forward:1,jump:true,yaw:Math.atan2(-x,-z)});
    assert.ok(result.boosts>0);assert.ok(result.maxRise<=.340001);near(c.vitals.health,20);
  }
  const diagonal=pool();assert.ok(swimOut(diagonal,{forward:1,right:1,jump:true,yaw:0}).boosts>0);
});

test('flowing edges and carried/current motion can trigger escape without a fresh jump press; size and jump scale consistently',()=>{
  const flowing=pool({level:1,edge:true});assert.equal(flowing.world.blockStateAt(2,4,0).level,1);assert.ok(swimOut(flowing).boosts>0);
  const pushed=pool({level:1,edge:true});pushed.player.vx=.1;assert.ok(swimOut(pushed,{yaw:-Math.PI/2}).boosts>0);
  for(const [size,jump] of [[.5,DEFAULT_JUMP_HEIGHT],[2,DEFAULT_JUMP_HEIGHT],[2,2]]) {
    const c=pool({size,jump,edge:true});swimOut(c);near(c.player.y,5);near(c.vitals.health,20);
  }
  const disabled=pool({jump:0,edge:true});disabled.player.vx=.1;disabled.update(.05,{forward:1,yaw:-Math.PI/2});assert.ok(disabled.player.vy<=0);
});

test('low ceilings, tall walls, submerged clearance and an out-of-reach high lip reject edge boosts',()=>{
  for(const options of [{ceiling:true},{tall:true}]) {
    const c=pool({...options,edge:true});
    for(let i=0;i<70;i++){c.update(.05,{forward:1,jump:true,yaw:-Math.PI/2});assert.equal(c.world.intersectsPlayer(c.player),false);assert.ok(c.player.vy<.3-1e-6);}
    assert.ok(c.player.x<=2.700001);assert.ok(c.player.y<5);
  }
  const submerged=pool({edge:true});for(let y=5;y<=8;y++)submerged.world.setBlock(2,y,0,'water');
  assert.equal(canEscapeWater(submerged.world,submerged.player,submerged.player.y,{x:.08,z:0},.3,1.8),false);
  const shallow=pool({level:7,edge:true});shallow.player.y=4;shallow.previous.y=4;
  // Thin flow is well below this block top, so it cannot manufacture a climb.
  assert.equal(canEscapeWater(shallow.world,shallow.player,4,{x:.08,z:0},.3,1.8),false);
});

test('slab and stair banks use their actual collision shapes and leave no solid intersections',()=>{
  const slab=pool({bank:'oak.slab',edge:true});swimOut(slab,undefined,4.5);near(slab.player.y,4.5);
  const stairs=pool({bank:'oak.stairs',edge:true});swimOut(stairs);near(stairs.player.y,5);
});

test('ordinary underwater acceleration/drag stays unchanged, Creative flight bypasses escape, and rendering frame rates agree',()=>{
  const w=new VoxelWorld({depth:0});
  for(let x=-2;x<=2;x++)for(let z=-2;z<=2;z++)for(let y=0;y<=6;y++)w.setBlock(x,y,z,'water');
  const c=new MovementController(w);c.teleport({x:.5,y:2,z:.5});let vx=0,vy=0,x=.5,y=2;
  for(let i=0;i<8;i++){vx+=.0196;vy+=.04;x+=vx;y+=vy;vx*=.8;vy=vy*.8-.02;c.update(.05,{right:1,jump:true});near(c.player.x,x);near(c.player.y,y);near(c.player.vx,vx);near(c.player.vy,vy);}
  const flying=pool({edge:true});flying.setGameMode('creative');flying.player.flying=true;flying.update(.05,{forward:1,yaw:-Math.PI/2});near(flying.player.vy,0);
  const results=[30,144].map(fps=>{const swimmer=pool();const result=swimOut(swimmer,undefined,5,fps);return {ticks:result.ticks,x:swimmer.player.x,y:swimmer.player.y};});
  assert.deepEqual(results[0],results[1]);
});
