import { isWater, isWaterSource, waterHeight, waterSurfaceAt } from './fluid-surface.js';
const horizontal = [[1, 0], [-1, 0], [0, 1], [0, -1]];
const keyOf = (x, y, z) => `${x},${y},${z}`;
const chunkOf = (x, z) => `${Math.floor(x / 16)},${Math.floor(z / 16)}`;
const neighbors = [[0, 0, 0], [1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];
export const WATER_RULES = Object.freeze({ id: 'water', interval: 5, maxLevel: 7, search: 4 });

// Sparse, deduplicated game-tick work. A settled cell owns no repeating timer.
// Rendering budgets never change, drop or defer authoritative fluid updates.
export class FluidSystem {
  constructor(world, rules = WATER_RULES) {
    Object.assign(this, { world, rules }); this.time = 0; this.pending = new Map(); this.queue = new Map(); this.cells = new Map(); this.chunks = new Map();
  }
  at(x, y, z) {
    if (!this.lookups) return this.world.blockAt(x, y, z);
    const key = keyOf(x, y, z); if (!this.lookups.has(key)) this.lookups.set(key, this.world.blockAt(x, y, z)); return this.lookups.get(key);
  }
  invalidate(x, y, z) { this.lookups?.delete(keyOf(x, y, z)); }
  affected(x, y, z) {
    if (!this.cells.size) return false;
    return neighbors.some(([dx, dy, dz]) => this.cells.has(keyOf(x + dx, y + dy, z + dz)));
  }
  schedule(x, y, z) {
    const key = keyOf(x, y, z), due = this.time + this.rules.interval;
    if (this.pending.has(key)) return;
    if (this.world.blockIdAt(x, y, z) !== this.rules.id) return;
    this.pending.set(key, due);
    if (!this.queue.has(due)) this.queue.set(due, new Map());
    this.queue.get(due).set(key, this.cells.get(key) ?? { x, y, z });
  }
  changed(x, y, z) {
    const key = keyOf(x, y, z), chunkKey = chunkOf(x, z), block = this.at(x, y, z);
    if (isWater(block)) {
      if (!this.cells.has(key)) {
        const at = { x, y, z }; this.cells.set(key, at);
        if (!this.chunks.has(chunkKey)) this.chunks.set(chunkKey, new Map()); this.chunks.get(chunkKey).set(key, at);
      }
    } else {
      this.cells.delete(key); const chunk = this.chunks.get(chunkKey); chunk?.delete(key); if (chunk?.size === 0) this.chunks.delete(chunkKey);
      const due = this.pending.get(key);
      if (due !== undefined) { this.queue.get(due)?.delete(key); if (this.queue.get(due)?.size === 0) this.queue.delete(due); this.pending.delete(key); }
    }
    for (const [dx, dy, dz] of neighbors) this.schedule(x + dx, y + dy, z + dz);
  }
  tick() {
    this.time++; const due = this.queue.get(this.time); if (!due) return;
    this.queue.delete(this.time);
    // Remove all due keys before mutation: a changed neighbor can now schedule
    // a subsequent tick, but a newly-created cell cannot run in this batch.
    for (const key of due.keys()) this.pending.delete(key);
    this.lookups = new Map();
    try { for (const at of due.values()) if (isWater(this.at(at.x, at.y, at.z))) this.update(at.x, at.y, at.z); }
    finally { this.lookups = null; } // Rebuild-local/tick-local caches never survive changes unobserved.
  }
  open(x, y, z) { const b = this.at(x, y, z); return !b || isWater(b) && !isWaterSource(b); }
  put(x, y, z, state) {
    const b = this.at(x, y, z);
    if (b && (!isWater(b) || isWaterSource(b))) return false;
    if (isWater(b) && (b.state.falling || !state.falling && b.state.level <= state.level)) return false;
    return this.world.setBlock(x, y, z, this.rules.id, state);
  }
  update(x, y, z) {
    let b = this.at(x, y, z);
    if (!isWaterSource(b)) {
      const above = this.at(x, y + 1, z), below = this.at(x, y - 1, z);
      const neighbors = horizontal.map(([dx, dz]) => this.at(x + dx, y, z + dz));
      const sources = neighbors.filter(isWaterSource).length;
      let state;
      if (sources >= 2 && (below?.definition.solid || isWaterSource(below))) state = { level: 0, falling: false };
      else if (isWater(above)) state = { level: 0, falling: true };
      else {
        const levels = neighbors.filter(isWater).map(n => n.state.falling ? 0 : n.state.level);
        const level = Math.min(...levels, Infinity) + 1;
        if (level > this.rules.maxLevel) { this.world.setBlock(x, y, z, false); return; }
        state = { level, falling: false };
      }
      this.world.setBlock(x, y, z, this.rules.id, state); b = this.at(x, y, z);
    }
    if (this.open(x, y - 1, z)) { this.put(x, y - 1, z, { level: 0, falling: true }); return; }
    const level = (b.state.falling ? 0 : b.state.level) + 1;
    if (level > this.rules.maxLevel) return;
    const paths = horizontal.filter(([dx, dz]) => this.open(x + dx, y, z + dz));
    const costs = paths.map(([dx, dz]) => this.dropDistance(x + dx, y, z + dz, 1, new Set([keyOf(x, y, z)])));
    const best = Math.min(...costs);
    paths.forEach(([dx, dz], i) => { if (costs[i] === best) this.put(x + dx, y, z + dz, { level, falling: false }); });
  }
  dropDistance(x, y, z, distance, visited) {
    if (this.open(x, y - 1, z)) return distance;
    if (distance >= this.rules.search) return Infinity;
    const key = keyOf(x, y, z); visited.add(key); let best = Infinity;
    for (const [dx, dz] of horizontal) if (!visited.has(keyOf(x + dx, y, z + dz)) && this.open(x + dx, y, z + dz)) {
      best = Math.min(best, this.dropDistance(x + dx, y, z + dz, distance + 1, visited));
      if (best === distance + 1) break; // Lowest possible remaining cost.
    }
    visited.delete(key); return best;
  }
  current(x, y, z) {
    const b = this.at(x, y, z); if (!isWater(b)) return { x: 0, y: 0, z: 0 };
    const level = b.state.falling ? 0 : b.state.level; let vx = 0, vz = 0;
    for (const [dx, dz] of horizontal) {
      const n = this.at(x + dx, y, z + dz), below = this.at(x + dx, y - 1, z + dz);
      const delta = isWater(n) ? (n.state.falling ? 0 : n.state.level) - level + (n.state.falling ? 1 : 0)
        : !n && isWater(below) ? (below.state.falling ? 0 : below.state.level) + 8 - level : 0;
      vx += dx * delta; vz += dz * delta;
    }
    const vy = b.state.falling ? -6 : 0, length = Math.sqrt(vx * vx + vy * vy + vz * vz) || 1;
    return { x: vx / length, y: vy / length, z: vz / length };
  }
  sample(min, max) {
    if (!this.cells.size) return { inWater: false, x: 0, y: 0, z: 0 };
    let count = 0, x = 0, y = 0, z = 0;
    const consider = at => {
      const b = this.at(at.x, at.y, at.z);
      if (min.x >= at.x + 1 || max.x <= at.x || min.z >= at.z + 1 || max.z <= at.z || min.y >= at.y + waterHeight(b) || max.y <= at.y) return;
      const current = this.current(at.x, at.y, at.z); x += current.x; y += current.y; z += current.z; count++;
    };
    const volume = (Math.ceil(max.x) - Math.floor(min.x)) * (Math.ceil(max.y) - Math.floor(min.y)) * (Math.ceil(max.z) - Math.floor(min.z));
    if (volume < 512) {
      for (let a = Math.floor(min.x); a < max.x; a++) for (let b = Math.floor(min.y); b < max.y; b++) for (let c = Math.floor(min.z); c < max.z; c++) {
        if (this.cells.has(keyOf(a, b, c))) consider({ x: a, y: b, z: c });
      }
    } else for (const at of this.world.indexedEdits(this.chunks, min, max)) consider(at);
    return { inWater: count > 0, x: x / (count || 1), y: y / (count || 1), z: z / (count || 1) };
  }
  submerged(point) { return point.y < waterSurfaceAt(this.world, point); }
  touchesPath(from, to, halfWidth, height) {
    if (!this.cells.size) return false;
    const min = {x:Math.min(from.x,to.x)-halfWidth,y:Math.min(from.y,to.y),z:Math.min(from.z,to.z)-halfWidth};
    const max = {x:Math.max(from.x,to.x)+halfWidth,y:Math.max(from.y,to.y)+height,z:Math.max(from.z,to.z)+halfWidth};
    const touches = at => {
      const b=this.at(at.x,at.y,at.z); if(!isWater(b))return false;
      const low={x:at.x-halfWidth,y:at.y-height,z:at.z-halfWidth};
      const high={x:at.x+1+halfWidth,y:at.y+waterHeight(b),z:at.z+1+halfWidth};
      let enter=0,exit=1;
      for(const axis of ['x','y','z']) {
        const delta=to[axis]-from[axis];
        if(!delta) {if(from[axis]<=low[axis] || from[axis]>=high[axis])return false;}
        else {const a=(low[axis]-from[axis])/delta,b=(high[axis]-from[axis])/delta;enter=Math.max(enter,Math.min(a,b));exit=Math.min(exit,Math.max(a,b));}
      }
      return exit>=enter;
    };
    const volume=(Math.ceil(max.x)-Math.floor(min.x))*(Math.ceil(max.y)-Math.floor(min.y))*(Math.ceil(max.z)-Math.floor(min.z));
    if(volume<512) {
      for(let x=Math.floor(min.x);x<max.x;x++)for(let y=Math.floor(min.y);y<max.y;y++)for(let z=Math.floor(min.z);z<max.z;z++)
        if(this.cells.has(keyOf(x,y,z)) && touches({x,y,z}))return true;
    } else for(const at of this.world.indexedEdits(this.chunks,min,max))if(touches(at))return true;
    return false;
  }
}
