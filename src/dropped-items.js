import { playerBounds } from './voxel-world.js';
import { quantity } from './inventory.js';

export class DroppedItems {
  constructor(world, inventory) { Object.assign(this, { world, inventory }); this.time = 0; this.piles = []; this.serial = 0; }
  spawn(id, count, position, { thrown = false, velocity = {} } = {}) {
    count = quantity(count);
    if (count <= 0n) return;
    let pile = this.piles.find(p => p.item === id && Math.hypot(p.x - position.x, p.y - position.y, p.z - position.z) <= 2);
    if (!pile) {
      pile = { id: ++this.serial, item: id, ...position, vx: velocity.x ?? 0, vy: velocity.y ?? .08, vz: velocity.z ?? 0, lots: [] };
      this.piles.push(pile);
    }
    const expires = this.time + 300, pickup = this.time + (thrown ? .5 : 0);
    const lot = pile.lots.find(l => l.expires === expires && l.pickup === pickup);
    if (lot) lot.count += count;
    else pile.lots.push({ count, expires, pickup });
    return pile;
  }
  step(player) {
    this.time += .05;
    const bounds = playerBounds(player);
    for (const pile of this.piles) {
      pile.lots = pile.lots.filter(l => l.expires > this.time + 1e-8);
      if (!pile.lots.length) continue;
      const motion = this.world?.movePlayer({ ...pile, size: 1 }, { x: pile.vx, y: pile.vy, z: pile.vz }, .125, .25)
        ?? { ...pile, blocked: {}, grounded: false };
      pile.x = motion.x; pile.y = motion.y; pile.z = motion.z;
      pile.vx = motion.blocked.x ? 0 : pile.vx * (motion.grounded ? .6 : .98);
      pile.vz = motion.blocked.z ? 0 : pile.vz * (motion.grounded ? .6 : .98);
      pile.vy = motion.blocked.y ? 0 : (pile.vy - .04) * .98;
      const touches = pile.x + .125 > bounds.min.x && pile.x - .125 < bounds.max.x
        && pile.y + .25 > bounds.min.y && pile.y < bounds.max.y
        && pile.z + .125 > bounds.min.z && pile.z - .125 < bounds.max.z;
      if (touches && this.inventory.capacity(pile.item)) {
        for (const lot of pile.lots) if (lot.pickup <= this.time + 1e-8 && lot.count) lot.count = this.inventory.insert(pile.item, lot.count);
        pile.lots = pile.lots.filter(l => l.count > 0n);
      }
    }
    this.piles = this.piles.filter(p => p.lots.length);
    // Spatial buckets keep nearby compatible piles merged without an all-pairs
    // simulation. Quantities keep individual expiry/pickup times after merging.
    const buckets = new Map(), merged = [];
    for (const pile of this.piles) {
      const cx = Math.floor(pile.x / 2), cy = Math.floor(pile.y / 2), cz = Math.floor(pile.z / 2);
      let target;
      for (let x = cx - 1; x <= cx + 1 && !target; x++) for (let y = cy - 1; y <= cy + 1 && !target; y++) for (let z = cz - 1; z <= cz + 1 && !target; z++) {
        target = buckets.get(`${pile.item}:${x},${y},${z}`)?.find(p => Math.hypot(p.x - pile.x, p.y - pile.y, p.z - pile.z) <= 2);
      }
      if (target) target.lots.push(...pile.lots);
      else {
        const key = `${pile.item}:${cx},${cy},${cz}`;
        if (!buckets.has(key)) buckets.set(key, []);
        buckets.get(key).push(pile); merged.push(pile);
      }
    }
    this.piles = merged;
  }
  total() { return this.piles.reduce((sum, p) => sum + p.lots.reduce((n, l) => n + l.count, 0n), 0n); }
}
