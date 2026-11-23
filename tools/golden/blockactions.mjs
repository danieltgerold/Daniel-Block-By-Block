// Records placing and destroying blocks on the JS world: where a block lands for a given hit and look direction,
// the state it takes (stairs and slab halves, log axis, furnace facing, door hinge), whether players in the way
// block it, and what breaking drops with each tool. Reuses the world-rules recorder for plain edits.
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { placeBlock } from '../../src/block-actions.js';
import { ITEMS } from '../../src/inventory.js';
import { formatNumber } from './format.mjs';
import { applyOp as applyRulesOp, lcg, makeWorld, randomOp as randomRulesOp, worldText } from './worldrules.mjs';

const num = v => v === undefined ? '-' : formatNumber(v);
const opt = t => t === '-' ? undefined : Number(t);
const RANDOMS = [0, 0.15, 0.5, 0.85, 0.999999];

export function makeActionWorld() {
  const ctx = makeWorld();
  let n = 0;
  ctx.world.random = () => RANDOMS[n++ % RANDOMS.length];
  return ctx;
}

export function applyOp(ctx, op) {
  const { world } = ctx;
  const [name, ...a] = op.split(':');
  if (name === 'place') {
    const [id, hx, hy, hz, nx, ny, nz, px, py, pz, yaw, players] = a;
    const hit = { x: Number(hx), y: Number(hy), z: Number(hz), normal: { x: Number(nx), y: Number(ny), z: Number(nz) } };
    if (px !== '-' || py !== '-' || pz !== '-') hit.point = { x: opt(px), y: opt(py), z: opt(pz) };
    const list = players === '-' ? [] : players.split('|').map(p => { const [x, y, z, size, crouch] = p.split('~'); return { x: Number(x), y: Number(y), z: Number(z), size: Number(size), crouching: crouch === '1' }; });
    const placed = placeBlock(world, id, hit, Number(yaw), list);
    return placed ? `${placed.x}:${placed.y}:${placed.z}` : '0';
  }
  if (name === 'destroy') {
    const [x, y, z, mode, tool] = a;
    const stack = tool === '-' ? null : { id: tool, count: 1 };
    return world.destroyBlock(Number(x), Number(y), Number(z), { gameMode: mode, tool: stack, toolDefinition: stack ? ITEMS.get(tool) : undefined }) ? '1' : '0';
  }
  return applyRulesOp(ctx, op);
}

const DIRS = [[0, -1, 0], [1, 0, 0], [0, 1, 0], [-1, 0, 0], [0, 0, 1], [0, 0, -1]].map(([x, y, z]) => [x, y, z]);
const NORMALS = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];
const PLACE_IDS = ['stone', 'stone', 'oak.planks', 'glass', 'oak.stairs', 'pine.stairs', 'stone.stairs', 'oak.slab', 'oak.slab', 'stone.slab', 'oak.door', 'pine.door', 'furnace',
  'oak.log', 'pine.log', 'oak.fence', 'stone.wall', 'farmland', 'dirt', 'grass.block', 'crafting.table'];
const YAWS = [0, Math.PI / 2, Math.PI, -Math.PI / 2, Math.PI / 4, -Math.PI / 4, 3 * Math.PI / 4, -3 * Math.PI / 4, 1e6, -1e6, 7.3, -2.2, 100 * Math.PI, 5 * Math.PI / 4, 0.7853981633974483, -0.7853981633974483];

function randomOp(rand) {
  const pick = list => list[Math.floor(rand() * list.length)];
  const n = max => Math.floor(rand() * max);
  const r = rand();
  if (r < 0.5) {
    const hx = n(5) - 2, hy = 3 + n(3), hz = n(5) - 2, normal = pick(NORMALS);
    // A point on the face that was hit, sometimes missing like a ray with no recorded point.
    const point = rand() < 0.15 ? ['-', '-', '-'] : [hx + (normal[0] ? (normal[0] > 0 ? 1 : 0) : rand()), hy + (normal[1] ? (normal[1] > 0 ? 1 : 0) : rand()), hz + (normal[2] ? (normal[2] > 0 ? 1 : 0) : rand())].map(num);
    const players = rand() < 0.3 ? Array.from({ length: 1 + n(2) }, () => `${num(hx + normal[0] + rand() - 0.5)}~${num(hy + normal[1] - 0.5 + rand())}~${num(hz + normal[2] + rand() - 0.5)}~${num(pick([1, 1, 0.5, 2]))}~${n(2)}`).join('|') : '-';
    return `place:${pick(PLACE_IDS)}:${hx}:${hy}:${hz}:${normal.join(':')}:${point.join(':')}:${num(pick(YAWS))}:${players}`;
  }
  if (r < 0.72) return randomRulesOp(rand);
  if (r < 0.95) return `destroy:${n(5) - 2}:${3 + n(4)}:${n(5) - 2}:${pick(['survival', 'survival', 'creative'])}:${pick(['-', '-', 'wood.pickaxe', 'stone.pickaxe', 'iron.pickaxe', 'shears', 'wood.axe', 'diamond.pickaxe'])}`;
  return `place:${pick(['stone', 'oak.planks'])}:${n(5) - 2}:3:${n(5) - 2}:0:1:0:-:-:-:0:-`;
}

const DIRECTED = {
  facing: ['set:0:3:0:-', ...[0, Math.PI / 2, Math.PI, -Math.PI / 2, Math.PI / 4, -Math.PI / 4, 3 * Math.PI / 4, 1e6].map((yaw, i) => `place:oak.stairs:${i}:3:3:0:1:0:-:-:-:${num(yaw)}:-`),
    ...[0, Math.PI / 2, Math.PI, -Math.PI / 2].map((yaw, i) => `place:furnace:${i}:3:-3:0:1:0:-:-:-:${num(yaw)}:-`)],
  halves: ['place:oak.stairs:0:3:0:0:1:0:0.5:4:0.2:0:-', 'place:oak.stairs:1:3:0:0:1:0:1.5:4:0.8:0:-', 'place:oak.stairs:2:3:0:0:-1:0:2.5:3:0.5:0:-', 'place:oak.stairs:3:4:0:1:0:0:4:4.9:0.5:0:-',
    'place:oak.slab:-1:3:0:0:1:0:-0.5:4:0.2:0:-', 'place:oak.slab:-2:3:0:0:1:0:-1.5:4:0.8:0:-', 'place:oak.slab:-3:3:0:1:0:0:-2:3.7:0.5:0:-', 'place:oak.stairs:0:3:2:0:1:0:-:-:-:0:-'],
  slabMerge: ['place:oak.slab:0:3:0:0:1:0:0.5:4:0.2:0:-', 'place:oak.slab:0:4:0:0:1:0:0.5:5:0.2:0:-', 'place:oak.slab:1:3:0:0:1:0:1.5:4:0.8:0:-', 'place:oak.slab:1:4:0:0:-1:0:1.5:4:0.5:0:-',
    'place:oak.slab:2:3:0:0:1:0:2.5:4:0.8:0:-', 'place:oak.slab:2:4:0:0:1:0:2.5:5:0.8:0:-', 'place:stone.slab:0:4:0:0:1:0:0.5:5:0.5:0:-', 'place:oak.slab:0:4:0:0:1:0:0.5:5:0.2:0:-'],
  logs: ['place:oak.log:0:3:0:0:1:0:-:-:-:0:-', 'place:oak.log:1:3:0:1:0:0:-:-:-:0:-', 'place:pine.log:2:3:0:0:0:1:-:-:-:0:-', 'place:oak.log:3:3:0:-1:0:0:-:-:-:0:-', 'place:oak.log:-1:3:0:0:0:-1:-:-:-:0:-'],
  doors: ['place:oak.door:0:3:0:0:1:0:0.5:4:0.5:0:-', 'place:oak.door:1:3:0:0:1:0:1.5:4:0.5:0:-', 'place:pine.door:3:3:0:0:1:0:3.2:4:0.5:0:-', 'place:oak.door:3:3:2:0:1:0:3.9:4:2.5:1.5707963267948966:-',
    'place:oak.door:0:3:4:0:1:0:-:-:-:0:-', 'set:2:4:4:stone:-', 'set:2:5:4:stone:-', 'place:oak.door:1:3:4:0:1:0:1.5:4:4.5:0:-', 'place:oak.door:-2:3:0:0:1:0:-:-:-:0:-', 'place:oak.door:-2:5:0:0:1:0:-:-:-:0:-',
    'place:oak.door:-3:3:0:0:1:0:-3:4:0.5:3.141592653589793:-', 'place:oak.door:0:4:0:0:1:0:-:-:-:0:-'],
  doorNeighbours: ['place:oak.door:1:3:-1:0:1:0:1.5:4:-0.5:0:-', 'place:oak.door:1:3:0:0:1:0:1.5:4:0.5:-1.5707963267948966:-', 'place:oak.door:4:3:-1:0:1:0:4.5:4:-0.5:0:-', 'place:oak.door:4:3:0:0:1:0:4.5:4:0.5:0:-',
    'place:pine.door:-2:3:-1:0:1:0:-1.5:4:-0.5:0:-', 'place:pine.door:-2:3:0:0:1:0:-1.5:4:0.5:3.141592653589793:-'],
  hingeScore: ['set:5:4:0:stone:-', 'set:5:5:0:stone:-', 'place:oak.door:6:3:0:0:1:0:6.5:4:0.5:0:-', 'set:10:4:0:stone:-', 'set:10:5:0:stone:-', 'place:oak.door:9:3:0:0:1:0:9.5:4:0.5:0:-',
    'set:-3:4:2:stone:-', 'place:oak.door:-2:3:2:0:1:0:-1.5:4:2.5:0:-', 'set:1:4:3:stone:-', 'set:1:5:3:stone:-', 'set:3:4:3:stone:-', 'place:oak.door:2:3:3:0:1:0:2.5:4:3.5:0:-'],
  zeroNormal: ['place:stone:2:4:2:0:0:0:-:-:-:0:-', 'place:stone:2:5:2:0:0:0:2.5:5.5:2.5:0:-', 'place:oak.door:3:4:2:0:0:0:-:-:-:0:-'],
  doorBlocked: ['place:oak.door:0:3:0:0:1:0:-:-:-:0:0.5~4~0.5~1~0', 'place:oak.door:1:3:0:0:1:0:-:-:-:0:1.5~5~0.5~1~0', 'place:oak.door:2:3:0:0:1:0:-:-:-:0:2.5~4~0.5~0.5~1', 'place:oak.door:3:3:0:0:1:0:-:-:-:0:5~4~5~1~0', 'place:stone:4:3:0:0:1:0:-:-:-:0:4.5~4~0.5~1~0', 'place:stone:5:3:0:0:1:0:-:-:-:0:5.5~5~0.5~1~0', 'place:stone:6:3:0:0:1:0:-:-:-:0:6.5~5.8~0.5~1~0'],
  fences: ['place:oak.fence:0:3:0:0:1:0:-:-:-:0:-', 'place:stone:1:4:0:0:1:0:-:-:-:0:-', 'place:oak.fence:-1:4:0:0:1:0:-:-:-:0:-', 'place:stone.wall:0:3:2:0:1:0:-:-:-:0:-', 'place:stone:1:4:2:0:1:0:-:-:-:0:-', 'place:oak.fence:0:3:4:0:1:0:-:-:-:0:0.5~5~4.5~1~0'],
  destroy: ['set:0:4:0:stone:-', 'destroy:0:4:0:survival:-', 'destroy:0:4:0:survival:-', 'destroy:0:3:0:survival:wood.pickaxe', 'destroy:1:3:0:creative:-', 'destroy:0:0:0:survival:iron.pickaxe', 'destroy:0:0:0:creative:-',
    'set:1:4:0:stone:-', 'destroy:1:4:0:survival:wood.pickaxe', 'set:1:4:0:stone:-', 'destroy:1:4:0:survival:stone.pickaxe', 'set:2:4:0:lapis.ore:-', 'destroy:2:4:0:survival:iron.pickaxe',
    'set:2:4:0:lapis.ore:-', 'destroy:2:4:0:survival:iron.pickaxe', 'set:2:4:0:redstone.ore:-', 'destroy:2:4:0:survival:iron.pickaxe', 'set:3:4:0:oak.leaves:-', 'destroy:3:4:0:survival:shears', 'set:3:4:0:oak.leaves:-', 'destroy:3:4:0:survival:-'],
  breakCascade: ['set:0:3:0:grass.block:-', 'set:0:4:0:oak.slab:type=double', 'destroy:0:4:0:survival:-', 'set:1:4:0:furnace:-', 'fill:1:4:0:0:coal:3', 'destroy:1:4:0:survival:stone.pickaxe', 'place:oak.door:3:3:0:0:1:0:-:-:-:0:-', 'destroy:3:3:0:survival:-',
    'place:oak.door:5:3:0:0:1:0:-:-:-:0:-', 'destroy:5:4:0:creative:-', 'place:oak.door:7:3:0:0:1:0:-:-:-:0:-', 'destroy:7:3:0:survival:-'],
};

export function generateBlockActions(outDir) {
  const dir = join(outDir, 'blockactions');
  mkdirSync(dir, { recursive: true });
  const rows = [];
  const run = (prefix, ops) => {
    const ctx = makeActionWorld();
    ops.forEach((op, step) => { ctx.drops.length = 0; const ret = applyOp(ctx, op); rows.push(`${prefix},${step},${op},${ret},${worldText(ctx).join(',')}`); });
  };
  for (const seed of [2, 31, 420, 9001]) { const rand = lcg(seed), ops = []; for (let i = 0; i < 260; i++) ops.push(randomOp(rand)); run(String(seed), ops); }
  for (const [name, ops] of Object.entries(DIRECTED)) run(name, ops);
  writeFileSync(join(dir, 'trace.csv'), ['seed,step,op,ret,edits,furnaces,drops', ...rows].join('\n') + '\n');
}
