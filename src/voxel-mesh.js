import { CHUNK_SIZE } from './voxel-world.js';

import { blockShade } from './block-appearance.js';
import { blockFaceVisible, blockFaceTexture } from './block-types.js';
import { BLOCK_TYPES } from './block-types.js';
import { faceUv, shapeQuads } from './shape-mesh.js';
// Coarsen horizontal samples at distance; keep vertical layers one meter thick.
// Majority coverage intentionally drops sub-LOD details only in distant meshes.
export function buildChunkMesh(world, cx, cz, level = 1) {
  if (![1, 2, 4].includes(level)) throw new Error('Unsupported voxel LOD');
  const { minY, maxY } = world.chunkBounds(cx, cz, false);
  const dimensions = [CHUNK_SIZE / level, maxY - minY, CHUNK_SIZE / level];
  const scale = [level, 1, level];
  const originX = cx * CHUNK_SIZE;
  const originZ = cz * CHUNK_SIZE;
  const padded = dimensions.map(n => n + 2);
  const occupancy = new Uint16Array(padded[0] * padded[1] * padded[2]);
  const types = [null], typeIndices = new Map();
  const indexOf = (x, y, z) => (x + 1) + padded[0] * ((y + 1) + padded[1] * (z + 1));
  for (let z = -1; z <= dimensions[2]; z++) {
    for (let y = -1; y <= dimensions[1]; y++) {
      for (let x = -1; x <= dimensions[0]; x++) {
        let count = 0; const counts = new Map();
        for (let dz = 0; dz < level; dz++) {
          for (let dx = 0; dx < level; dx++) {
            const id = world.blockIdAt(originX + x * level + dx, minY + y, originZ + z * level + dz);
            if (id && BLOCK_TYPES.get(id).collisionShape === 'cube') {
              const definition = BLOCK_TYPES.get(id), directional = id === 'furnace' || definition.tags.includes('wood.logs');
              const state = directional ? world.blockStateAt(originX + x * level + dx, minY + y, originZ + z * level + dz) : definition.defaultState;
              const key = directional ? `${id}:${state.axis ?? 'y'}:${state.facing ?? ''}:${Boolean(state.lit)}` : id;
              count++; const entry = counts.get(key); counts.set(key, { id, state, count: (entry?.count ?? 0) + 1 });
            }
          }
        }
        if (count && count * 2 >= level * level) {
          const [key, entry] = [...counts].sort((a, b) => b[1].count - a[1].count)[0];
          if (!typeIndices.has(key)) { typeIndices.set(key, types.length); types.push({ ...entry, definition: BLOCK_TYPES.get(entry.id) }); }
          occupancy[indexOf(x, y, z)] = typeIndices.get(key);
        }
      }
    }
  }
  const type = c => types[occupancy[indexOf(...c)]];
  const positions = [], normals = [], uvs = [], colors = [], indices = [];
  const materialIndices = new Map(), groups = [];
  const faceEntries = new Map();
  let quads = 0;

  for (let axis = 0; axis < 3; axis++) {
    const u = (axis + 1) % 3;
    const v = (axis + 2) % 3;
    const width = dimensions[u];
    const height = dimensions[v];
    for (const sign of [-1, 1]) {
      const shade = blockShade(axis, sign);
      for (let slice = 0; slice < dimensions[axis]; slice++) {
        const mask = Array(width * height).fill(null);
        for (let j = 0; j < height; j++) {
          for (let i = 0; i < width; i++) {
            const cell = [0, 0, 0];
            cell[axis] = slice; cell[u] = i; cell[v] = j;
            const neighbor = [...cell]; neighbor[axis] += sign;
            const block = type(cell), adjacent = type(neighbor);
            if (blockFaceVisible(block?.id, adjacent?.id)) {
              const texture = blockFaceTexture(block.id, axis, sign, block.state), key = `${texture}:${block.state.axis ?? ''}`;
              faceEntries.set(key, { block, texture }); mask[i + j * width] = key;
            }
          }
        }
        // Greedily merge coplanar exposed faces; never create internal faces.
        for (let j = 0; j < height; j++) {
          for (let i = 0; i < width;) {
            if (!mask[i + j * width]) { i++; continue; }
            const key = mask[i + j * width], { block, texture } = faceEntries.get(key);
            let w = 1;
            while (i + w < width && mask[i + w + j * width] === key) w++;
            let h = 1;
            outer: while (j + h < height) {
              for (let k = 0; k < w; k++) if (mask[i + k + (j + h) * width] !== key) break outer;
              h++;
            }
            const p = [0, 0, 0];
            p[axis] = (slice + (sign > 0 ? 1 : 0)) * scale[axis];
            p[u] = i * scale[u]; p[v] = j * scale[v];
            p[1] += minY;
            const corners = [p, [...p], [...p], [...p]];
            corners[1][u] += w * scale[u];
            corners[2][u] += w * scale[u]; corners[2][v] += h * scale[v];
            corners[3][v] += h * scale[v];
            const first = positions.length / 3;
            const normal = [0, 0, 0]; normal[axis] = sign;
            for (const corner of corners) { positions.push(...corner); normals.push(...normal); colors.push(shade, shade, shade); }
            const textureWidth = w * scale[u], textureHeight = h * scale[v];
            // Repeat once per world block even after greedy merging/LOD.
            // Side textures always keep their vertical axis along world Y.
            for (const corner of corners) uvs.push(...faceUv(corner, axis, block));
            const order = sign > 0 ? [0, 1, 2, 0, 2, 3] : [0, 2, 1, 0, 3, 2];
            if (!materialIndices.has(texture)) materialIndices.set(texture, []);
            materialIndices.get(texture).push(...order.map(n => first + n));
            quads++;
            for (let row = 0; row < h; row++) {
              for (let col = 0; col < w; col++) mask[i + col + (j + row) * width] = 0;
            }
            i += w;
          }
        }
      }
    }
  }
  // Partial shapes remain exact at all distances, rather than becoming cubes.
  for (const edit of world.edits()) {
    if (!edit.solid || edit.x < originX || edit.x >= originX + CHUNK_SIZE || edit.z < originZ || edit.z >= originZ + CHUNK_SIZE) continue;
    const block = world.blockAt(edit.x, edit.y, edit.z); if (block.definition.collisionShape === 'cube') continue;
    for (const quad of shapeQuads(block, world)) {
      const first = positions.length / 3, normal = [0, 0, 0]; normal[quad.axis] = quad.sign;
      for (const p of quad.corners) { positions.push(p[0] + edit.x - originX, p[1] + edit.y, p[2] + edit.z - originZ); normals.push(...normal); colors.push(quad.shade, quad.shade, quad.shade); uvs.push(...faceUv(p, quad.axis, block)); }
      if (!materialIndices.has(quad.texture)) materialIndices.set(quad.texture, []);
      const order = quad.sign > 0 ? [0, 1, 2, 0, 2, 3] : [0, 2, 1, 0, 3, 2];
      materialIndices.get(quad.texture).push(...order.map(i => first + i)); quads++;
    }
  }
  for (const [texture, faces] of materialIndices) {
    groups.push({ start: indices.length, count: faces.length, texture });
    for (const index of faces) indices.push(index);
  }
  return { positions, normals, uvs, colors, indices, groups, quads, minY, maxY, level };
}

export function chooseLod(distance, current = null) {
  // Hysteresis prevents frequent swaps while walking along a threshold.
  if (current === 1 && distance < 56) return 1;
  if (current === 2 && distance > 40 && distance < 104) return 2;
  if (current === 4 && distance > 88) return 4;
  return distance < 48 ? 1 : distance < 96 ? 2 : 4;
}
