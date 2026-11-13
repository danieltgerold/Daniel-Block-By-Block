import { playerBounds } from './voxel-world.js';
import { VISUAL_QUALITY } from './visual-quality.js';

export const PARTICLE_LIMIT = 1024;
export const landingParticleCount = distance => {
  const power = Math.max(0, Math.floor(distance + .000001 - 3));
  return power ? Math.floor(150 * Math.min(.2 + power / 15, 2.5)) : 0;
};
export function cosmeticRandom(seed = Date.now()) {
  let state = seed | 0;
  return () => { state |= 0; state = state + 0x6d2b79f5 | 0; let t = Math.imul(state ^ state >>> 15, 1 | state);
    t ^= t + Math.imul(t ^ t >>> 7, 61 | t); return ((t ^ t >>> 14) >>> 0) / 4294967296; };
}
export function terrainVelocity(input, random) {
  let x = input.x + (random() * .8 - .4), y = input.y + (random() * .8 - .4), z = input.z + (random() * .8 - .4);
  const length = Math.hypot(x, y, z), speed = .4 * .15 * (1 + random() + random());
  if (length > 1e-10) { x *= speed / length; y *= speed / length; z *= speed / length; }
  else x = y = z = 0;
  return { x, y: y + .1, z };
}
export class BlockParticles {
  constructor(world, { quality = null, random = cosmeticRandom(), capacity = PARTICLE_LIMIT } = {}) {
    Object.assign(this, { world, quality, random });
    this.capacity = Math.min(PARTICLE_LIMIT, capacity); this.pool = []; this.active = []; this.free = [];
    this.carry = 0; this.replacement = 0; this.view = null;
  }
  get settings() { return this.quality?.settings ?? VISUAL_QUALITY[0]; }
  setView(view) { this.view = view; }
  distanceSquared(at) {
    const camera = this.view?.position;
    return camera ? (at.x - camera.x) ** 2 + (at.y - camera.y) ** 2 + (at.z - camera.z) ** 2 : 0;
  }
  priority(at) { return this.distanceSquared(at) + (this.view && !this.view.visible(at, 2) ? 100000 : 0); }
  eventCount(requested, at) {
    const { particleDistance: distance, particleFraction: fraction } = this.settings;
    const d2 = this.distanceSquared(at);
    if (d2 > distance * distance || (fraction < 1 && d2 > 64 && this.view && !this.view.visible(at, 2))) return 0;
    this.carry += requested * fraction;
    const count = Math.floor(this.carry + 1e-8); this.carry -= count;
    return count;
  }
  retire(index) {
    const slot = this.active[index]; this.active[index] = this.active.at(-1); this.active.pop(); this.free.push(slot);
  }
  allocate(at) {
    const cap = Math.min(this.capacity, this.settings.particleCap);
    if (this.active.length >= cap) {
      let worst = -1, score = this.priority(at);
      // A small bounded sample favors new nearby/visible effects under load.
      for (let n = 0; n < Math.min(8, this.active.length); n++) {
        const index = (this.replacement++ * 137) % this.active.length, candidate = this.priority(this.pool[this.active[index]]);
        if (candidate > score) { score = candidate; worst = index; }
      }
      if (worst < 0) return null;
      this.retire(worst);
    }
    let slot = this.free.pop();
    if (slot === undefined) {
      slot = this.pool.length;
      if (slot >= this.capacity) return null;
      this.pool.push({ tint: [1, 1, 1] });
    }
    this.active.push(slot); return this.pool[slot];
  }
  spawn(block, at, input, small = false, kind = 'terrain') {
    if (!block?.definition?.particleTexture || block.definition.particles === false || ![at.x, at.y, at.z].every(Number.isFinite)) return null;
    const p = this.allocate(at); if (!p) return null;
    const velocity = terrainVelocity(input, this.random), scale = small ? .6 : 1;
    Object.assign(p, at, { px: at.x, py: at.y, pz: at.z, vx: velocity.x, vy: velocity.y, vz: velocity.z,
      halfSize: (.05 + this.random() * .05) * scale, side: .2 * scale,
      life: Math.floor(4 / (this.random() * .9 + .1)), age: 0,
      u: this.random() * .75, v: this.random() * .75, texture: block.definition.particleTexture, kind });
    const tint = typeof block.definition.particleTint === 'function' ? block.definition.particleTint(block) : block.definition.particleTint ?? [1, 1, 1];
    for (let i = 0; i < 3; i++) p.tint[i] = .6 * tint[i];
    if (small) { p.vx *= .2; p.vz *= .2; p.vy = (p.vy - .1) * .2 + .1; }
    return p;
  }
  step() {
    const cap = Math.min(this.capacity, this.settings.particleCap);
    if (this.active.length > cap) {
      this.active.sort((a, b) => this.priority(this.pool[a]) - this.priority(this.pool[b]));
      while (this.active.length > cap) this.retire(this.active.length - 1);
    }
    for (let i = this.active.length - 1; i >= 0; i--) {
      const p = this.pool[this.active[i]];
      if (++p.age >= p.life) { this.retire(i); continue; }
      p.px = p.x; p.py = p.y; p.pz = p.z; p.vy -= .04;
      const half = p.side / 2;
      const motion = this.world.movePlayer({ x: p.x, y: p.y - half, z: p.z, size: 1 }, { x: p.vx, y: p.vy, z: p.vz }, half, p.side);
      p.x = motion.x; p.y = motion.y + half; p.z = motion.z;
      p.vx = motion.blocked.x ? 0 : p.vx * .98;
      p.vy = motion.blocked.y ? 0 : p.vy * .98;
      p.vz = motion.blocked.z ? 0 : p.vz * .98;
      if (motion.grounded) { p.vx *= .7; p.vz *= .7; }
    }
  }
  breakBlock(block) {
    const count = this.eventCount(64, { x: block.x + .5, y: block.y + .5, z: block.z + .5 });
    for (let i = 0; i < count; i++) {
      // Stratified selection spans the complete 4x4x4 volume at lower quality.
      const sample = Math.min(63, Math.floor((i + this.random()) * 64 / count));
      const cell = sample ^ (sample >>> 2) ^ (sample >>> 4); // Mix spatial axes, retaining all 64 cells at normal quality.
      const x = (Math.floor(cell / 16) + .5) / 4, y = (Math.floor(cell / 4) % 4 + .5) / 4, z = (cell % 4 + .5) / 4;
      this.spawn(block, { x: block.x + x, y: block.y + y, z: block.z + z }, { x: x - .5, y: y - .5, z: z - .5 }, false, 'break');
    }
  }
  gaussian() { return Math.sqrt(-2 * Math.log(Math.max(1e-9, this.random()))) * Math.cos(2 * Math.PI * this.random()); }
  landing(player, block, distance) {
    const count = this.eventCount(landingParticleCount(distance), player), { min, max } = playerBounds(player);
    const x0 = Math.max(min.x, block.x), x1 = Math.min(max.x, block.x + 1), z0 = Math.max(min.z, block.z), z1 = Math.min(max.z, block.z + 1);
    for (let i = 0; i < count; i++) this.spawn(block,
      { x: x0 + this.random() * (x1 - x0), y: player.y + .1, z: z0 + this.random() * (z1 - z0) },
      { x: this.gaussian() * .15, y: this.gaussian() * .15, z: this.gaussian() * .15 }, false, 'landing');
  }
  playerEffects(player) {
    const sprint = player.sprinting && !player.crouching && !player.flying && !player.inWater && !player.inLava && !player.spectator;
    if (!sprint && !player.landingFallDistance) return;
    const block = this.world.supportingBlock(player);
    if (!block || block.definition.particles === false) return;
    if (player.landingFallDistance) this.landing(player, block, player.landingFallDistance);
    if (sprint && this.eventCount(1, player)) {
      const half = .3 * (player.size ?? 1);
      this.spawn(block, { x: player.x + (this.random() * 2 - 1) * half, y: player.y + .1, z: player.z + (this.random() * 2 - 1) * half },
        { x: -4 * player.vx, y: 1.5, z: -4 * player.vz }, false, 'sprint');
    }
  }
  // Future progressive mining may call this; instant breaks only call breakBlock.
  miningHit(block, normal) {
    const at = { x: block.x + .1 + .8 * this.random(), y: block.y + .1 + .8 * this.random(), z: block.z + .1 + .8 * this.random() };
    for (const axis of ['x', 'y', 'z']) if (normal[axis]) at[axis] = block[axis] + (normal[axis] > 0 ? 1.1 : -.1);
    if (this.eventCount(1, at)) return this.spawn(block, at, { x: 0, y: 0, z: 0 }, true, 'hit');
    return null;
  }
}
