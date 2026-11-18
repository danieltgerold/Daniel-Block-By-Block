export const CHUNK_SIZE = 16;
export const PLAYER_HALF_WIDTH = 0.3;
import { BLOCK_TYPES, blockDrops } from './block-types.js';
import { worldBoxes, fullCube, blockOpaque, stairShapeAt, DIRECTIONS } from './block-shapes.js';
import { FurnaceEntity } from './smelting.js';
import { FluidSystem } from './fluid-system.js';
import { waterHeight } from './fluid-surface.js';
export const BLOCK_REACH = 4.5;
const EPSILON = 1e-7;
const AXES = ['x', 'y', 'z'];
const sameState = (a, b) => Object.keys(a).length === Object.keys(b).length && Object.keys(a).every(key => Object.is(a[key], b[key]));
export const chunkKey = (x, z) => `${x},${z}`;
const blockKey = (x, y, z) => `${x},${y},${z}`;
const tolerance = (min, max) => Math.min(EPSILON, Math.max(0, max - min) * 1e-6);
const overlaps = (min, max, block) => AXES.every(axis => max[axis] > block[axis] + tolerance(min[axis], max[axis])
  && min[axis] < block[axis] + 1 - tolerance(min[axis], max[axis]));
const boxOverlap = (min, max, box) => AXES.every(a => max[a] > box.min[a] + tolerance(min[a], max[a]) && min[a] < box.max[a] - tolerance(min[a], max[a]));
export function playerBounds(player, halfWidth = 0.3 * (player.size ?? 1), height = (player.crouching ? 1.5 : 1.8) * (player.size ?? 1)) {
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
  constructor({ depth = 3, random = Math.random } = {}) {
    this.depth = depth; this.chunkEdits = new Map(); this.removedCount = 0;
    this.random = random; this.behaviorBlocks = new Map(); this.behaviorTime = 0; this.listeners = new Set();
    this.furnaces = new Map(); this.tickRemainder = 0; this.pendingDrops = []; this.changingDoors = false; this.loading = false;
    this.fluids = new FluidSystem(this);
    this.solidChunks = new Map(); this.removedChunks = new Map(); this.sourceChunks = new Map();
    this.boundsCache = new Map(); this.boxCaches = { collision: new WeakMap(), selection: new WeakMap() };
  }
  *edits() { for (const edits of this.chunkEdits.values()) yield* edits.values(); }
  *editsInChunk(cx, cz) { yield* this.chunkEdits.get(chunkKey(cx, cz))?.values() ?? []; }
  *solidEditsInChunk(cx, cz) { yield* this.solidChunks.get(chunkKey(cx, cz))?.values() ?? []; }
  indexEdit(index, chunk, key, edit) {
    if (edit) { if (!index.has(chunk)) index.set(chunk, new Map()); index.get(chunk).set(key, edit); }
    else { const entries = index.get(chunk); entries?.delete(key); if (entries?.size === 0) index.delete(chunk); }
  }
  *indexedEdits(index, min = null, max = null) {
    if (!index.size) return;
    const matches = e => !min || e.x + 1 >= min.x - EPSILON && e.x <= max.x + EPSILON && e.z + 1 >= min.z - EPSILON && e.z <= max.z + EPSILON && e.y + 1.5 >= min.y - EPSILON && e.y <= max.y + EPSILON;
    if (min) {
      const x0 = Math.floor((min.x - EPSILON) / CHUNK_SIZE), x1 = Math.floor((max.x + EPSILON) / CHUNK_SIZE), z0 = Math.floor((min.z - EPSILON) / CHUNK_SIZE), z1 = Math.floor((max.z + EPSILON) / CHUNK_SIZE);
      const count = (x1 - x0 + 1) * (z1 - z0 + 1);
      // Small local queries visit their chunks directly; huge developer-mode
      // sweeps visit occupied index chunks, never enormous empty ranges.
      if (count <= Math.max(16, index.size * 2) && [x0, x1, z0, z1].every(Number.isSafeInteger)) {
        for (let x = x0; x <= x1; x++) for (let z = z0; z <= z1; z++) for (const e of index.get(chunkKey(x, z))?.values() ?? []) if (matches(e)) yield e;
        return;
      }
    }
    for (const entries of index.values()) for (const e of entries.values()) if (matches(e)) yield e;
  }
  boxesFor(block, kind = 'collision') {
    if (block.definition.collisionShape === 'fence') return worldBoxes(block, kind, this);
    const cache = this.boxCaches[kind]; if (!cache.has(block)) cache.set(block, worldBoxes(block, kind, this));
    return cache.get(block);
  }
  blockIdAt(x, y, z) {
    const edit = this.chunkEdits.get(chunkKey(Math.floor(x / CHUNK_SIZE), Math.floor(z / CHUNK_SIZE)))?.get(blockKey(x, y, z));
    // Old boolean occupancy entries are still Test Blocks, including old ground.
    return edit ? (edit.id === undefined ? (edit.solid ? 'test.block' : null) : edit.id)
      : y >= -this.depth && y < 0 ? 'test.block' : null;
  }
  hasBlock(x, y, z) { return this.blockIdAt(x, y, z) !== null; }
  isReplaceable(x, y, z) { return !this.hasBlock(x, y, z) || this.blockIdAt(x, y, z) === 'water'; }
  isOpaqueSolid(x, y, z) {
    return blockOpaque(this.blockAt(x, y, z));
  }
  subscribe(listener) { this.listeners.add(listener); return () => this.listeners.delete(listener); }
  blockStateAt(x, y, z) {
    const edit = this.chunkEdits.get(chunkKey(Math.floor(x / CHUNK_SIZE), Math.floor(z / CHUNK_SIZE)))?.get(blockKey(x, y, z));
    return edit?.state ?? BLOCK_TYPES.get(this.blockIdAt(x, y, z))?.defaultState ?? {};
  }
  setBlock(x, y, z, value, properties = {}) {
    if (![x, y, z].every(Number.isSafeInteger)) return false;
    const id = value === true ? 'test.block' : value === false || value === null ? null : value;
    const definition = BLOCK_TYPES.get(id);
    if (id !== null && !definition) return false;
    const previousId = this.blockIdAt(x, y, z), previousState = this.blockStateAt(x, y, z);
    const state = Object.freeze(id === null ? {} : { ...definition.defaultState, ...properties });
    if (previousId === id && sameState(this.blockStateAt(x, y, z), state)) return false;
    const solid = Boolean(definition?.solid);
    const previous = BLOCK_TYPES.get(previousId);
    const previousFull = fullCube({ definition: previous ?? {}, state: this.blockStateAt(x, y, z) });
    const nextFull = fullCube({ definition: definition ?? {}, state });
    const key = chunkKey(Math.floor(x / CHUNK_SIZE), Math.floor(z / CHUNK_SIZE));
    let edits = this.chunkEdits.get(key);
    const isDefault = y >= -this.depth && y < 0;
    if (isDefault) this.removedCount += Number(previousFull) - Number(nextFull);
    const coordinateKey = blockKey(x, y, z);
    const waterLevelOnly = id === 'water' && previousId === 'water';
    if (previousId === 'furnace' && id !== 'furnace') {
      const entity = this.furnaces.get(coordinateKey); this.furnaces.delete(coordinateKey);
      if (entity) {
        const contents = entity.slots.filter(Boolean); entity.slots = [null, null, null]; entity.removed = true;
        if (!this.loading) for (const stack of contents) this.emitDrop(stack, { x: x + .5, y: y + .25, z: z + .5 });
        entity.changed();
      }
    }
    if (id === 'furnace' && !this.furnaces.has(coordinateKey)) this.furnaces.set(coordinateKey, new FurnaceEntity());
    if (id === (isDefault ? 'test.block' : null) && !Object.keys(state).length) {
      edits?.delete(blockKey(x, y, z));
      if (edits?.size === 0) this.chunkEdits.delete(key);
    } else {
      if (!edits) { edits = new Map(); this.chunkEdits.set(key, edits); }
      const edit = { x, y, z, id, solid, state, ...(id === 'furnace' ? { furnace: this.furnaces.get(coordinateKey) } : {}) };
      Object.defineProperty(edit, 'definition', { value: definition }); // Runtime cache; save format is unchanged.
      edits.set(coordinateKey, edit);
    }
    const edit = edits?.get(coordinateKey);
    this.indexEdit(this.solidChunks, key, coordinateKey, solid ? edit : null);
    this.indexEdit(this.removedChunks, key, coordinateKey, isDefault && !nextFull ? edit : null);
    this.indexEdit(this.sourceChunks, key, coordinateKey, id === 'water' && !state.falling && state.level === 0 ? edit : null);
    const cachedBounds = this.boundsCache.get(key);
    if (cachedBounds) {
      if (Boolean(previous?.solid) !== solid) { cachedBounds.terrain = null; cachedBounds.all = null; }
      else if ((previousId === 'water') !== (id === 'water')) cachedBounds.all = null;
    }
    this.fluids.invalidate?.(x, y, z);
    this.behaviorBlocks.delete(coordinateKey);
    if (definition?.behavior) this.behaviorBlocks.set(coordinateKey, { x, y, z });
    for (const listener of this.listeners) listener({ x, y, z, id, previousId, state, previousState });
    if (!waterLevelOnly) for (const [dx, dy, dz] of [[0, 0, 0], [1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]]) {
      const block = this.blockAt(x + dx, y + dy, z + dz);
      block?.definition.behavior?.neighborChanged?.(this, block);
      if (!this.changingDoors && block?.definition.collisionShape === 'door') this.checkDoor(block);
    }
    if (!this.loading && !this.updatingStairs && (previous?.collisionShape === 'stairs' || definition?.collisionShape === 'stairs')) this.updateStairs(x, y, z);
    const fluidTopologyChanged = id === 'water' || previousId === 'water' || Boolean(id) !== Boolean(previousId) || solid !== Boolean(previous?.solid);
    if (fluidTopologyChanged && (id === 'water' || previousId === 'water' || this.fluids.affected(x, y, z))) this.fluids.changed(x, y, z);
    if (!this.solidChunks.has(key) && !this.fluids.chunks.has(key)) this.boundsCache.delete(key);
    return true;
  }
  updateStairs(x, y, z) {
    const guard = this.updatingStairs; this.updatingStairs = true;
    for (const [dx, , dz] of [[0, 0, 0], ...Object.values(DIRECTIONS)]) {
      const block = this.blockAt(x + dx, y, z + dz);
      if (block?.definition.collisionShape !== 'stairs') continue;
      const shape = stairShapeAt(block, this);
      if (shape !== block.state.shape) this.setBlock(block.x, block.y, block.z, block.id, { ...block.state, shape });
    }
    this.updatingStairs = guard;
  }
  blockAt(x, y, z) {
    const edit = this.chunkEdits.get(chunkKey(Math.floor(x / CHUNK_SIZE), Math.floor(z / CHUNK_SIZE)))?.get(blockKey(x, y, z));
    if (edit) return edit.id === null ? null : edit;
    if (y < -this.depth || y >= 0) return null;
    const definition = BLOCK_TYPES.get('test.block'); return { x, y, z, id: 'test.block', definition, state: definition.defaultState };
  }
  // Migration entry point for old {solid:true/false} and current typed edits.
  loadEdits(entries) {
    const changing = this.changingDoors; this.changingDoors = true; this.loading = true;
    for (const edit of entries) {
      this.setBlock(edit.x, edit.y, edit.z, edit.id === undefined ? edit.solid : edit.id, edit.state);
      if (edit.furnace && this.blockIdAt(edit.x, edit.y, edit.z) === 'furnace') {
        const entity = new FurnaceEntity(edit.furnace);
        this.furnaces.set(blockKey(edit.x, edit.y, edit.z), entity);
        this.chunkEdits.get(chunkKey(Math.floor(edit.x / CHUNK_SIZE), Math.floor(edit.z / CHUNK_SIZE))).get(blockKey(edit.x, edit.y, edit.z)).furnace = entity;
      }
    }
    this.changingDoors = changing; this.loading = false;
    for (const edit of [...this.edits()]) if (this.blockAt(edit.x, edit.y, edit.z)?.definition.collisionShape === 'stairs') this.updateStairs(edit.x, edit.y, edit.z);
    this.updateArea();
    for (const edit of [...this.edits()]) if (this.blockAt(edit.x, edit.y, edit.z)?.definition.collisionShape === 'door') this.checkDoor(this.blockAt(edit.x, edit.y, edit.z));
  }
  save() { return { version: 2, depth: this.depth, edits: [...this.edits()].map(e => ({ ...e, ...(e.furnace ? { furnace: e.furnace.toJSON() } : {}) })) }; }
  load(saved) {
    const old = [...this.edits()];
    for (const entity of this.furnaces.values()) { entity.removed = true; entity.changed(); }
    this.depth = saved.depth ?? this.depth; this.chunkEdits.clear(); this.furnaces.clear(); this.behaviorBlocks.clear();
    this.fluids = new FluidSystem(this);
    this.solidChunks.clear(); this.removedChunks.clear(); this.sourceChunks.clear(); this.boundsCache.clear();
    this.removedCount = 0; this.pendingDrops = []; this.tickRemainder = 0; this.loadEdits(saved.edits ?? saved);
    for (const at of old) for (const listener of this.listeners) listener({ x: at.x, y: at.y, z: at.z, id: this.blockIdAt(at.x, at.y, at.z), previousId: at.id, previousState: at.state });
  }
  furnaceAt(x, y, z) { return this.furnaces.get(blockKey(x, y, z)); }
  emitDrop(stack, at) { if (this.onDrop) this.onDrop(stack, at); else this.pendingDrops.push({ stack: { ...stack }, at: { ...at } }); }
  *collisionBoxes(min = null, max = null) { for (const edit of this.indexedEdits(this.solidChunks, min, max)) yield* this.boxesFor(edit); }
  topSupport(x, y, z) { const block = this.blockAt(x, y, z); return fullCube(block) || block?.definition.collisionShape === 'slab' && block.state.type === 'top'
    || block?.definition.collisionShape === 'stairs' && block.state.half === 'top'; }
  removeDoor(block) {
    const y = block.y - (block.state.half === 'upper' ? 1 : 0), guard = this.changingDoors;
    this.changingDoors = true;
    for (const dy of [0, 1]) if (this.blockIdAt(block.x, y + dy, block.z) === block.id) this.setBlock(block.x, y + dy, block.z, false);
    this.changingDoors = guard;
  }
  checkDoor(block) {
    if (this.changingDoors || this.blockIdAt(block.x, block.y, block.z) !== block.id) return;
    const y = block.y - (block.state.half === 'upper' ? 1 : 0), lower = this.blockAt(block.x, y, block.z), upper = this.blockAt(block.x, y + 1, block.z);
    if (lower?.id === block.id && upper?.id === block.id && lower.state.half === 'lower' && upper.state.half === 'upper' && this.topSupport(block.x, y - 1, block.z)) {
      if (['facing', 'hinge', 'open'].some(key => lower.state[key] !== upper.state[key])) {
        this.changingDoors = true; this.setBlock(block.x, y + 1, block.z, block.id, { ...lower.state, half: 'upper' }); this.changingDoors = false;
      }
      return;
    }
    this.removeDoor(block);
    if (this.getGameMode?.() !== 'creative') this.emitDrop({ id: block.id, count: 1 }, { x: block.x + .5, y: y + .25, z: block.z + .5 });
  }
  toggleDoor(block) {
    const y = block.y - (block.state.half === 'upper' ? 1 : 0), guard = this.changingDoors; this.changingDoors = true;
    for (const dy of [0, 1]) this.setBlock(block.x, y + dy, block.z, block.id, { ...block.state, half: dy ? 'upper' : 'lower', open: !block.state.open });
    this.changingDoors = guard; return true;
  }
  destroyBlock(x, y, z, context = {}) {
    const block = this.blockAt(x, y, z); if (!block) return false;
    if (block.definition.collisionShape === 'door') this.removeDoor(block); else this.setBlock(x, y, z, false);
    for (const drop of blockDrops(block, context)) this.emitDrop(drop, { x: x + .5, y: y + .25, z: z + .5 });
    return true;
  }
  updateArea(min = { x: -Infinity, y: -Infinity, z: -Infinity }, max = { x: Infinity, y: Infinity, z: Infinity }) {
    for (const at of [...this.behaviorBlocks.values()]) if (AXES.every(a => at[a] >= min[a] && at[a] <= max[a])) {
      const block = this.blockAt(at.x, at.y, at.z);
      block?.definition.behavior?.neighborChanged?.(this, block);
    }
  }
  step(seconds) {
    this.tickRemainder += seconds * 20;
    while (this.tickRemainder + 1e-9 >= 1) {
      this.tickRemainder -= 1;
      this.fluids.tick();
      for (const [key, entity] of this.furnaces) {
        entity.tick();
        const [x, y, z] = key.split(',').map(Number), block = this.blockAt(x, y, z);
        if (block?.state.lit !== (entity.burnTime > 0)) {
          if (block?.id === 'furnace') this.setBlock(x, y, z, 'furnace', { ...block.state, lit: entity.burnTime > 0 });
        }
      }
    }
    this.behaviorTime += seconds;
    while (this.behaviorTime + 1e-9 >= 1) {
      this.behaviorTime -= 1;
      // Snapshot prevents newly spread grass spreading again in this same second.
      for (const at of [...this.behaviorBlocks.values()]) {
        const block = this.blockAt(at.x, at.y, at.z);
        block?.definition.behavior?.tick?.(this, block, this.random);
      }
    }
  }
  supportingBlock(player, depth = .2) {
    const { min, max } = playerBounds(player);
    const low = Math.ceil(player.y - depth - EPSILON) - 1, high = Math.floor(player.y + EPSILON) - 1;
    let best = null, distance = Infinity;
    const consider = (x, y, z) => {
      const block = this.blockAt(x, y, z); if (!block) return;
      for (const box of worldBoxes(block, 'collision', this)) {
        if (box.max.y > player.y + EPSILON || box.max.y < player.y - depth - EPSILON
          || min.x >= box.max.x - EPSILON || max.x <= box.min.x + EPSILON || min.z >= box.max.z - EPSILON || max.z <= box.min.z + EPSILON) continue;
        const d = Math.max(box.min.x - player.x, 0, player.x - box.max.x) ** 2 + Math.max(box.min.z - player.z, 0, player.z - box.max.z) ** 2;
        if (d < distance) { best = block; distance = d; }
      }
    };
    for (let y = Math.max(low, -this.depth); y <= Math.min(high, -1); y++) consider(Math.floor(player.x), y, Math.floor(player.z));
    if (distance === 0) return best;
    for (const edit of this.indexedEdits(this.solidChunks, { ...min, y: player.y - depth - EPSILON }, { ...max, y: player.y })) consider(edit.x, edit.y, edit.z);
    // Bound the scan by stored removals, even at very large /size values.
    const x0 = Math.floor(min.x + EPSILON), x1 = Math.floor(max.x - EPSILON), z0 = Math.floor(min.z + EPSILON), z1 = Math.floor(max.z - EPSILON);
    if ([x0, x1, z0, z1].every(Number.isSafeInteger)) {
      for (let y = Math.max(low, -this.depth); y <= Math.min(high, -1); y++) {
        let left = this.removedCount + 1;
        for (let z = z0; z <= z1 && left > 0; z++) for (let x = x0; x <= x1 && left-- > 0; x++) consider(x, y, z);
      }
    }
    return best;
  }
  chunkBounds(cx, cz, includeWater = true) {
    const key = chunkKey(cx, cz); let cached = this.boundsCache.get(key);
    if (!this.solidChunks.has(key) && !this.fluids.chunks.has(key)) {
      this.boundsCache.delete(key);
      if (this.baseBounds?.minY !== -this.depth) this.baseBounds = { minY: -this.depth, maxY: 0 };
      return this.baseBounds;
    }
    if (!cached) { cached = { terrain: null, all: null }; this.boundsCache.set(key, cached); }
    if (!cached.terrain) {
      let minY = -this.depth, maxY = 0;
      for (const edit of this.solidChunks.get(key)?.values() ?? []) { minY = Math.min(minY, edit.y); maxY = Math.max(maxY, edit.y + 1); }
      cached.terrain = { minY, maxY };
    }
    if (!includeWater) return cached.terrain;
    if (!cached.all) {
      let { minY, maxY } = cached.terrain;
      for (const at of this.fluids.chunks.get(key)?.values() ?? []) { minY = Math.min(minY, at.y); maxY = Math.max(maxY, at.y + 1); }
      cached.all = { minY, maxY };
    }
    return cached.all;
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
    for (const edit of this.indexedEdits(this.removedChunks, clippedMin, clippedMax)) if (AXES.every(a => edit[a] >= low[a] && edit[a] <= high[a])) removed++;
    return cells > removed;
  }
  hasSolidInBox(min, max) {
    if (AXES.some(axis => max[axis] <= min[axis])) return false;
    if (this.baseSolidInBox(min, max)) return true;
    for (const box of this.collisionBoxes(min, max)) if (boxOverlap(min, max, box)) return true;
    return false;
  }
  intersectsPlayer(player, size = player.size ?? 1) {
    const { min, max } = playerBounds({ ...player, size });
    return this.hasSolidInBox(min, max);
  }
  canFitBlock(block, players = []) {
    return !players.some(player => { const { min, max } = playerBounds(player); return worldBoxes(block, 'collision', this).some(box => boxOverlap(min, max, box)); });
  }
  canPlaceBlock(x, y, z, players = [], id = 'test.block', state = {}) {
    return [x, y, z].every(Number.isSafeInteger) && this.isReplaceable(x, y, z)
      && this.canFitBlock({ x, y, z, id, state, definition: BLOCK_TYPES.get(id) }, players);
  }
  raycast(origin, direction, reach = BLOCK_REACH, options = {}) {
    const hit = this.raycastRaw(origin, direction, reach, options);
    if (hit) { const length = Math.hypot(direction.x, direction.y, direction.z); hit.point = Object.fromEntries(AXES.map(a => [a, origin[a] + direction[a] / length * hit.distance])); }
    return hit;
  }
  raycastRaw(origin, direction, reach = BLOCK_REACH, options = {}) {
    const length = Math.hypot(direction.x, direction.y, direction.z);
    if (!length || reach < 0) return null;
    const d = Object.fromEntries(AXES.map(a => [a, direction[a] / length]));
    let best = null;
    const min = {}, max = {};
    for (const a of AXES) { const end = origin[a] + d[a] * reach; min[a] = Math.min(origin[a], end); max[a] = Math.max(origin[a], end); }
    const candidates = function* (world) { yield* world.indexedEdits(world.solidChunks, min, max); if (options.waterSources) yield* world.indexedEdits(world.sourceChunks, min, max); };
    for (const edit of candidates(this)) {
      const block = edit;
      const boxes = edit.id === 'water' ? [{ min: { x: edit.x, y: edit.y, z: edit.z }, max: { x: edit.x + 1, y: edit.y + waterHeight(block), z: edit.z + 1 } }]
        : this.boxesFor(block, 'selection');
      for (const box of boxes) {
        const hit = rayBox(origin, d, box.min, box.max, best?.distance ?? reach);
        if (hit && (!best || hit.distance < best.distance)) best = { ...hit, x: edit.x, y: edit.y, z: edit.z };
      }
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
      if (fullCube(this.blockAt(cell.x, cell.y, cell.z))) return { ...cell, distance, normal };
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
      for (const a of AXES) { min[a] = (block.min?.[a] ?? block[a]) - half; max[a] = (block.max?.[a] ?? block[a] + 1) + half; }
      const hit = rayBox(origin, motion, min, max, fraction);
      if (hit) fraction = Math.max(0, hit.distance - 1e-6);
    };
    const low = {}, high = {};
    for (const a of AXES) {
      low[a] = Math.floor(Math.min(origin[a], origin[a] + motion[a]) - half);
      high[a] = Math.floor(Math.max(origin[a], origin[a] + motion[a]) + half);
    }
    for (const box of this.collisionBoxes(low, high)) test(box);
    if (low.y <= -1 && high.y >= -this.depth) {
      if (![low.x, high.x, low.z, high.z].every(Number.isSafeInteger)) {
        const hit = rayBox(origin, motion, { x: -Infinity, y: -this.depth - half, z: -Infinity },
          { x: Infinity, y: half, z: Infinity }, fraction);
        if (hit) fraction = Math.max(0, hit.distance - 1e-6);
      } else if ((high.x - low.x + 1) * (high.z - low.z + 1) > 4096) {
        // A very long camera sweep must not enumerate empty columns. Terrain
        // occupancy can change only at stored removal/partial-cell boundaries.
        const holes = [...this.indexedEdits(this.removedChunks, low, high)];
        for (let y = Math.max(low.y, -this.depth); y <= Math.min(high.y, -1); y++) {
          let start = 0, end = fraction;
          if (motion.y) { const a = (y - half - origin.y) / motion.y, b = (y + 1 + half - origin.y) / motion.y; start = Math.max(0, Math.min(a, b)); end = Math.min(end, Math.max(a, b)); }
          else if (origin.y < y - half || origin.y > y + 1 + half) continue;
          if (start > end) continue;
          const times = new Set([start, end]);
          for (const hole of holes) if (hole.y === y) for (const axis of ['x', 'z']) if (motion[axis]) {
            for (const face of [hole[axis], hole[axis] + 1]) for (const side of [-1, 1]) {
              const t = (face + side * half - origin[axis]) / motion[axis]; if (t > start && t < end) times.add(t);
            }
          }
          const covered = t => this.baseSolidInBox({ x: origin.x + motion.x * t - half, y, z: origin.z + motion.z * t - half },
            { x: origin.x + motion.x * t + half, y: y + 1, z: origin.z + motion.z * t + half });
          const ordered = [...times].sort((a, b) => a - b);
          if (covered(start)) fraction = Math.min(fraction, Math.max(0, start - 1e-6));
          else for (let i = 1; i < ordered.length; i++) {
            const middle = covered((ordered[i - 1] + ordered[i]) / 2), edge = middle || covered(ordered[i]);
            if (edge) { fraction = Math.min(fraction, Math.max(0, (middle ? ordered[i - 1] : ordered[i]) - 1e-6)); break; }
          }
        }
      } else {
        for (let x = low.x; x <= high.x; x++) for (let z = low.z; z <= high.z; z++)
          for (let y = Math.max(low.y, -this.depth); y <= Math.min(high.y, -1); y++) if (fullCube(this.blockAt(x, y, z))) test({ x, y, z });
      }
    }
    return fraction;
  }
  isSupported(player, halfWidth = 0.3 * (player.size ?? 1)) {
    // Resting contact uses the SAME full footprint as sneaking, but only a
    // contact-thin slab. Nearby support must not turn an airborne player into
    // a grounded one, nor may an embedded foot be mistaken for a block top.
    const depth = Math.min(EPSILON, halfWidth * 1e-3);
    return this.supportProbe(player, depth, halfWidth)
      && !this.supportProbe({ ...player, y: player.y + depth }, depth, halfWidth);
  }
  supportProbe(player, depth = 0.6 * (player.size ?? 1), halfWidth = 0.3 * (player.size ?? 1)) {
    const { min, max } = playerBounds(player, halfWidth);
    return this.hasSolidInBox({ ...min, y: player.y - depth }, { ...max, y: player.y });
  }
  supportedPath(player, dx, dz, depth = 0.6 * (player.size ?? 1)) {
    const at = t => this.supportProbe({ ...player, x: player.x + dx * t, z: player.z + dz * t }, depth);
    if (!at(0) || !at(1)) return false;
    // Subdivide where the footprint crosses voxel faces. Between these times
    // the covered solid cells cannot change. This also catches very narrow
    // unsupported gaps at fractional sizes without arbitrary tiny substeps.
    // Untouched base terrain is horizontally uniform: only stored edits can
    // change support, so work stays bounded even at developer-mode speeds.
    const half = 0.3 * (player.size ?? 1);
    const { min, max } = playerBounds(player);
    const times = new Set([0, 1]);
    const queryMin = { x: Math.min(min.x, min.x + dx), y: player.y - depth, z: Math.min(min.z, min.z + dz) };
    const queryMax = { x: Math.max(max.x, max.x + dx), y: player.y, z: Math.max(max.z, max.z + dz) };
    const boundaries = [...this.indexedEdits(this.removedChunks, queryMin, queryMax)].map(b => ({ min: { x: b.x, y: b.y, z: b.z }, max: { x: b.x + 1, y: b.y + 1, z: b.z + 1 } }));
    for (const block of [...boundaries, ...this.collisionBoxes(queryMin, queryMax)]) {
      if (block.min.y >= player.y || block.max.y <= player.y - depth) continue;
      for (const [axis, delta] of [['x', dx], ['z', dz]]) {
        if (!delta) continue;
        const inset = half - tolerance(min[axis], max[axis]);
        for (const face of [block.min[axis], block.max[axis]]) for (const side of [-1, 1]) {
          const t = (face + side * inset - player[axis]) / delta;
          if (t > 0 && t < 1) times.add(t);
        }
      }
    }
    const ordered = [...times].sort((a, b) => a - b);
    for (let i = 1; i < ordered.length; i++) {
      if (!at(ordered[i]) || !at((ordered[i - 1] + ordered[i]) / 2)) return false;
    }
    return true;
  }
  movePlayer(player, velocity, halfWidth = 0.3 * (player.size ?? 1), height = (player.crouching ? 1.5 : 1.8) * (player.size ?? 1)) {
    const normal = this.moveRaw(player, velocity, halfWidth, height), size = player.size ?? 1;
    const canStep = !player.flying && velocity.y <= 0 && (player.grounded || normal.grounded)
      && Math.abs(halfWidth - .3 * size) < 1e-8 && height >= 1.49 * size;
    if (!canStep || !normal.blocked.x && !normal.blocked.z) return normal;
    // Step height is measured ABOVE THE FEET, independent of block type or
    // total obstacle height. The same swept box handles headroom and walls.
    const footprint = playerBounds(normal, halfWidth, height);
    const tops = [...this.collisionBoxes({ ...footprint.min, y: player.y }, { ...footprint.max, y: player.y + .6 * size })].filter(box => box.max.y > player.y + EPSILON && box.max.y <= player.y + .6 * size + EPSILON
      && ['x', 'z'].every(a => footprint.max[a] >= box.min[a] - EPSILON && footprint.min[a] <= box.max[a] + EPSILON)).map(box => box.max.y);
    // Untouched base terrain has no stored boxes. Include its exposed layer
    // tops too, e.g. stepping out of a bottom slab carved into the ground.
    for (let y = -this.depth; y < 0; y++) if (y + 1 > player.y + EPSILON && y + 1 <= player.y + .6 * size + EPSILON) {
      const min = { x: footprint.min.x - 2 * EPSILON, y, z: footprint.min.z - 2 * EPSILON };
      const max = { x: footprint.max.x + 2 * EPSILON, y: y + 1, z: footprint.max.z + 2 * EPSILON };
      if (this.baseSolidInBox(min, max)) tops.push(y + 1);
    }
    if (!tops.length) return normal;
    const rise = this.moveRaw(player, { x: 0, y: Math.max(...tops) - player.y, z: 0 }, halfWidth, height);
    if (rise.moved.y <= 1e-7) return normal;
    const across = this.moveRaw(rise, { x: velocity.x, y: 0, z: velocity.z }, halfWidth, height);
    const down = this.moveRaw(across, { x: 0, y: -rise.moved.y + velocity.y, z: 0 }, halfWidth, height);
    if ((down.x - player.x) ** 2 + (down.z - player.z) ** 2 <= normal.moved.x ** 2 + normal.moved.z ** 2 + 1e-10) return normal;
    return { ...down, moved: { x: down.x - player.x, y: down.y - player.y, z: down.z - player.z },
      blocked: { x: across.blocked.x, z: across.blocked.z, y: down.blocked.y } };
  }
  moveRaw(player, velocity, halfWidth, height) {
    const p = { x: player.x, y: player.y, z: player.z, size: player.size ?? 1, crouching: player.crouching };
    const moved = { x: 0, y: 0, z: 0 }, blocked = { x: false, y: false, z: false };
    const bounds = playerBounds(p, halfWidth, height), queryMin = {}, queryMax = {};
    for (const a of AXES) { const delta = velocity[a] || 0; queryMin[a] = Math.min(bounds.min[a], bounds.min[a] + delta); queryMax[a] = Math.max(bounds.max[a], bounds.max[a] + delta); }
    const boxes = [...this.collisionBoxes(queryMin, queryMax)];
    for (const axis of ['y', 'x', 'z']) {
      const wanted = velocity[axis];
      if (!wanted) continue;
      const { min, max } = playerBounds(p, halfWidth, height);
      let allowed = wanted;
      const clip = block => {
        if (!AXES.every(other => other === axis || (max[other] > block.min[other] + tolerance(min[other], max[other])
          && min[other] < block.max[other] - tolerance(min[other], max[other])))) return;
        if (wanted > 0 && max[axis] <= block.min[axis] + EPSILON) allowed = Math.min(allowed, block.min[axis] - max[axis]);
        if (wanted < 0 && min[axis] >= block.max[axis] - EPSILON) allowed = Math.max(allowed, block.max[axis] - min[axis]);
      };
      for (const box of boxes) clip(box);
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
      for (let y = -this.depth; y < 0; y++) if (this.hasBlock(x, y, z)) for (const box of worldBoxes(this.blockAt(x, y, z), 'collision', this)) ys.push(box.max.y);
      for (const edit of this.indexedEdits(this.solidChunks, { x, y: -Infinity, z }, { x: x + 1, y: Infinity, z: z + 1 })) if (edit.x === x && edit.z === z) for (const box of this.boxesFor(edit)) ys.push(box.max.y);
      ys.sort((a, b) => b - a);
      for (const y of ys) {
        const p = { x: x + 0.5, y, z: z + 0.5, size };
        if (!this.intersectsPlayer(p)) return p;
      }
    }
    return { x: 16.5, y: 0, z: 16.5, size };
  }
}
