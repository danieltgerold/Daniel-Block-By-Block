import * as THREE from 'three';
import { CHUNK_SIZE, chunkKey } from './voxel-world.js';
import { buildChunkMesh, chooseLod } from './voxel-mesh.js';
import { getFaceMaterial } from './block-assets.js';
import { buildWaterMesh } from './fluid-mesh.js';
import { BLOCK_TYPES } from './block-types.js';
import { blockOpaque } from './block-shapes.js';

export class ChunkRenderer {
  constructor(world, scene, material, { viewDistance = 160, buildsPerFrame = 4, waterBuildsPerFrame = 2, waterMillisecondsPerFrame = 4 } = {}) {
    this.world = world;
    this.scene = scene;
    this.material = material;
    this.viewDistance = viewDistance;
    this.buildsPerFrame = buildsPerFrame;
    this.waterBuildsPerFrame = waterBuildsPerFrame; this.waterMillisecondsPerFrame = waterMillisecondsPerFrame; this.frame = 0;
    this.chunks = new Map();
    this.frustum = new THREE.Frustum();
    this.projectionView = new THREE.Matrix4();
    this.box = new THREE.Box3();
    this.stats = { visibleChunks: 0, visibleQuads: 0, loadedChunks: 0, lods: [0, 0, 0] };
    this.unsubscribe = world.subscribe(change => this.worldChanged(change));
  }

  affectedChunks(x, z, corners = false) {
    const cx = Math.floor(x / CHUNK_SIZE), cz = Math.floor(z / CHUNK_SIZE), dx = x - cx * CHUNK_SIZE, dz = z - cz * CHUNK_SIZE;
    const xs = [cx], zs = [cz]; if (dx === 0) xs.push(cx - 1); if (dx === 15) xs.push(cx + 1);
    if (dz === 0) zs.push(cz - 1); if (dz === 15) zs.push(cz + 1);
    return xs.flatMap(a => zs.filter(b => corners || a === cx || b === cz).map(b => [a, b]));
  }
  markWater(chunk) {
    if (!chunk) return;
    if (!chunk.waterDirty) chunk.waterSince = this.frame;
    chunk.waterDirty = true;
  }
  worldChanged({ x, y, z, id, previousId, state, previousState }) {
    const next = BLOCK_TYPES.get(id), previous = BLOCK_TYPES.get(previousId);
    const opaqueChanged = blockOpaque(next ? { definition: next, state: state ?? next.defaultState } : null)
      !== blockOpaque(previous ? { definition: previous, state: previousState ?? previous.defaultState } : null);
    const presenceChanged = Boolean(id) !== Boolean(previousId);
    if (next?.solid || previous?.solid) this.invalidateBlock(x, z, false, false,
      presenceChanged || opaqueChanged || Boolean(next?.solid) !== Boolean(previous?.solid) || id !== previousId && (next?.cullSameType || previous?.cullSameType));
    if (id !== 'water' && previousId !== 'water' && !presenceChanged && !opaqueChanged) return;
    const affected = new Set();
    if (id === 'water' || previousId === 'water') affected.add(chunkKey(Math.floor(x / 16), Math.floor(z / 16)));
    // A bank, floor/ceiling or water edit can affect a neighbor's face/corner.
    // Read the sparse water index, not block records or unrelated chunks.
    for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) {
      const key = chunkKey(Math.floor((x + dx) / 16), Math.floor((z + dz) / 16));
      if (!this.world.fluids.chunks.has(key)) continue;
      for (let dy = -1; dy <= 1; dy++) if (this.world.fluids.cells.has(`${x + dx},${y + dy},${z + dz}`)) { affected.add(key); break; }
    }
    for (const key of affected) this.markWater(this.chunks.get(key));
  }
  invalidateBlock(x, z, immediate = false, fluid = false, neighbors = true) {
    for (const [cx, cz] of neighbors ? this.affectedChunks(x, z, fluid) : [[Math.floor(x / 16), Math.floor(z / 16)]]) {
      const chunk = this.chunks.get(chunkKey(cx, cz));
      if (chunk) {
        if (fluid) this.markWater(chunk);
        else { chunk.terrainDirty = true; if (immediate) this.rebuildTerrain(cx, cz, chunk.level, chunk); }
      }
    }
  }
  createEntry(cx, cz, level) {
    const entry = { mesh: null, waterMesh: null, level, terrainQuads: 0, waterQuads: 0, terrainDirty: true,
      waterDirty: this.world.fluids.chunks.has(chunkKey(cx, cz)), waterSince: this.frame };
    Object.defineProperties(entry, { dirty: { get() { return this.terrainDirty || this.waterDirty; } }, quads: { get() { return this.terrainQuads + this.waterQuads; } } });
    return entry;
  }
  rebuildTerrain(cx, cz, level, entry) {
    const data = buildChunkMesh(this.world, cx, cz, level);
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(data.positions, 3));
    geometry.setAttribute('normal', new THREE.Float32BufferAttribute(data.normals, 3));
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute(data.uvs, 2));
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(data.colors, 3));
    geometry.setIndex(data.indices);
    const materials = data.groups.map((group, index) => {
      geometry.addGroup(group.start, group.count, index);
      return group.texture === 'dirt' ? this.material : getFaceMaterial(group.texture);
    });
    geometry.computeBoundingSphere();
    const mesh = new THREE.Mesh(geometry, materials.length === 1 ? materials[0] : materials);
    mesh.position.set(cx * CHUNK_SIZE, 0, cz * CHUNK_SIZE);
    mesh.frustumCulled = true;
    const old = entry.mesh;
    this.scene.add(mesh);
    if (old) { mesh.visible = old.visible; this.scene.remove(old); old.geometry.dispose(); }
    entry.mesh = mesh; entry.level = level; entry.terrainQuads = data.quads; entry.terrainDirty = false;
  }
  rebuildWater(cx, cz, entry) {
    const water = buildWaterMesh(this.world, cx, cz), old = entry.waterMesh; let waterMesh = null;
    if (water.positions.length) {
      const buffer = new THREE.BufferGeometry();
      for (const [name, values, size] of [['position', water.positions, 3], ['normal', water.normals, 3], ['uv', water.uvs, 2], ['color', water.colors, 3]]) buffer.setAttribute(name, new THREE.Float32BufferAttribute(values, size));
      buffer.setIndex(water.indices); buffer.computeBoundingSphere(); waterMesh = new THREE.Mesh(buffer, getFaceMaterial('water'));
      waterMesh.position.set(cx * CHUNK_SIZE, 0, cz * CHUNK_SIZE); waterMesh.renderOrder = 2; waterMesh.visible = old?.visible ?? entry.mesh.visible; this.scene.add(waterMesh);
    }
    // Replacement is ready before the previous buffer is removed.
    if (old) { this.scene.remove(old); old.geometry.dispose(); }
    entry.waterMesh = waterMesh; entry.waterQuads = water.indices.length / 6; entry.waterDirty = false;
  }
  rebuild(cx, cz, level, old) {
    const entry = old ?? this.createEntry(cx, cz, level);
    if (!old || entry.terrainDirty || entry.level !== level) this.rebuildTerrain(cx, cz, level, entry);
    if (!old || entry.waterDirty) this.rebuildWater(cx, cz, entry);
    this.chunks.set(chunkKey(cx, cz), entry);
    return entry;
  }

  update(camera) {
    this.frame++;
    camera.updateMatrixWorld();
    this.projectionView.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    this.frustum.setFromProjectionMatrix(this.projectionView);
    const cx = Math.floor(camera.position.x / CHUNK_SIZE), cz = Math.floor(camera.position.z / CHUNK_SIZE);
    const radius = Math.ceil(this.viewDistance / CHUNK_SIZE);
    // Beyond integer-grid precision, do not run non-advancing coordinate loops.
    if (![cx - radius, cx + radius, cz - radius, cz + radius].every(Number.isSafeInteger)) {
      for (const chunk of this.chunks.values()) { chunk.mesh.visible = false; if (chunk.waterMesh) chunk.waterMesh.visible = false; }
      this.stats.visibleChunks = this.stats.visibleQuads = 0;
      return;
    }
    const visible = [];
    for (const chunk of this.chunks.values()) { chunk.mesh.visible = false; if (chunk.waterMesh) chunk.waterMesh.visible = false; }
    for (let z = cz - radius; z <= cz + radius; z++) {
      for (let x = cx - radius; x <= cx + radius; x++) {
        const distance = Math.hypot((x + 0.5) * CHUNK_SIZE - camera.position.x, (z + 0.5) * CHUNK_SIZE - camera.position.z);
        if (distance > this.viewDistance) continue;
        const { minY, maxY } = this.world.chunkBounds(x, z);
        this.box.min.set(x * CHUNK_SIZE, minY, z * CHUNK_SIZE);
        this.box.max.set((x + 1) * CHUNK_SIZE, maxY, (z + 1) * CHUNK_SIZE);
        if (!this.frustum.intersectsBox(this.box)) continue;
        visible.push({ x, z, distance });
      }
    }
    visible.sort((a, b) => a.distance - b.distance);
    this.stats.visibleChunks = this.stats.visibleQuads = 0;
    this.stats.lods = [0, 0, 0];
    let builds = 0; const waterJobs = [];
    for (const item of visible) {
      let chunk = this.chunks.get(chunkKey(item.x, item.z));
      const level = chooseLod(item.distance, chunk?.level);
      if (!chunk || chunk.terrainDirty || chunk.level !== level) {
        // Edits close enough to interact with are rebuilt immediately.
        if (builds < this.buildsPerFrame || (chunk?.terrainDirty && item.distance < 24)) {
          if (!chunk) { chunk = this.createEntry(item.x, item.z, level); this.chunks.set(chunkKey(item.x, item.z), chunk); }
          this.rebuildTerrain(item.x, item.z, level, chunk);
          builds++;
        }
      }
      if (chunk) {
        if (chunk.waterDirty) waterJobs.push({ ...item, chunk });
        chunk.mesh.visible = true;
        if (chunk.waterMesh) chunk.waterMesh.visible = true;
        this.stats.visibleChunks++;
        this.stats.visibleQuads += chunk.quads;
        this.stats.lods[chunk.level === 1 ? 0 : chunk.level === 2 ? 1 : 2]++;
      }
    }
    // Age eventually outranks distance so ongoing nearby flows cannot starve
    // other visible water. Offscreen simulation is independent of this budget.
    waterJobs.sort((a, b) => (a.distance - (this.frame - a.chunk.waterSince) * 2) - (b.distance - (this.frame - b.chunk.waterSince) * 2));
    const started = performance.now(); let waterBuilds = 0;
    for (const job of waterJobs) {
      if (waterBuilds >= this.waterBuildsPerFrame || waterBuilds > 0 && performance.now() - started >= this.waterMillisecondsPerFrame) break;
      const previous = job.chunk.waterQuads; this.rebuildWater(job.x, job.z, job.chunk);
      this.stats.visibleQuads += job.chunk.waterQuads - previous; waterBuilds++;
    }
    for (const [key, chunk] of this.chunks) {
      if (Math.hypot(chunk.mesh.position.x + 8 - camera.position.x, chunk.mesh.position.z + 8 - camera.position.z) > this.viewDistance + CHUNK_SIZE * 2) {
        this.scene.remove(chunk.mesh);
        chunk.mesh.geometry.dispose();
        if (chunk.waterMesh) { this.scene.remove(chunk.waterMesh); chunk.waterMesh.geometry.dispose(); }
        this.chunks.delete(key);
      }
    }
    this.stats.loadedChunks = this.chunks.size;
  }

  dispose() {
    this.unsubscribe();
    for (const chunk of this.chunks.values()) { this.scene.remove(chunk.mesh); chunk.mesh.geometry.dispose(); if (chunk.waterMesh) { this.scene.remove(chunk.waterMesh); chunk.waterMesh.geometry.dispose(); } }
    this.chunks.clear();
  }
}
