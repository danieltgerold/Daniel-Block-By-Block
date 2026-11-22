import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { VoxelWorld } from '../../src/voxel-world.js';
import { formatNumber } from './format.mjs';

const currentEdits = [
  [0, 4, -2, 'oak.slab', { type: 'bottom' }], [2, 4, -2, 'oak.slab', { type: 'top' }],
  [4, 4, -2, 'oak.stairs', { facing: 'north' }], [4, 4, -3, 'pine.stairs', { facing: 'west' }],
  [6, 4, -2, 'oak.fence'], [7, 4, -2, 'stone'], [5, 4, -2, 'glass'],
  [10, 4, -2, 'oak.door', { half: 'lower' }], [10, 5, -2, 'oak.door', { half: 'upper' }],
  [12, 4, -2, 'water'], [13, 4, -2, 'water', { level: 3 }],
  [0, 3, -6, 'oak.slab'], [2, 3, -6, 'water'],
];
const definitions = [
  ['current', 0, ['bedrock', 'dirt', 'dirt', 'grass.block'], currentEdits],
  ['negative', -4, ['bedrock', 'dirt', 'dirt', 'grass.block'], [[-17, 0, -1, 'oak.slab']]],
  ['ties', 0, [], [[16, 0, 0, 'stone'], [15, -1, 0, 'glass'], [-17, 0, 0, 'stone'], [-16, -1, 0, 'stone']]],
];
const value = x => typeof x === 'boolean' ? Number(x) : formatNumber(x);
function write(dir, name, fields, rows) {
  assert.ok(fields.length > 0 && rows.length > 0, 'empty world fixture');
  assert.ok(rows.every(row => row.length === fields.length), 'world fixture width');
  writeFileSync(join(dir, name), [fields.join(','), ...rows.map(row => row.join(','))].join('\n') + '\n');
}

function evaluate(world, op, a) {
  const p = { x: a[0], y: a[1], z: a[2], size: a[8] || 1, grounded: Boolean(a[10]), flying: Boolean(a[9]) };
  if (op === 'ray') {
    const hit = world.raycast(p, { x: a[3], y: a[4], z: a[5] }, a[6], { waterSources: Boolean(a[7]) });
    return hit ? [1, hit.x, hit.y, hit.z, hit.normal.x, hit.normal.y, hit.normal.z, hit.distance,
      hit.point.x, hit.point.y, hit.point.z] : Array(11).fill(0);
  }
  if (op === 'supported') return [Number(world.isSupported(p, a[3]))];
  if (op === 'overlap') return [Number(world.intersectsPlayer({ ...p, size: a[3] }))];
  if (op === 'path') return [Number(world.supportedPath(p, a[3], a[4], a[5]))];
  const v = { x: a[3], y: a[4], z: a[5] };
  const m = op === 'raw' ? world.moveRaw(p, v, a[6], a[7]) : world.movePlayer(p, v, a[6], a[7]);
  return [m.x, m.y, m.z, m.moved.x, m.moved.y, m.moved.z,
    Number(m.blocked.x), Number(m.blocked.y), Number(m.blocked.z), Number(m.grounded)];
}

export function generateWorld(outDir) {
  const dir = join(outDir, 'world'); mkdirSync(dir, { recursive: true });
  const configs = [], edits = [], queries = [], expected = [];
  const add = (id, world, op, args) => {
    assert.ok(args.length <= 11, 'too many query arguments');
    const a = Array.from({ length: 11 }, (_, i) => args[i] ?? 0), index = queries.length;
    queries.push([index, id, op, ...a.map(value)]);
    const result = evaluate(world, op, a);
    expected.push([index, result.length, ...Array.from({ length: 11 }, (_, i) => value(result[i] ?? 0))]);
  };
  // Three finite configurations; edits and queries are explicitly bounded tables.
  for (const [id, baseY, layers, changes] of definitions) {
    const world = new VoxelWorld({ baseY, layers });
    world.loadEdits(changes.map(([x, y, z, block, state = {}]) => ({ x, y, z, id: block, state })));
    configs.push([id, baseY, layers.join('|')]);
    for (const [x, y, z, block, s = {}] of changes) edits.push([id, x, y, z, block,
      s.type ?? '', s.facing ?? '', s.half ?? '', s.shape ?? '', s.hinge ?? '', Number(s.open ?? false), s.level ?? 0, Number(s.falling ?? false)]);
    const top = baseY + layers.length;
    for (const x of [-17, -.5, .5, 2.5, 4.5, 6.5, 10.5, 12.5, 13.5, 16.5]) {
      add(id, world, 'ray', [x, top + 3, -1.5, 0, -1, 0, 8]);
      add(id, world, 'ray', [x, top + .5, 1, 0, 0, -1, 8, 1]);
      for (const y of [top, top + .5, top + 1, top - .5]) add(id, world, 'supported', [x, y, -1.5, .3]);
      add(id, world, 'overlap', [x, top, -1.5, 1]);
      add(id, world, 'step', [x, top, -.5, 0, -.08, -2, .3, 1.8, 1, 0, 1]);
      add(id, world, 'raw', [x, top, -.5, 0, -.08, -2, .3, 1.8, 1]);
      add(id, world, 'path', [x, top, -.5, 0, -5, .6]);
    }
    add(id, world, 'ray', [15.5, .5, .5, 1, -1, 0, 4.5]);
    add(id, world, 'ray', [-16.5, .5, .5, 1, -1, 0, 4.5]);
    add(id, world, 'ray', [.5, top, .5, 0, 0, 0, 4.5]);
    add(id, world, 'supported', [1e16, top, 1e16, .3]);
  }
  write(dir, 'worlds.csv', ['world', 'baseY', 'layers'], configs);
  write(dir, 'edits.csv', ['world', 'x', 'y', 'z', 'id', 'type', 'facing', 'half', 'stairShape', 'hinge', 'open', 'level', 'falling'], edits);
  write(dir, 'queries.csv', ['case', 'world', 'op', ...Array.from({ length: 11 }, (_, i) => `a${i}`)], queries);
  write(dir, 'expected.csv', ['case', 'count', ...Array.from({ length: 11 }, (_, i) => `v${i}`)], expected);
}
