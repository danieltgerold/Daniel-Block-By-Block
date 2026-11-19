import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { BLOCK_TYPES } from '../../src/block-types.js';
import { blockBoxes, worldBoxes, fullCube, blockOpaque } from '../../src/block-shapes.js';
import { formatNumber } from './format.mjs';

const CASE_FIELDS = ['case', 'category', 'id', 'kind', 'mask', 'x', 'y', 'z', 'type',
  'facing', 'half', 'stairShape', 'hinge', 'open', 'boxCount', 'fullCube', 'opaque',
  'solid', 'shape', 'definitionOpaque'];
const BOX_FIELDS = ['case', 'index', 'minX', 'minY', 'minZ', 'maxX', 'maxY', 'maxZ'];
const FACINGS = ['north', 'east', 'south', 'west'];
const STAIR_SHAPES = ['straight', 'inner-left', 'inner-right', 'outer-left', 'outer-right'];
const DIRECTIONS = [[0, 0, -1], [1, 0, 0], [0, 0, 1], [-1, 0, 0]];

function baseCases() {
  const cases = [];
  const add = (category, id, state = {}, mask = -1) => cases.push({ category, id, state, mask });
  // Finite registry snapshot, currently 25 definitions.
  for (const definition of BLOCK_TYPES.values()) add('defaults', definition.id, definition.defaultState);
  for (const type of ['bottom', 'top', 'double']) add('slabs', 'oak.slab', { type });
  // 4 facings × 2 halves × 5 resolved stair shapes.
  for (const facing of FACINGS) for (const half of ['bottom', 'top'])
    for (const shape of STAIR_SHAPES) add('stairs', 'oak.stairs', { facing, half, shape });
  // 4 facings × 2 hinges × 2 open states.
  for (const facing of FACINGS) for (const hinge of ['left', 'right'])
    for (const open of [false, true]) add('doors', 'oak.door', { facing, hinge, open });
  for (let mask = 0; mask < 16; mask++) add('fences', 'oak.fence', {}, mask);
  add('item-fence', 'oak.fence');
  assert.equal(cases.length, BLOCK_TYPES.size + 3 + 40 + 16 + 16 + 1);
  return cases;
}

function projectedState(definition, state) {
  const shape = definition.collisionShape;
  return {
    type: shape === 'slab' ? state.type ?? 'bottom' : '',
    facing: shape === 'stairs' || shape === 'door' ? state.facing ?? 'north' : '',
    half: shape === 'stairs' ? state.half ?? 'bottom' : '',
    stairShape: shape === 'stairs' ? state.shape ?? 'straight' : '',
    hinge: shape === 'door' ? state.hinge ?? 'left' : '',
    open: shape === 'door' ? Boolean(state.open) : false,
  };
}

function blockFor(row) {
  const definition = BLOCK_TYPES.get(row.id);
  assert.ok(definition, `unknown fixture block ${row.id}`);
  const state = { type: row.type, facing: row.facing, half: row.half,
    shape: row.stairShape, hinge: row.hinge, open: row.open };
  return { id: row.id, definition, state, x: row.x, y: row.y, z: row.z };
}

function worldFor(row) {
  assert.ok(Number.isInteger(row.mask) && row.mask >= -1 && row.mask < 16, 'invalid connection mask');
  if (row.mask === -1) return null;
  return { blockAt(x, y, z) {
    // At most four neighbors; opaque stone exercises fence connection lookup.
    const index = DIRECTIONS.findIndex(([dx, dy, dz]) =>
      x === row.x + dx && y === row.y + dy && z === row.z + dz);
    return index >= 0 && (row.mask & (1 << index)) !== 0
      ? { definition: BLOCK_TYPES.get('stone'), state: {} } : null;
  } };
}

function boxesFor(row) {
  const block = blockFor(row), world = worldFor(row);
  const local = blockBoxes(block, row.kind, world);
  assert.ok(local.length <= 9, 'shape exceeds nine-box bound');
  const boxes = worldBoxes(block, row.kind, world).map(box =>
    [box.min.x, box.min.y, box.min.z, box.max.x, box.max.y, box.max.z]);
  assert.equal(boxes.length, local.length, 'translation changes box count');
  // At most nine boxes, each with exactly six finite coordinates and three axes.
  for (const box of boxes) {
    assert.ok(box.every(Number.isFinite), 'nonfinite box coordinate');
    for (let axis = 0; axis < 3; axis++) assert.ok(box[axis] < box[axis + 3], 'unordered box');
  }
  return boxes;
}

export function shapeCases() {
  const result = [];
  // Each finite base-case table is crossed with two kinds and two translations.
  for (const base of baseCases()) for (const kind of ['collision', 'selection'])
    for (const [x, y, z] of [[0, 0, 0], [-17, -3, -.5]]) {
      const definition = BLOCK_TYPES.get(base.id);
      const row = { case: result.length, category: base.category, id: base.id, kind,
        mask: base.mask, x, y, z, ...projectedState(definition, base.state) };
      const block = blockFor(row);
      result.push({ ...row, boxCount: boxesFor(row).length, fullCube: fullCube(block),
        opaque: blockOpaque(block), solid: definition.solid,
        shape: definition.collisionShape, definitionOpaque: definition.opaque });
    }
  assert.equal(result.length, (BLOCK_TYPES.size + 3 + 40 + 16 + 16 + 1) * 4);
  return result;
}

function writeCsv(dir, name, fields, rows) {
  assert.ok(fields.length > 0, 'CSV needs columns');
  assert.ok(rows.length > 0, 'CSV needs data');
  const value = v => typeof v === 'boolean' ? v ? '1' : '0'
    : typeof v === 'number' ? formatNumber(v) : v;
  const lines = rows.map(row => fields.map(field => {
    assert.notEqual(row[field], undefined, `missing ${field}`);
    return value(row[field]);
  }).join(','));
  writeFileSync(join(dir, name), [fields.join(','), ...lines].join('\n') + '\n');
}

export function generateShapes(outDir) {
  const cases = shapeCases(), boxes = [];
  const baseCounts = Object.fromEntries(['defaults', 'slabs', 'stairs', 'doors', 'fences', 'item-fence']
    .map(category => [category, cases.filter(row => row.category === category).length / 4]));
  // Finite case table; each case contributes zero to nine coordinate rows.
  for (const row of cases) boxesFor(row).forEach((box, index) => boxes.push({
    case: row.case, index, minX: box[0], minY: box[1], minZ: box[2],
    maxX: box[3], maxY: box[4], maxZ: box[5],
  }));
  assert.equal(boxes.length, cases.reduce((sum, row) => sum + row.boxCount, 0));
  const dir = join(outDir, 'shapes');
  mkdirSync(dir, { recursive: true });
  writeCsv(dir, 'cases.csv', CASE_FIELDS, cases);
  writeCsv(dir, 'boxes.csv', BOX_FIELDS, boxes);
  writeFileSync(join(dir, 'manifest.json'), JSON.stringify({ formatVersion: 1,
    registrySize: BLOCK_TYPES.size, baseCounts, caseCount: cases.length,
    boxCount: boxes.length }, null, 2) + '\n');
}
