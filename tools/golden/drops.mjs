// Records seeded operation traces on the JS DroppedItems: spawning, piles merging, motion in a small world
// (walls, a pit, water), expiry deadlines and pickup into a real inventory. After each operation every pile is
// written with exact decimals, so Java must reproduce positions, velocities, lots and the inventory bit for bit.
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { DroppedItems } from '../../src/dropped-items.js';
import { PlayerInventory } from '../../src/inventory.js';
import { VoxelWorld } from '../../src/voxel-world.js';
import { formatNumber } from './format.mjs';
import { stackText } from './inventory.mjs';

const lcg = seed => () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
const num = v => v === undefined ? '-' : formatNumber(v);
const opt = t => t === '-' ? undefined : Number(t);

const ITEMS_POOL = ['stone', 'dirt', 'stick', 'coal', 'oak.planks', 'stone.pickaxe', 'water.bucket', 'iron.ingot'];
// A small test world: flat ground (surface at y=4), a wall, a one-block pit, and a pool.
export function dropsWorld() {
  const w = new VoxelWorld();
  for (let y = 4; y <= 6; y++) for (let x = -3; x <= 3; x++) w.setBlock(x, y, 6, 'stone');
  w.setBlock(0, 3, 0, false); w.setBlock(1, 3, 0, false);
  for (let x = 4; x <= 6; x++) for (let z = -1; z <= 1; z++) { w.setBlock(x, 3, z, false); w.setBlock(x, 3, z, 'water'); }
  return w;
}

export function applyDropsOp(ctx, op) {
  const [name, ...a] = op.split(':');
  const { drops, inv } = ctx;
  switch (name) {
    case 'spawn': {
      const [id, count, x, y, z, thrown, vx, vy, vz, damage] = a;
      drops.spawn(id, BigInt(count), { x: Number(x), y: Number(y), z: Number(z) },
        { thrown: thrown === '1', velocity: { x: opt(vx), y: opt(vy), z: opt(vz) }, stack: damage === '-' ? {} : { damage: Number(damage) } });
      return;
    }
    case 'step': {
      const player = { x: Number(a[1]), y: Number(a[2]), z: Number(a[3]), size: Number(a[4]), crouching: a[5] === '1' };
      for (let i = 0; i < Number(a[0]); i++) drops.step(player, { pickup: a[6] !== '0' });
      return;
    }
    case 'give': inv.insert(a[0], Number(a[1])); return;
    case 'block': ctx.world.setBlock(Number(a[0]), Number(a[1]), Number(a[2]), a[3] === '-' ? false : a[3]); return;
    case 'waterlevel': ctx.world.setBlock(Number(a[0]), Number(a[1]), Number(a[2]), 'water', { level: Number(a[3]), falling: a[4] === '1' }); return;
    case 'clear': for (let i = 0; i < 50; i++) inv.slots[i] = null; return;
    default: throw new Error(`unknown op ${op}`);
  }
}

const lotsText = p => p.lots.map(l => `${l.count}@${num(l.expires)}@${num(l.pickup)}`).join(';') || '-';
export function dropsRows(ctx, prefix) {
  const { drops, inv } = ctx;
  const slots = []; for (let i = 0; i < 50; i++) if (inv.slots[i]) slots.push(`${i}:${stackText(inv.slots[i])}`);
  const rows = [`${prefix},S,${num(drops.time)},${drops.total()},${drops.piles.length},${slots.join('|') || '-'},-,-,-,-,-,-,-`];
  for (const p of [...drops.piles].sort((x, y) => x.id - y.id))
    rows.push(`${prefix},P,${p.id},${p.item},${p.stackData.damage ?? 0},${num(p.x)},${num(p.y)},${num(p.z)},${num(p.vx)},${num(p.vy)},${num(p.vz)},${p.count},${lotsText(p)}`);
  return rows;
}

function randomOp(rand) {
  const pick = list => list[Math.floor(rand() * list.length)];
  const n = max => Math.floor(rand() * max);
  const r = rand();
  if (r < 0.34) {
    const id = pick(ITEMS_POOL), thrown = rand() < 0.25;
    const x = pick([0.5, 0.6, 1.5, 2.0, 5.5, -2.5, 3.4]) + (rand() < 0.3 ? rand() : 0), z = pick([0.5, 0.2, 1.5, 5.4, -1.5]);
    const v = thrown ? [num((rand() - 0.5) * 0.4), num(0.1 + rand() * 0.2), num((rand() - 0.5) * 0.4)] : ['-', '-', '-'];
    return `spawn:${id}:${rand() < 0.1 ? 10 ** 15 + n(1000) : 1 + n(rand() < 0.3 ? 90 : 12)}:${num(x)}:${num(pick([4, 4.5, 6, 8, 3.5]))}:${num(z)}:${thrown ? 1 : 0}:${v.join(':')}:${id === 'stone.pickaxe' && rand() < 0.5 ? n(3) : '-'}`;
  }
  if (r < 0.82) return `step:${pick([1, 1, 2, 5, 20, 40])}:${num(pick([0.5, 3, 20, 0.8, 5.5]))}:${num(pick([4, 4, 3.9, 10]))}:${num(pick([0.5, 3, 20, -2]))}:${num(pick([1, 1, 0.5, 2]))}:${n(2)}:${rand() < 0.9 ? 1 : 0}`;
  if (r < 0.90) return `give:${pick(ITEMS_POOL)}:${1 + n(70)}`;
  if (r < 0.94) return `block:${pick([-1, 0, 1, 2, 5])}:${pick([3, 4, 5])}:${pick([0, 1, -1])}:${pick(['-', 'stone', 'water', 'dirt'])}`;
  if (r < 0.97) return 'clear';
  return `step:${pick([60, 100, 200, 400])}:20:4:20:1:0:1`;
}

const DIRECTED = {
  merge: ['spawn:stone:5:0.5:5:0.5:0:-:-:-:-', 'spawn:stone:3:0.9:5:0.5:0:-:-:-:-', 'spawn:stone:7:1.5:5:0.5:0:-:-:-:-', 'spawn:dirt:4:0.5:5:0.5:0:-:-:-:-', 'step:20:20:4:20:1:0:0', 'spawn:stone:2:0.5:4.2:0.5:0:-:-:-:-', 'step:5:20:4:20:1:0:0'],
  thrown: ['spawn:stone:5:0.5:5:0.5:1:0.3:0.2:0:-', 'spawn:stone:5:0.5:5:0.5:1:0:0.2:0.3:-', 'step:1:0.5:4:0.5:1:0:1', 'step:2:0.5:4:0.5:1:0:1', 'step:60:0.5:4:0.5:1:0:1'],
  pickup: ['spawn:stone:70:0.5:4.1:0.5:0:-:-:-:-', 'spawn:coal:5:0.6:4.1:0.5:0:-:-:-:-', 'step:3:0.5:4:0.5:1:0:1', 'step:2:0.5:4:0.5:1:1:1', 'step:50:2:4:0.5:1:0:1'],
  fullInventory: ['give:stone:64', 'step:1:20:4:20:1:0:0', 'spawn:stone:10:0.5:4.1:0.5:0:-:-:-:-', 'step:20:0.5:4:0.5:1:0:1', 'clear', 'step:20:0.5:4:0.5:1:0:1'],
  expiry: ['spawn:stone:4:0.5:4.1:0.5:0:-:-:-:-', 'step:5998:20:4:20:1:0:0', 'step:1:20:4:20:1:0:0', 'step:1:20:4:20:1:0:0', 'step:1:20:4:20:1:0:0', 'spawn:stone:3:0.5:4.1:0.5:0:-:-:-:-', 'step:2000:20:4:20:1:0:0', 'spawn:coal:2:5.5:4.1:0.5:0:-:-:-:-', 'step:4000:20:4:20:1:0:0', 'step:2005:20:4:20:1:0:0'],
  tools: ['spawn:stone.pickaxe:1:0.5:4.1:0.5:0:-:-:-:2', 'spawn:stone.pickaxe:1:0.6:4.1:0.5:0:-:-:-:2', 'step:5:20:4:20:1:0:0', 'step:5:0.5:4:0.5:1:0:1', 'spawn:stone.pickaxe:1:0.5:4.1:0.5:0:-:-:-:-', 'step:5:0.5:4:0.5:1:0:1'],
  physics: ['spawn:stone:1:2.5:10:0.5:0:-:-:-:-', 'spawn:coal:1:5.5:6:0.5:0:-:-:-:-', 'spawn:dirt:1:0.5:5:5.9:0:0.1:0:0.2:-', 'spawn:stick:1:0.5:4.5:0.5:0:-:-:-:-', 'step:10:20:4:20:1:0:0', 'step:40:20:4:20:1:0:0', 'step:100:20:4:20:1:0:0'],
  tieBreak: ['spawn:stone:5:0.5:4.1:0.5:1:0:0.1:0:-', 'spawn:stone:5:1.2:4.1:0.5:1:0:0.1:0:-', 'spawn:stone:2:0.9:4.1:0.5:0:-:-:-:-', 'step:3:20:4:20:1:0:0'],
  rangeEdge: ['spawn:stone:5:0.5:4.1:0.5:0:-:-:-:-', 'spawn:stone:3:2.5:4.1:0.5:0:-:-:-:-', 'spawn:stone:3:0.5:4.1:2.5:0:-:-:-:-', 'spawn:stone:3:2.5001:4.1:0.5:0:-:-:-:-', 'step:2:20:4:20:1:0:0'],
  current: ['waterlevel:5:3:0:3:0', 'waterlevel:6:3:0:1:0', 'waterlevel:4:3:0:6:0', 'waterlevel:5:3:1:2:1', 'spawn:stone:1:5.5:3.5:0.5:0:-:-:-:-', 'spawn:coal:1:4.5:3.4:0.5:0:-:-:-:-', 'spawn:dirt:1:5.5:3.5:1.5:0:-:-:-:-', 'step:30:20:4:20:1:0:0', 'step:60:20:4:20:1:0:0'],
  stepRange: ['spawn:stone:5:0.5:4.1:0.5:1:0:0:0:-', 'spawn:stone:3:2.5:4.1:0.5:1:0:0:0:-', 'spawn:stone:2:4.5:4.1:0.5:1:0:0:0:-', 'step:1:20:4:20:1:0:0', 'step:2:20:4:20:1:0:0'],
  reach: ['spawn:stone:3:-2.5:4.1:0.5:0:-:-:-:-', 'step:40:20:4:20:1:0:0', 'step:1:-2.5:4.7:0.5:1:0:1', 'spawn:coal:3:-2.5:4.1:0.5:0:-:-:-:-', 'step:40:20:4:20:1:0:0', 'step:1:-2.5:4.74:0.5:1:0:1', 'spawn:dirt:3:-2.5:4.1:0.5:0:-:-:-:-', 'step:40:20:4:20:1:0:0', 'step:1:-2.5:4.8:0.5:1:0:1'],
  bounce: ['spawn:stone:1:2.5:12:0.5:0:-:-:-:-', 'step:15:20:4:20:1:0:0', 'step:15:20:4:20:1:0:0', 'step:40:20:4:20:1:0:0'],
};

export function generateDrops(outDir) {
  const dir = join(outDir, 'drops');
  mkdirSync(dir, { recursive: true });
  const out = [];
  const makeCtx = () => { const world = dropsWorld(), inv = new PlayerInventory({}); return { world, inv, drops: new DroppedItems(world, inv) }; };
  for (const seed of [5, 21, 612, 4096]) {
    const rand = lcg(seed), ctx = makeCtx();
    for (let step = 0; step < 320; step++) { const op = randomOp(rand); applyDropsOp(ctx, op); out.push(...dropsRows(ctx, `${seed},${step},${op}`)); }
  }
  for (const [name, ops] of Object.entries(DIRECTED)) {
    const ctx = makeCtx();
    ops.forEach((op, step) => { applyDropsOp(ctx, op); out.push(...dropsRows(ctx, `${name},${step},${op}`)); });
  }
  writeFileSync(join(dir, 'trace.csv'), ['seed,step,op,kind,a,b,c,d,e,f,g,h,i,j,k', ...out].join('\n') + '\n');
}
