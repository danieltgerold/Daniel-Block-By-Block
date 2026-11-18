import { performance } from 'node:perf_hooks';
import { createHash } from 'node:crypto';
import * as THREE from 'three';
import { VoxelWorld } from '../src/voxel-world.js';
import { buildChunkMesh } from '../src/voxel-mesh.js';
import { buildWaterMesh } from '../src/fluid-mesh.js';
import { ChunkRenderer } from '../src/chunk-renderer.js';
const measure = (fn, n = 12) => {
  for (let i = 0; i < 3; i++) fn();
  const samples = []; for (let i = 0; i < n; i++) { const t = performance.now(); fn(); samples.push(performance.now() - t); }
  samples.sort((a,b) => a-b); return Number(samples[Math.floor(n/2)].toFixed(3));
};
const w = new VoxelWorld(); w.setBlock(2, 0, 2, 'oak.slab');
const dry = { meshMs: measure(() => buildChunkMesh(w, 0, 0)), moveMs: measure(() => w.movePlayer({x:.5,y:0,z:.5}, {x:.2,y:-.08,z:.1})), rayMs: measure(() => w.raycast({x:.5,y:2,z:.5}, {x:0,y:-1,z:0})) };
for(let x=128;x<192;x++) for(let z=128;z<192;z++) w.setBlock(x,0,z,'water');
let scans=0, lookups=0; const edits=w.edits.bind(w), at=w.blockAt.bind(w);
w.edits=function*(){for(const edit of edits()){ scans++; yield edit; }};
w.blockAt=(...args)=>{lookups++;return at(...args)};
const wet={ meshMs:measure(()=>buildChunkMesh(w,0,0)), moveMs:measure(()=>w.movePlayer({x:.5,y:0,z:.5},{x:.2,y:-.08,z:.1})),rayMs:measure(()=>w.raycast({x:.5,y:2,z:.5},{x:0,y:-1,z:0})) };
scans=0; buildChunkMesh(w,0,0); const meshGlobalVisits=scans; scans=0;w.movePlayer({x:.5,y:0,z:.5},{x:.2,y:-.08,z:.1});const moveGlobalVisits=scans;
lookups=0;buildWaterMesh(w,8,8);const waterMeshLookups=lookups;
const waterMeshMs=measure(()=>buildWaterMesh(w,8,8));
const renderer=new ChunkRenderer(w,new THREE.Scene(),new THREE.MeshBasicMaterial());
for(const base of [0,8])for(let x=base-1;x<=base+1;x++)for(let z=base-1;z<=base+1;z++)renderer.rebuild(x,z,1);
const capture=()=>new Map([...renderer.chunks].map(([k,c])=>[k,[c.mesh.geometry,c.waterMesh?.geometry]]));
const changes=before=>{let terrain=0,water=0;for(const [k,c] of renderer.chunks){if(c.mesh.geometry!==before.get(k)[0])terrain++;if(c.waterMesh?.geometry!==before.get(k)[1])water++;}return{terrain,water}};
const waterBefore=capture(); w.setBlock(136,0,136,'water',{level:1});const tw=performance.now();
for(const [k,c] of renderer.chunks)if(c.dirty){const [x,z]=k.split(',').map(Number);renderer.rebuild(x,z,c.level,c);}
const waterChange={...changes(waterBefore),ms:Number((performance.now()-tw).toFixed(3))};
const waterTimes=[];
for(let i=0;i<15;i++){w.setBlock(136,0,136,'water',{level:i%2+1});const t=performance.now();for(const[k,c]of renderer.chunks)if(c.dirty){const[x,z]=k.split(',').map(Number);renderer.rebuild(x,z,c.level,c);}if(i>=3)waterTimes.push(performance.now()-t);}
waterTimes.sort((a,b)=>a-b);waterChange.ms=Number(waterTimes[6].toFixed(3));
w.setBlock(3,0,3,'stone');const breakBefore=capture(),tb=performance.now();w.destroyBlock(3,0,3,{gameMode:'creative'});renderer.invalidateBlock(3,3,true);
const dryBreak={...changes(breakBefore),ms:Number((performance.now()-tb).toFixed(3))};renderer.dispose();
const breaks=new ChunkRenderer(w,new THREE.Scene(),new THREE.MeshBasicMaterial());for(let x=-1;x<=1;x++)for(let z=-1;z<=1;z++)breaks.rebuild(x,z,1);
const breakTimes=[];for(let i=0;i<15;i++){w.setBlock(3,0,3,'stone');const t=performance.now();w.destroyBlock(3,0,3,{gameMode:'creative'});breaks.invalidateBlock(3,3,true);if(i>=3)breakTimes.push(performance.now()-t);}breakTimes.sort((a,b)=>a-b);dryBreak.ms=Number(breakTimes[6].toFixed(3));breaks.dispose();
const flow=new VoxelWorld();flow.setBlock(0,0,0,'water');const trace=[];const tf=performance.now();for(let i=0;i<60;i++){flow.step(.05);trace.push(JSON.stringify({edits:[...flow.edits()],pending:[...flow.fluids.pending]}));}
const flowMs=Number((performance.now()-tf).toFixed(3));
const hash=createHash('sha256').update(JSON.stringify({edits:[...flow.edits()],pending:[...flow.fluids.pending]})).digest('hex').slice(0,16);
const traceHash=createHash('sha256').update(trace.join('\n')).digest('hex').slice(0,16);
console.log(JSON.stringify({waterCells:4096,dry,wet,meshGlobalVisits,moveGlobalVisits,waterMeshLookups,waterMeshMs,waterChange,dryBreak,flowMs,flowHash:hash,traceHash},null,2));
