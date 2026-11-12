export const CHUNK_SIZE = 16;
export const PLAYER_HALF_WIDTH = 0.3;
export const BLOCK_REACH = 4.5;
const EPSILON = 1e-7;
const AXES = ['x', 'y', 'z'];
export const chunkKey = (x, z) => `${x},${z}`;
const blockKey = (x, y, z) => `${x},${y},${z}`;
const tolerance = (min, max) => Math.min(EPSILON, Math.max(0, max - min) * 1e-6);
const overlaps = (min, max, block) => AXES.every(axis => max[axis] > block[axis] + tolerance(min[axis], max[axis])
  && min[axis] < block[axis] + 1 - tolerance(min[axis], max[axis]));
function playerBounds(player, halfWidth = 0.3 * (player.size ?? 1), height = 1.8 * (player.size ?? 1)) {
  return { min: { x: player.x - halfWidth, y: player.y, z: player.z - halfWidth },
    max: { x: player.x + halfWidth, y: player.y + height, z: player.z + halfWidth } };
}
export function blockIntersectsPlayer(x, y, z, player, halfWidth, height) {
  const { min, max } = playerBounds(player, halfWidth, height);
  return overlaps(min, max, { x, y, z });
}
function rayBox(origin, direction, min, max, reach) {
  let enter = -Infinity, exit = Infinity;
  let normal = { x: 0, y: 0, z: 0 };
  for (const axis of AXES) {
    if (direction[axis] === 0) {
      if (origin[axis] <= min[axis] || origin[axis] >= max[axis]) return null;
    } else {
      const a = (min[axis] - origin[axis]) / direction[axis];
      const b = (max[axis] - origin[axis]) / direction[axis];
      const near = Math.min(a, b);
      if (near > enter) { enter = near; normal = { x: 0, y: 0, z: 0 }; normal[axis] = -Math.sign(direction[axis]); }
      exit = Math.min(exit, Math.max(a, b));
    }
  }
  if (exit <= 0 || enter > exit || enter > reach) return null;
  return { distance: Math.max(0, enter), normal: enter < 0 ? { x: 0, y: 0, z: 0 } : normal };
}

export class VoxelWorld {
  constructor({ depth = 3 } = {}) { this.depth = depth; this.chunkEdits = new Map(); this.removedCount = 0; }
  *edits() { for (const edits of this.chunkEdits.values()) yield* edits.values(); }
  hasBlock(x, y, z) {
    const edit = this.chunkEdits.get(chunkKey(Math.floor(x / CHUNK_SIZE), Math.floor(z / CHUNK_SIZE)))?.get(blockKey(x, y, z));
    return edit ? edit.solid : y >= -this.depth && y < 0;
  }
  setBlock(x, y, z, solid) {
    if (![x, y, z].every(Number.isSafeInteger)) return false;
    solid = Boolean(solid);
    if (this.hasBlock(x, y, z) === solid) return false;
    const key = chunkKey(Math.floor(x / CHUNK_SIZE), Math.floor(z / CHUNK_SIZE));
    let edits = this.chunkEdits.get(key);
    const isDefault = y >= -this.depth && y < 0;
    if (isDefault) this.removedCount += solid ? -1 : 1;
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
    let minY = -this.depth, maxY = 0;
    for (const edit of this.chunkEdits.get(chunkKey(cx, cz))?.values() || []) {
      if (edit.solid) { minY = Math.min(minY, edit.y); maxY = Math.max(maxY, edit.y + 1); }
    }
    return { minY, maxY };
  }
  // Untouched terrain is analytic, while edits remain sparse. Queries do not
  // enumerate an enormous box or a long flight path in developer mode.
  baseSolidInBox(min, max) {
    const clippedMin = { ...min, y: Math.max(min.y, -this.depth) };
    const clippedMax = { ...max, y: Math.min(max.y, 0) };
    if (AXES.some(axis => clippedMax[axis] <= clippedMin[axis])) return false;
    const low = {}, high = {};
    let cells = 1;
    for (const axis of AXES) {
      const eps = tolerance(clippedMin[axis], clippedMax[axis]);
      low[axis] = Math.floor(clippedMin[axis] + eps);
      high[axis] = Math.floor(clippedMax[axis] - eps);
      cells *= Math.max(0, high[axis] - low[axis] + 1);
    }
    if (cells > this.removedCount) return true;
    let removed = 0;
    for (const edit of this.edits()) if (!edit.solid && AXES.every(a => edit[a] >= low[a] && edit[a] <= high[a])) removed++;
    return cells > removed;
  }
  hasSolidInBox(min, max) {
    if (AXES.some(axis => max[axis] <= min[axis])) return false;
    if (this.baseSolidInBox(min, max)) return true;
    for (const edit of this.edits()) if (edit.solid && overlaps(min, max, edit)) return true;
    return false;
  }
  intersectsPlayer(player, size = player.size ?? 1) {
    const { min, max } = playerBounds({ ...player, size });
    return this.hasSolidInBox(min, max);
  }
  canPlaceBlock(x, y, z, players = []) {
    return [x, y, z].every(Number.isSafeInteger) && !this.hasBlock(x, y, z)
      && !players.some(player => blockIntersectsPlayer(x, y, z, player));
  }
  raycast(origin, direction, reach = BLOCK_REACH) {
    const length = Math.hypot(direction.x, direction.y, direction.z);
    if (!length || reach < 0) return null;
    const d = Object.fromEntries(AXES.map(a => [a, direction[a] / length]));
    let best = null;
    for (const edit of this.edits()) if (edit.solid) {
      const max = { x: edit.x + 1, y: edit.y + 1, z: edit.z + 1 };
      const hit = rayBox(origin, d, edit, max, best?.distance ?? reach);
      if (hit && (!best || hit.distance < best.distance)) best = { ...hit, x: edit.x, y: edit.y, z: edit.z };
    }
    if (this.depth === 0) return best;
    let entry = 0, end = best?.distance ?? reach;
    let normal = { x: 0, y: 0, z: 0 };
    if (d.y === 0) {
      if (origin.y < -this.depth || origin.y >= 0) return best;
    } else {
      const a = (-this.depth - origin.y) / d.y, b = -origin.y / d.y;
      entry = Math.max(0, Math.min(a, b)); end = Math.min(end, Math.max(a, b));
      if (Math.min(a, b) >= 0) normal.y = -Math.sign(d.y);
      if (end < entry || end < 0) return best;
    }
    if (entry > end) return best;
    const cell = {}, next = {}, step = {}, delta = {};
    for (const axis of AXES) {
      const coordinate = origin[axis] + d[axis] * entry;
      if (!Number.isFinite(coordinate)) return best;
      cell[axis] = Math.floor(coordinate);
      if (d[axis] < 0 && coordinate === cell[axis]) cell[axis]--;
      step[axis] = Math.sign(d[axis]);
      delta[axis] = d[axis] === 0 ? Infinity : Math.abs(1 / d[axis]);
      next[axis] = d[axis] === 0 ? Infinity : ((d[axis] > 0 ? cell[axis] + 1 : cell[axis]) - origin[axis]) / d[axis];
    }
    let distance = entry;
    // Only removed cells can postpone a base-terrain hit, so this work is
    // bounded by stored edits rather than the configured reach.
    for (let count = 0; count <= this.removedCount + 3 && distance <= end; count++) {
      if (cell.y < -this.depth || cell.y >= 0) break;
      if (this.hasBlock(cell.x, cell.y, cell.z)) return { ...cell, distance, normal };
      const axis = AXES.reduce((a, b) => next[a] <= next[b] ? a : b);
      distance = next[axis];
      if (!Number.isFinite(distance)) break;
      cell[axis] += step[axis]; next[axis] += delta[axis];
      normal = { x: 0, y: 0, z: 0 }; normal[axis] = -step[axis];
    }
    return best;
  }
  sweepBox(origin, motion, half = 0.1) {
    let fraction = 1;
    const test = block => {
      const min = {}, max = {};
      for (const a of AXES) { min[a] = block[a] - half; max[a] = block[a] + 1 + half; }
      const hit = rayBox(origin, motion, min, max, fraction);
      if (hit) fraction = Math.max(0, hit.distance - 1e-6);
    };
    for (const edit of this.edits()) if (edit.solid) test(edit);
    const low = {}, high = {};
    for (const a of AXES) {
      low[a] = Math.floor(Math.min(origin[a], origin[a] + motion[a]) - half);
      high[a] = Math.floor(Math.max(origin[a], origin[a] + motion[a]) + half);
    }
    if (low.y <= -1 && high.y >= -this.depth) {
      if (![low.x, high.x, low.z, high.z].every(Number.isSafeInteger)) {
        const hit = rayBox(origin, motion, { x: -Infinity, y: -this.depth - half, z: -Infinity },
          { x: Infinity, y: half, z: Infinity }, fraction);
        if (hit) fraction = Math.max(0, hit.distance - 1e-6);
      } else {
        for (let x = low.x; x <= high.x; x++) for (let z = low.z; z <= high.z; z++)
          for (let y = Math.max(low.y, -this.depth); y <= Math.min(high.y, -1); y++) if (this.hasBlock(x, y, z)) test({ x, y, z });
      }
    }
    return fraction;
  }
  isSupported(player, halfWidth = 0.3 * (player.size ?? 1)) {
    const y = Math.round(player.y);
    if (Math.abs(player.y - y) > EPSILON) return false;
    return this.hasSolidInBox({ x: player.x - halfWidth, y: y - 0.5, z: player.z - halfWidth },
      { x: player.x + halfWidth, y, z: player.z + halfWidth });
  }
  movePlayer(player, velocity, halfWidth = 0.3 * (player.size ?? 1), height = 1.8 * (player.size ?? 1)) {
    const p = { x: player.x, y: player.y, z: player.z, size: player.size ?? 1 };
    const moved = { x: 0, y: 0, z: 0 }, blocked = { x: false, y: false, z: false };
    for (const axis of ['y', 'x', 'z']) {
      const wanted = velocity[axis];
      if (!wanted) continue;
      const { min, max } = playerBounds(p, halfWidth, height);
      let allowed = wanted;
      const clip = block => {
        if (!AXES.every(other => other === axis || (max[other] > block[other] + tolerance(min[other], max[other])
          && min[other] < block[other] + 1 - tolerance(min[other], max[other])))) return;
        if (wanted > 0 && max[axis] <= block[axis] + EPSILON) allowed = Math.min(allowed, block[axis] - max[axis]);
        if (wanted < 0 && min[axis] >= block[axis] + 1 - EPSILON) allowed = Math.max(allowed, block[axis] + 1 - min[axis]);
      };
      for (const edit of this.edits()) if (edit.solid) clip(edit);
      if (axis === 'y') {
        for (let y = -this.depth; y < 0; y++) {
          const low = { ...min, y }, high = { ...max, y: y + 1 };
          if (!this.baseSolidInBox(low, high)) continue;
          if (wanted > 0 && max.y <= y + EPSILON) allowed = Math.min(allowed, y - max.y);
          if (wanted < 0 && min.y >= y + 1 - EPSILON) allowed = Math.max(allowed, y + 1 - min.y);
        }
      } else if (min.y < 0 && max.y > -this.depth) {
        const first = wanted > 0 ? Math.ceil(max[axis] - EPSILON) : Math.floor(min[axis] + EPSILON) - 1;
        for (let offset = 0; offset <= this.removedCount + 1; offset++) {
          const cell = first + Math.sign(wanted) * offset;
          const distance = wanted > 0 ? cell - max[axis] : cell + 1 - min[axis];
          if (wanted > 0 ? distance > allowed : distance < allowed) break;
          if (this.baseSolidInBox({ ...min, [axis]: cell }, { ...max, [axis]: cell + 1 })) { allowed = distance; break; }
        }
      }
      const next = Math.max(-Number.MAX_VALUE, Math.min(Number.MAX_VALUE, p[axis] + allowed));
      moved[axis] = next - p[axis];
      blocked[axis] = Math.abs(allowed - wanted) > EPSILON;
      p[axis] = next;
    }
    return { ...p, moved, blocked, grounded: this.isSupported(p, halfWidth) };
  }
  findSpawn(size = 1) {
    for (let radius = 0; radius <= 8; radius++) for (let x = -radius; x <= radius; x++) for (let z = -radius; z <= radius; z++) {
      if (radius && Math.max(Math.abs(x), Math.abs(z)) !== radius) continue;
      const ys = [];
      for (let y = -this.depth; y < 0; y++) if (this.hasBlock(x, y, z)) ys.push(y);
      for (const edit of this.edits()) if (edit.solid && edit.x === x && edit.z === z) ys.push(edit.y);
      ys.sort((a, b) => b - a);
      for (const y of ys) {
        const p = { x: x + 0.5, y: y + 1, z: z + 0.5, size };
        if (!this.intersectsPlayer(p)) return p;
      }
    }
    return { x: 16.5, y: 0, z: 16.5, size };
  }
}
