import * as THREE from 'three';
import { CHUNK_SIZE, chunkKey } from './voxel-world.js';
import { buildChunkMesh, chooseLod } from './voxel-mesh.js';
import { getFaceMaterial } from './block-assets.js';

export class ChunkRenderer {
  constructor(world, scene, material, { viewDistance = 160, buildsPerFrame = 4 } = {}) {
    this.world = world;
    this.scene = scene;
    this.material = material;
    this.viewDistance = viewDistance;
    this.buildsPerFrame = buildsPerFrame;
    this.chunks = new Map();
    this.frustum = new THREE.Frustum();
    this.projectionView = new THREE.Matrix4();
    this.box = new THREE.Box3();
    this.stats = { visibleChunks: 0, visibleQuads: 0, loadedChunks: 0, lods: [0, 0, 0] };
    this.unsubscribe = world.subscribe(({ x, z }) => this.invalidateBlock(x, z));
  }

  invalidateBlock(x, z, immediate = false) {
    const cx = Math.floor(x / CHUNK_SIZE), cz = Math.floor(z / CHUNK_SIZE);
    // Neighbors must expose/hide shared boundary faces, too.
    for (const [dx, dz] of [[0, 0], [-1, 0], [1, 0], [0, -1], [0, 1]]) {
      const chunk = this.chunks.get(chunkKey(cx + dx, cz + dz));
      if (chunk) {
        chunk.dirty = true;
        if (immediate) this.rebuild(cx + dx, cz + dz, chunk.level, chunk);
      }
    }
  }

  rebuild(cx, cz, level, old) {
    const data = buildChunkMesh(this.world, cx, cz, level);
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(data.positions, 3));
    geometry.setAttribute('normal', new THREE.Float32BufferAttribute(data.normals, 3));
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute(data.uvs, 2));
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(data.colors, 3));
    geometry.setIndex(data.indices);
    const materials = data.groups.map((group, index) => {
      geometry.addGroup(group.start, group.count, index);
      return group.texture === 'test.block' ? this.material : getFaceMaterial(group.texture);
    });
    geometry.computeBoundingSphere();
    const mesh = new THREE.Mesh(geometry, materials.length === 1 ? materials[0] : materials);
    mesh.position.set(cx * CHUNK_SIZE, 0, cz * CHUNK_SIZE);
    mesh.frustumCulled = true;
    if (old) { this.scene.remove(old.mesh); old.mesh.geometry.dispose(); }
    this.scene.add(mesh);
    const entry = { mesh, level, quads: data.quads, dirty: false };
    this.chunks.set(chunkKey(cx, cz), entry);
    return entry;
  }

  update(camera) {
    camera.updateMatrixWorld();
    this.projectionView.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    this.frustum.setFromProjectionMatrix(this.projectionView);
    const cx = Math.floor(camera.position.x / CHUNK_SIZE), cz = Math.floor(camera.position.z / CHUNK_SIZE);
    const radius = Math.ceil(this.viewDistance / CHUNK_SIZE);
    // Beyond integer-grid precision, do not run non-advancing coordinate loops.
    if (![cx - radius, cx + radius, cz - radius, cz + radius].every(Number.isSafeInteger)) {
      for (const chunk of this.chunks.values()) chunk.mesh.visible = false;
      this.stats.visibleChunks = this.stats.visibleQuads = 0;
      return;
    }
    const visible = [];
    for (const chunk of this.chunks.values()) chunk.mesh.visible = false;
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
    let builds = 0;
    for (const item of visible) {
      let chunk = this.chunks.get(chunkKey(item.x, item.z));
      const level = chooseLod(item.distance, chunk?.level);
      if (!chunk || chunk.dirty || chunk.level !== level) {
        // Edits close enough to interact with are rebuilt immediately.
        if (builds < this.buildsPerFrame || (chunk?.dirty && item.distance < 24)) {
          chunk = this.rebuild(item.x, item.z, level, chunk);
          builds++;
        }
      }
      if (chunk) {
        chunk.mesh.visible = true;
        this.stats.visibleChunks++;
        this.stats.visibleQuads += chunk.quads;
        this.stats.lods[chunk.level === 1 ? 0 : chunk.level === 2 ? 1 : 2]++;
      }
    }
    for (const [key, chunk] of this.chunks) {
      if (Math.hypot(chunk.mesh.position.x + 8 - camera.position.x, chunk.mesh.position.z + 8 - camera.position.z) > this.viewDistance + CHUNK_SIZE * 2) {
        this.scene.remove(chunk.mesh);
        chunk.mesh.geometry.dispose();
        this.chunks.delete(key);
      }
    }
    this.stats.loadedChunks = this.chunks.size;
  }

  dispose() {
    this.unsubscribe();
    for (const chunk of this.chunks.values()) { this.scene.remove(chunk.mesh); chunk.mesh.geometry.dispose(); }
    this.chunks.clear();
  }
}
