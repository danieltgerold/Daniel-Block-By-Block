// Records seeded edit traces on the JS VoxelWorld: every setBlock with its reactions (furnace contents, door checks,
// grass and farmland under cover, stair reshaping), door toggling and furnace slots. After each operation the whole
// edit list, the furnaces and every drop emitted are written as text for Java to reproduce.
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { VoxelWorld } from '../../src/voxel-world.js';
import { formatNumber } from './format.mjs';

export const lcg = seed => () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
const LAYERS = ['bedrock', 'dirt', 'dirt', 'grass.block'];
const parseProps = text => text === '-' ? {} : Object.fromEntries(text.split('|').map(kv => {
  const [k, v] = kv.split('='); return [k, v === 'true' ? true : v === 'false' ? false : /^\d+$/.test(v) ? Number(v) : v];
}));
const stateText = state => Object.entries(state ?? {}).map(([k, v]) => `${k}=${v}`).join('|') || '-';
const stackText = s => s ? `${s.id}x${s.count}` : '-';

export function makeWorld() {
  const drops = [];
  const world = new VoxelWorld({ baseY: 0, layers: LAYERS });
  world.onDrop = (stack, at) => drops.push({ stack: { ...stack }, at: { ...at } });
  world.getGameMode = () => world.mode;
  world.mode = 'survival';
  return { world, drops };
}

export function applyOp(ctx, op) {
  const { world } = ctx;
  const [name, ...a] = op.split(':');
  switch (name) {
    case 'set': return world.setBlock(Number(a[0]), Number(a[1]), Number(a[2]), a[3] === '-' ? false : a[3], parseProps(a[4] ?? '-')) ? '1' : '0';
    case 'placedoor': {
      const [x, y, z, id, props] = [Number(a[0]), Number(a[1]), Number(a[2]), a[3], parseProps(a[4])];
      const guard = world.changingDoors; world.changingDoors = true;
      const lower = world.setBlock(x, y, z, id, { ...props, half: 'lower' }), upper = world.setBlock(x, y + 1, z, id, { ...props, half: 'upper' });
      world.changingDoors = guard;
      return `${lower ? 1 : 0}${upper ? 1 : 0}`;
    }
    case 'placedoor2': {
      const [x, y, z, id] = [Number(a[0]), Number(a[1]), Number(a[2]), a[3]];
      const guard = world.changingDoors; world.changingDoors = true;
      const lower = world.setBlock(x, y, z, id, { ...parseProps(a[4]), half: 'lower' }), upper = world.setBlock(x, y + 1, z, id, { ...parseProps(a[5]), half: 'upper' });
      world.changingDoors = guard;
      return `${lower ? 1 : 0}${upper ? 1 : 0}`;
    }
    case 'toggle': { const b = world.blockAt(Number(a[0]), Number(a[1]), Number(a[2])); return b?.definition.collisionShape === 'door' ? (world.toggleDoor(b) ? '1' : '0') : '0'; }
    case 'fill': {
      const f = world.furnaceAt(Number(a[0]), Number(a[1]), Number(a[2]));
      if (!f) return '0';
      f.slots[Number(a[3])] = a[4] === '-' ? null : { id: a[4], count: Number(a[5]) };
      return '1';
    }
    case 'mode': world.mode = a[0]; return '-';
    case 'loading': world.loading = a[0] === '1'; return '-';
    default: throw new Error(`unknown op ${op}`);
  }
}

export function worldText(ctx) {
  const { world, drops } = ctx;
  const edits = [...world.edits()].sort((p, q) => p.x - q.x || p.y - q.y || p.z - q.z)
    .map(e => e.id ? `${e.x}:${e.y}:${e.z}:${e.id}:${stateText(e.state)}` : `${e.x}:${e.y}:${e.z}:-`);
  const furnaces = [...world.furnaces.entries()].map(([key, f]) => `${key.replaceAll(',', ':')}=${f.slots.map(stackText).join('/')}`).sort();
  const dropText = drops.map(d => `${d.stack.id}:${d.stack.count}@${formatNumber(d.at.x)}:${formatNumber(d.at.y)}:${formatNumber(d.at.z)}`);
  return [edits.join(';') || '-', furnaces.join(';') || '-', dropText.join(';') || '-'];
}

const DIRS = ['north', 'east', 'south', 'west'];
export function randomOp(rand) {
  const pick = list => list[Math.floor(rand() * list.length)];
  const n = max => Math.floor(rand() * max);
  const at = () => `${n(5) - 2}:${3 + n(4)}:${n(5) - 2}`;
  const r = rand();
  if (r < 0.58) {
    const kind = pick(['grass.block', 'grass.block', 'dirt', 'stone', 'oak.planks', 'glass', 'stair', 'stair', 'slab', 'door', 'furnace', 'log', 'farmland', 'wall', 'fence', 'air', 'air', 'air']);
    const id = kind === 'stair' ? pick(['oak.stairs', 'pine.stairs', 'stone.stairs']) : kind === 'slab' ? pick(['oak.slab', 'stone.slab']) : kind === 'door' ? pick(['oak.door', 'pine.door'])
      : kind === 'log' ? pick(['oak.log', 'pine.log']) : kind === 'wall' ? 'stone.wall' : kind === 'fence' ? 'oak.fence' : kind === 'air' ? '-' : kind;
    let props = '-';
    if (kind === 'stair') props = `facing=${pick(DIRS)}|half=${pick(['bottom', 'top'])}`;
    else if (kind === 'slab') props = `type=${pick(['bottom', 'top', 'double'])}`;
    else if (kind === 'door') props = `facing=${pick(DIRS)}|hinge=${pick(['left', 'right'])}|open=${rand() < 0.4}|half=${pick(['lower', 'upper'])}`;
    else if (kind === 'furnace') props = `facing=${pick(DIRS)}|lit=${rand() < 0.5}`;
    else if (kind === 'log') props = `axis=${pick(['x', 'y', 'z'])}`;
    else if (kind === 'farmland') props = `moisture=${n(8)}|dryTicks=${n(5)}`;
    return `set:${at()}:${id}:${props}`;
  }
  if (r < 0.70) return `placedoor:${n(5) - 2}:${4 + n(2)}:${n(5) - 2}:${pick(['oak.door', 'pine.door'])}:facing=${pick(DIRS)}|hinge=${pick(['left', 'right'])}|open=${rand() < 0.3}`;
  if (r < 0.77) return `toggle:${at()}`;
  if (r < 0.87) return `fill:${at()}:${n(3)}:${pick(['-', 'sand', 'coal', 'iron.ore'])}:${1 + n(30)}`;
  if (r < 0.90) return `mode:${pick(['survival', 'creative'])}`;
  if (r < 0.93) return `loading:${n(2)}`;
  return `set:${at()}:${pick(['stone', 'oak.planks', 'dirt'])}:-`;
}

const DIRECTED = {
  furnaceBreak: ['set:0:4:0:furnace:facing=north|lit=false', 'fill:0:4:0:0:sand:5', 'fill:0:4:0:1:coal:2', 'fill:0:4:0:2:glass:9', 'set:0:4:0:furnace:facing=south|lit=true', 'set:0:4:0:-',
    'set:1:4:0:furnace:-', 'fill:1:4:0:0:sand:3', 'loading:1', 'set:1:4:0:stone:-', 'loading:0', 'set:2:4:0:furnace:-', 'fill:2:4:0:1:coal:4', 'set:2:4:0:furnace:-', 'set:2:4:0:dirt:-'],
  doorSupport: ['placedoor:0:4:0:oak.door:facing=north|hinge=left|open=false', 'set:0:3:0:-', 'placedoor:2:4:0:oak.door:facing=east|hinge=right|open=true', 'mode:creative', 'set:2:3:0:-', 'mode:survival',
    'placedoor:-2:4:0:pine.door:facing=south|hinge=left|open=false', 'set:-2:5:0:-', 'set:-2:4:0:-'],
  doorMismatch: ['set:0:4:0:oak.door:facing=north|hinge=left|open=false|half=lower', 'set:0:5:0:oak.door:facing=east|hinge=right|open=true|half=upper',
    'set:0:4:0:oak.door:facing=north|hinge=left|open=true|half=lower', 'set:1:4:0:stone:-', 'toggle:0:4:0', 'toggle:0:5:0'],
  doorOpenOnly: ['placedoor2:0:4:0:oak.door:facing=north|hinge=left|open=false:facing=north|hinge=left|open=true', 'set:1:4:0:stone:-', 'placedoor2:3:4:0:oak.door:facing=west|hinge=right|open=true:facing=west|hinge=right|open=false', 'set:4:4:0:stone:-'],
  grassCover: ['set:0:3:0:dirt:-', 'set:0:3:0:grass.block:-', 'set:0:4:0:stone:-', 'set:1:3:0:farmland:moisture=3|dryTicks=0', 'set:1:4:0:glass:-', 'set:1:4:0:oak.planks:-', 'set:1:4:0:-',
    'set:2:3:0:grass.block:-', 'set:2:4:0:oak.slab:type=bottom', 'set:2:4:0:oak.slab:type=double', 'set:2:4:0:stone:-'],
  stairCorners: ['set:0:4:0:oak.stairs:facing=north|half=bottom', 'set:1:4:0:oak.stairs:facing=east|half=bottom', 'set:0:4:1:oak.stairs:facing=west|half=bottom', 'set:-1:4:0:oak.stairs:facing=south|half=bottom',
    'set:1:4:1:oak.stairs:facing=north|half=top', 'set:0:4:0:-', 'set:0:4:0:oak.stairs:facing=west|half=bottom', 'set:0:4:-1:pine.stairs:facing=east|half=bottom'],
  sameAndNoop: ['set:0:4:0:stone:-', 'set:0:4:0:stone:-', 'set:0:4:0:-', 'set:0:4:0:-', 'set:0:3:0:grass.block:-', 'set:0:3:0:-', 'set:0:3:0:dirt:-', 'set:5:5:5:nonsense:-', 'set:0:4:0:furnace:facing=north|lit=false', 'set:0:4:0:furnace:facing=north|lit=true', 'fill:0:4:0:0:sand:1', 'set:0:4:0:furnace:facing=north|lit=false'],
};

export function generateWorldRules(outDir) {
  const dir = join(outDir, 'worldrules');
  mkdirSync(dir, { recursive: true });
  const rows = [];
  const record = (ctx, prefix, op, ret) => { ctx.drops.length = 0; };
  const run = (prefix, ops) => {
    const ctx = makeWorld();
    ops.forEach((op, step) => {
      ctx.drops.length = 0;
      const ret = applyOp(ctx, op);
      rows.push(`${prefix},${step},${op},${ret},${worldText(ctx).join(',')}`);
    });
  };
  for (const seed of [8, 64, 512, 1337]) {
    const rand = lcg(seed), ops = [];
    for (let i = 0; i < 300; i++) ops.push(randomOp(rand));
    run(String(seed), ops);
  }
  for (const [name, ops] of Object.entries(DIRECTED)) run(name, ops);
  writeFileSync(join(dir, 'trace.csv'), ['seed,step,op,ret,edits,furnaces,drops', ...rows].join('\n') + '\n');
}
