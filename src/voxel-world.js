export const CHUNK_SIZE = 16;
export const PLAYER_HALF_WIDTH = 0.3;
export const BLOCK_REACH = 4.5;
const EPSILON = 1e-7;
export const chunkKey = (x, z) => `${x},${z}`;
const blockKey = (x, y, z) => `${x},${y},${z}`;

export function blockIntersectsPlayer(x, y, z, player, halfWidth = PLAYER_HALF_WIDTH, height = 2) {
  return x + 1 > player.x - halfWidth + EPSILON && x < player.x + halfWidth - EPSILON
    && z + 1 > player.z - halfWidth + EPSILON && z < player.z + halfWidth - EPSILON
    && y + 1 > player.y + EPSILON && y < player.y + height - EPSILON;
}

export class VoxelWorld {
  constructor({ depth = 3 } = {}) {
    this.depth = depth;
    // Only edits are stored. Untouched terrain is three solid layers below y=0.
    this.chunkEdits = new Map();
  }

  hasBlock(x, y, z) {
    const edits = this.chunkEdits.get(chunkKey(Math.floor(x / CHUNK_SIZE), Math.floor(z / CHUNK_SIZE)));
    const edit = edits?.get(blockKey(x, y, z));
    return edit ? edit.solid : y >= -this.depth && y < 0;
  }

  setBlock(x, y, z, solid) {
    if (![x, y, z].every(Number.isSafeInteger)) return false;
    solid = Boolean(solid);
    if (this.hasBlock(x, y, z) === solid) return false;
    const key = chunkKey(Math.floor(x / CHUNK_SIZE), Math.floor(z / CHUNK_SIZE));
    let edits = this.chunkEdits.get(key);
    const isDefault = y >= -this.depth && y < 0;
    if (solid === isDefault) {
      edits?.delete(blockKey(x, y, z));
      if (edits?.size === 0) this.chunkEdits.delete(key);
    } else {
      if (!edits) { edits = new Map(); this.chunkEdits.set(key, edits); }
      edits.set(blockKey(x, y, z), { x, y, z, solid });
    }
    return true;
  }

  chunkBounds(cx, cz) {
    let minY = -this.depth;
    let maxY = 0;
    for (const edit of this.chunkEdits.get(chunkKey(cx, cz))?.values() || []) {
      if (edit.solid) { minY = Math.min(minY, edit.y); maxY = Math.max(maxY, edit.y + 1); }
    }
    return { minY, maxY };
  }

  canPlaceBlock(x, y, z, players = []) {
    return [x, y, z].every(Number.isSafeInteger) && !this.hasBlock(x, y, z)
      && !players.some(player => blockIntersectsPlayer(x, y, z, player));
  }

  // Grid DDA hits actual voxels, independently of visible meshes or their LOD.
  raycast(origin, direction, reach = BLOCK_REACH) {
    const magnitude = Math.hypot(direction.x, direction.y, direction.z);
    if (!magnitude || reach < 0) return null;
    const d = [direction.x / magnitude, direction.y / magnitude, direction.z / magnitude];
    const o = [origin.x, origin.y, origin.z];
    const cell = o.map(Math.floor);
    const step = d.map(Math.sign);
    const delta = d.map(value => value === 0 ? Infinity : Math.abs(1 / value));
    const next = d.map((value, axis) => value === 0 ? Infinity
      : ((value > 0 ? cell[axis] + 1 : cell[axis]) - o[axis]) / value);
    let distance = 0;
    let normal = [0, 0, 0];
    while (distance <= reach) {
      if (this.hasBlock(...cell)) {
        return { x: cell[0], y: cell[1], z: cell[2], normal: { x: normal[0], y: normal[1], z: normal[2] }, distance };
      }
      const axis = next[0] <= next[1] && next[0] <= next[2] ? 0 : next[1] <= next[2] ? 1 : 2;
      distance = next[axis];
      if (!Number.isFinite(distance) || distance > reach) return null;
      cell[axis] += step[axis];
      next[axis] += delta[axis];
      normal = [0, 0, 0];
      normal[axis] = -step[axis];
    }
    return null;
  }

  isSupported(player, halfWidth = PLAYER_HALF_WIDTH) {
    const y = Math.floor(player.y - EPSILON);
    if (Math.abs(player.y - (y + 1)) > EPSILON * 2) return false;
    for (let x = Math.floor(player.x - halfWidth + EPSILON); x <= Math.floor(player.x + halfWidth - EPSILON); x++) {
      for (let z = Math.floor(player.z - halfWidth + EPSILON); z <= Math.floor(player.z + halfWidth - EPSILON); z++) {
        if (this.hasBlock(x, y, z)) return true;
      }
    }
    return false;
  }

  // Swept axis clipping prevents tunneling even when falling through several
  // cells per tick. Vertical movement first permits jumping onto a block.
  movePlayer(player, velocity, halfWidth = PLAYER_HALF_WIDTH, height = 2) {
    const p = { x: player.x, y: player.y, z: player.z };
    const moved = { x: 0, y: 0, z: 0 };
    const blocked = { x: false, y: false, z: false };
    for (const axis of ['y', 'x', 'z']) {
      const wanted = velocity[axis];
      if (!wanted) continue;
      const min = { x: p.x - halfWidth, y: p.y, z: p.z - halfWidth };
      const max = { x: p.x + halfWidth, y: p.y + height, z: p.z + halfWidth };
      const low = { ...min, [axis]: Math.min(min[axis], min[axis] + wanted) };
      const high = { ...max, [axis]: Math.max(max[axis], max[axis] + wanted) };
      let allowed = wanted;
      for (let x = Math.floor(low.x + EPSILON); x <= Math.floor(high.x - EPSILON); x++) {
        for (let y = Math.floor(low.y + EPSILON); y <= Math.floor(high.y - EPSILON); y++) {
          for (let z = Math.floor(low.z + EPSILON); z <= Math.floor(high.z - EPSILON); z++) {
            if (!this.hasBlock(x, y, z)) continue;
            const block = { x, y, z };
            const overlaps = ['x', 'y', 'z'].every(other => other === axis
              || (max[other] > block[other] + EPSILON && min[other] < block[other] + 1 - EPSILON));
            if (!overlaps) continue;
            if (wanted > 0 && max[axis] <= block[axis] + EPSILON) allowed = Math.min(allowed, block[axis] - max[axis]);
            if (wanted < 0 && min[axis] >= block[axis] + 1 - EPSILON) allowed = Math.max(allowed, block[axis] + 1 - min[axis]);
          }
        }
      }
      moved[axis] = allowed;
      blocked[axis] = Math.abs(allowed - wanted) > EPSILON;
      p[axis] += allowed;
    }
    return { ...p, moved, blocked, grounded: this.isSupported(p, halfWidth) };
  }

  findSpawn() {
    // Search nearby columns if the original spawn column was dug away.
    for (let radius = 0; radius <= 8; radius++) {
      for (let x = -radius; x <= radius; x++) {
        for (let z = -radius; z <= radius; z++) {
          if (radius && Math.max(Math.abs(x), Math.abs(z)) !== radius) continue;
          const { minY, maxY } = this.chunkBounds(Math.floor(x / CHUNK_SIZE), Math.floor(z / CHUNK_SIZE));
          for (let y = maxY - 1; y >= minY; y--) {
            if (this.hasBlock(x, y, z)) return { x: x + 0.5, y: y + 1, z: z + 0.5 };
          }
        }
      }
    }
    return { x: 16.5, y: 0, z: 16.5 };
  }
}
