// Records seeded traces on the JS FallingBlocks: unsupported sand and gravel scheduling, turning into falling
// entities, stacking in a column, landing (or dropping when the cell is taken or a player stands in it) and timing
// out after 600 ticks. Entities are written in array order with exact decimals.
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { formatNumber } from './format.mjs';
import { applyOp as applyRulesOp, lcg, makeWorld, worldText } from './worldrules.mjs';

const num = formatNumber;
const stateText = state => Object.entries(state ?? {}).map(([k, v]) => `${k}=${v}`).join('|') || '-';

export function makeFallingWorld() {
  const ctx = makeWorld();
  ctx.players = [];
  ctx.world.getPlayers = () => ctx.players;
  return ctx;
}

export function applyOp(ctx, op) {
  const [name, ...a] = op.split(':');
  if (name === 'tick') { for (let i = 0; i < Number(a[0]); i++) ctx.world.falling.tick(); return '-'; }
  if (name === 'players') {
    ctx.players = a[0] === '-' ? [] : a[0].split('|').map(p => { const [x, y, z, size, crouch] = p.split('~'); return { x: Number(x), y: Number(y), z: Number(z), size: Number(size), crouching: crouch === '1' }; });
    return '-';
  }
  return applyRulesOp(ctx, op);
}

export function fallingText(ctx) {
  const f = ctx.world.falling;
  const pending = [...f.pending.values()].map(p => `${p.x}:${p.y}:${p.z}@${p.due}`).join(';') || '-';
  const entities = f.entities.map(e => [e.serial, e.id, stateText(e.state), num(e.x), num(e.y), num(e.z), num(e.vy), e.age].join('~')).join(';') || '-';
  return [`${f.time}:${f.serial}`, pending, entities];
}

function randomOp(rand) {
  const pick = list => list[Math.floor(rand() * list.length)];
  const n = max => Math.floor(rand() * max);
  const r = rand();
  if (r < 0.46) {
    const id = pick(['sand', 'sand', 'gravel', 'stone', 'glass', 'oak.slab', 'oak.fence', 'dirt', '-', '-', '-']);
    const props = id === 'oak.slab' ? `type=${pick(['bottom', 'top', 'double'])}` : '-';
    return `set:${n(5) - 2}:${3 + n(8)}:${n(5) - 2}:${id}:${props}`;
  }
  if (r < 0.88) return `tick:${pick([1, 1, 2, 3, 5, 8, 15, 30])}`;
  if (r < 0.95) return `players:${rand() < 0.3 ? '-' : `${num(n(5) - 2 + 0.5)}~${num(3 + n(4))}~${num(n(5) - 2 + 0.5)}~${pick([1, 1, 0.5, 2])}~${n(2)}`}`;
  return `set:${n(5) - 2}:${pick([4, 5])}:${n(5) - 2}:sand:-`;
}

const DIRECTED = {
  simple: ['set:0:8:0:sand:-', 'tick:1', 'tick:1', 'tick:1', 'tick:40'],
  stack: ['set:0:6:0:sand:-', 'set:0:7:0:gravel:-', 'set:0:8:0:sand:-', 'set:0:9:0:gravel:-', 'tick:2', 'tick:10', 'tick:30', 'tick:30'],
  support: ['set:1:4:0:stone:-', 'set:1:5:0:sand:-', 'tick:5', 'set:1:4:0:-', 'tick:1', 'tick:1', 'tick:1', 'tick:30'],
  slabAndFence: ['set:0:4:0:oak.slab:type=bottom', 'set:0:5:0:sand:-', 'tick:6', 'set:1:4:0:oak.fence:-', 'set:1:5:0:gravel:-', 'tick:6', 'set:2:4:0:oak.slab:type=top', 'set:2:5:0:sand:-', 'tick:20'],
  playerBlocks: ['players:0.5~4~0.5~1~0', 'set:0:9:0:sand:-', 'tick:2', 'tick:60', 'players:-', 'set:1:9:0:sand:-', 'tick:2', 'players:1.5~4~0.5~1~0', 'tick:60'],
  taken: ['set:0:9:0:sand:-', 'tick:2', 'set:0:4:0:stone:-', 'tick:60'],
  catchUp: ['set:0:30:0:sand:-', 'tick:2', 'tick:6', 'set:0:20:0:gravel:-', 'tick:2', 'tick:4', 'tick:4', 'tick:4', 'tick:8', 'tick:30'],
  catchUpTwo: ['set:1:30:0:gravel:-', 'tick:2', 'tick:8', 'set:1:24:0:sand:-', 'tick:2', 'set:1:17:0:sand:-', 'tick:2', 'tick:20', 'tick:30'],
  timeout: ['set:0:2000:0:sand:-', 'tick:2', 'tick:300', 'tick:299', 'tick:1', 'tick:5'],
  pit: ['set:0:3:0:-', 'set:0:8:0:sand:-', 'tick:2', 'tick:40', 'set:1:3:0:-', 'set:1:4:0:sand:-', 'tick:30'],
  neighbours: ['set:0:4:0:sand:-', 'set:0:4:1:sand:-', 'set:1:4:0:sand:-', 'set:0:3:0:-', 'tick:4', 'tick:20', 'set:0:3:1:-', 'tick:30'],
};

export function generateFalling(outDir) {
  const dir = join(outDir, 'falling');
  mkdirSync(dir, { recursive: true });
  const rows = [];
  const run = (prefix, ops) => {
    const ctx = makeFallingWorld();
    ops.forEach((op, step) => { ctx.drops.length = 0; const ret = applyOp(ctx, op); rows.push(`${prefix},${step},${op},${ret},${worldText(ctx).join(',')},${fallingText(ctx).join(',')}`); });
  };
  for (const seed of [6, 77, 808, 5050]) { const rand = lcg(seed), ops = []; for (let i = 0; i < 260; i++) ops.push(randomOp(rand)); run(String(seed), ops); }
  for (const [name, ops] of Object.entries(DIRECTED)) run(name, ops);
  writeFileSync(join(dir, 'trace.csv'), ['seed,step,op,ret,edits,furnaces,drops,clock,pending,entities', ...rows].join('\n') + '\n');
}
