import { playerBounds } from './voxel-world.js';
import { quantity } from './inventory.js';
const position = p => ({ x: p.x, y: p.y, z: p.z });
const lotCount = (lots, time) => lots.reduce((sum, lot) => sum + (lot.expires > time + 1e-8 ? lot.count : 0n), 0n);
export function pickupBounds(player) {
  const { min, max } = playerBounds(player);
  return { min: { x: min.x - 1, y: min.y - .5, z: min.z - 1 }, max: { x: max.x + 1, y: max.y + .5, z: max.z + 1 } };
}
export const mergeEase = t => { t = Math.max(0, Math.min(1, t)); return t * t * (3 - 2 * t); };

export class DroppedItems {
  constructor(world, inventory) {
    Object.assign(this, { world, inventory }); this.time = 0; this.piles = []; this.serial = 0; this.transitions = [];
  }
  spawn(id, count, location, { thrown = false, velocity = {} } = {}) {
    count = quantity(count);
    if (count <= 0n) return;
    const pile = { id: ++this.serial, item: id, ...location, previous: position(location), born: this.time,
      phase: (this.serial * 2.3999632297) % (2 * Math.PI), count, thrown,
      vx: velocity.x ?? 0, vy: velocity.y ?? .08, vz: velocity.z ?? 0,
      lots: [{ count, expires: this.time + 300, pickup: this.time + (thrown ? 2 : 0) }] };
    // Thrown items get their launch physics before joining a nearby pile.
    const target = !thrown && this.piles.filter(p => p.item === id && Math.hypot(p.x - pile.x, p.y - pile.y, p.z - pile.z) <= 2)
      .sort((a, b) => a.count > b.count ? -1 : a.count < b.count ? 1 : a.id - b.id)[0];
    this.piles.push(pile);
    if (target) return pile.count > target.count ? this.merge(target, pile) : this.merge(pile, target);
    return pile;
  }
  merge(source, target) {
    if (source === target || !this.piles.includes(source) || !this.piles.includes(target) || source.item !== target.item) return target;
    // Authoritative ownership transfers exactly once, immediately. Effects only
    // reference the transferred lots for their current visual count.
    for (const effect of this.transitions) if (effect.targetId === source.id && effect.ends > this.time) {
      const t = mergeEase((this.time - effect.started) / (effect.ends - effect.started));
      const at = source.previous ?? source;
      effect.from = { x: effect.from.x + (at.x - effect.from.x) * t,
        y: effect.from.y + (at.y - effect.from.y) * t, z: effect.from.z + (at.z - effect.from.z) * t };
      effect.started = Math.max(this.time, effect.flight?.ends ?? 0); effect.targetId = target.id;
    }
    let from = position(source.previous ?? source), flight = null;
    if (source.thrown && this.time - source.born < .15) {
      // A first-tick merge transfers ownership now, but its bounded cosmetic
      // ghost briefly continues the launch before converging. No second item.
      const ghost = { ...source };
      for (let i = 0; i < 2; i++) {
        const motion = this.world?.movePlayer({ ...ghost, size: 1 }, { x: ghost.vx, y: ghost.vy, z: ghost.vz }, .125, .25)
          ?? { x: ghost.x + ghost.vx, y: ghost.y + ghost.vy, z: ghost.z + ghost.vz, blocked: {}, grounded: false };
        Object.assign(ghost, { x: motion.x, y: motion.y, z: motion.z,
          vx: motion.blocked.x ? 0 : ghost.vx * .98, vz: motion.blocked.z ? 0 : ghost.vz * .98,
          vy: motion.blocked.y ? 0 : (ghost.vy - .04) * .98 });
      }
      flight = { from, started: this.time, ends: this.time + .15 };
      from = position(ghost);
    }
    const started = flight?.ends ?? this.time;
    this.transitions.push({ id: source.id, targetId: target.id, from, flight,
      started, ends: started + .25, born: source.born, phase: source.phase, count: source.count, lots: [...source.lots] });
    if (this.transitions.length > 64) this.transitions.shift();
    target.lots.push(...source.lots); target.count += source.count;
    source.lots = []; source.count = 0n;
    this.piles = this.piles.filter(p => p !== source);
    return target;
  }
  step(player) {
    this.time += .05;
    const bounds = pickupBounds(player);
    for (const pile of this.piles) {
      pile.lots = pile.lots.filter(l => l.expires > this.time + 1e-8);
      pile.count = lotCount(pile.lots, this.time);
      if (!pile.lots.length) continue;
      pile.previous = position(pile);
      const oldVy = pile.vy;
      const motion = this.world?.movePlayer({ ...pile, size: 1 }, { x: pile.vx, y: pile.vy, z: pile.vz }, .125, .25)
        ?? { ...pile, blocked: {}, grounded: false };
      pile.x = motion.x; pile.y = motion.y; pile.z = motion.z;
      pile.vx = motion.blocked.x ? 0 : pile.vx * (motion.grounded ? .6 : .98);
      pile.vz = motion.blocked.z ? 0 : pile.vz * (motion.grounded ? .6 : .98);
      const bounce = oldVy < 0 ? -oldVy * .2 : 0;
      pile.vy = motion.blocked.y ? (bounce >= .02 ? bounce : 0) : (oldVy - .04) * .98;
      const touches = pile.x + .125 > bounds.min.x && pile.x - .125 < bounds.max.x
        && pile.y + .25 > bounds.min.y && pile.y < bounds.max.y
        && pile.z + .125 > bounds.min.z && pile.z - .125 < bounds.max.z;
      if (touches && this.inventory.capacity(pile.item)) {
        for (const lot of pile.lots) if (lot.pickup <= this.time + 1e-8 && lot.count) lot.count = this.inventory.insert(pile.item, lot.count);
        pile.lots = pile.lots.filter(l => l.count > 0n); pile.count = lotCount(pile.lots, this.time);
      }
    }
    this.piles = this.piles.filter(p => p.lots.length);
    // Largest piles lead each spatial bucket. Small piles move visually into
    // them; merged lots retain their original pickup and despawn deadlines.
    const buckets = new Map();
    const sorted = [...this.piles].sort((a, b) => a.count > b.count ? -1 : a.count < b.count ? 1 : a.id - b.id);
    for (const pile of sorted) {
      const cx = Math.floor(pile.x / 2), cy = Math.floor(pile.y / 2), cz = Math.floor(pile.z / 2);
      let target;
      for (let x = cx - 1; x <= cx + 1 && !target; x++) for (let y = cy - 1; y <= cy + 1 && !target; y++) for (let z = cz - 1; z <= cz + 1 && !target; z++) {
        target = buckets.get(`${pile.item}:${x},${y},${z}`)?.find(p => Math.hypot(p.x - pile.x, p.y - pile.y, p.z - pile.z) <= 2);
      }
      if (target) this.merge(pile, target);
      else {
        const key = `${pile.item}:${cx},${cy},${cz}`;
        if (!buckets.has(key)) buckets.set(key, []);
        buckets.get(key).push(pile);
      }
    }
    const live = new Set(this.piles.map(p => p.id));
    this.transitions = this.transitions.filter(effect => {
      effect.count = lotCount(effect.lots, this.time);
      return effect.ends > this.time + 1e-8 && live.has(effect.targetId) && effect.count > 0n;
    });
  }
  total() { return this.piles.reduce((sum, p) => sum + p.lots.reduce((n, l) => n + l.count, 0n), 0n); }
}
