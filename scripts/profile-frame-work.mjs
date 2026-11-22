// CPU scene preparation only: no browser, desktop control or GPU/FPS claims.
import { performance } from 'node:perf_hooks';
import * as THREE from 'three';
import { VoxelWorld } from '../src/voxel-world.js';
import { ChunkRenderer } from '../src/chunk-renderer.js';
import { getBlockMaterials } from '../src/block-assets.js';
const world = new VoxelWorld(), scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(75,16/9,.05,500);
camera.position.set(.5,5.62,2.5); camera.rotation.order='YXZ'; camera.rotation.x=-.12;
const chunks = new ChunkRenderer(world,scene,getBlockMaterials('dirt'));
for(let i=0;i<100;i++)chunks.update(camera);
let boundsQueries=0, builds=0;
const bounds=world.chunkBounds.bind(world), rebuild=chunks.rebuildTerrain.bind(chunks);
world.chunkBounds=(...args)=>{boundsQueries++;return bounds(...args);};
chunks.rebuildTerrain=(...args)=>{builds++;return rebuild(...args);};
function sample(turning) {
  for(let i=0;i<50;i++){if(turning)camera.rotation.y+=.0001;chunks.update(camera);}
  boundsQueries=0; builds=0;
  const samples=[];
  for(let n=0;n<7;n++) {const start=performance.now();for(let i=0;i<200;i++){if(turning)camera.rotation.y+=.0001;chunks.update(camera);}samples.push((performance.now()-start)/200);}
  samples.sort((a,b)=>a-b);
  return {medianCpuMsPerFrame:Number(samples[3].toFixed(5)),boundsQueriesPerFrame:boundsQueries/1400,terrainBuilds:builds};
}
console.log(JSON.stringify({scope:'Node CPU chunk visibility/scene preparation; excludes browser/GPU/presentation',stationary:sample(false),turning:sample(true)},null,2));
chunks.dispose();
