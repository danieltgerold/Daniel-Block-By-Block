import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { generateShapes } from '../tools/golden/shapes.mjs';
import { BLOCK_TYPES } from '../src/block-types.js';

const CASE_FIELDS = 'case,category,id,kind,mask,x,y,z,type,facing,half,stairShape,hinge,open,boxCount,fullCube,opaque,solid,shape,definitionOpaque';
const BOX_FIELDS = 'case,index,minX,minY,minZ,maxX,maxY,maxZ';
const FILES = ['cases.csv', 'boxes.csv', 'manifest.json'];

function table(dir, file, header) {
  const lines = readFileSync(join(dir, 'shapes', file), 'utf8').trimEnd().split('\n');
  assert.equal(lines.shift(), header);
  assert.ok(lines.length > 0, `${file} must not be empty`);
  const fields = header.split(',');
  return lines.map(line => {
    const values = line.split(',');
    assert.equal(values.length, fields.length, `malformed ${file} row`);
    return Object.fromEntries(fields.map((field, i) => [field, values[i]]));
  });
}

function withFixtures(check) {
  const dir = mkdtempSync(join(tmpdir(), 'shape-golden-'));
  try {
    generateShapes(dir);
    const cases = table(dir, 'cases.csv', CASE_FIELDS);
    const boxes = table(dir, 'boxes.csv', BOX_FIELDS);
    const boxesFor = row => boxes.filter(box => box.case === row.case);
    check({ cases, boxes, boxesFor, dir });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

test('shape fixtures preserve case accounting, zero-box cases and ordered box rows', () => {
  withFixtures(({ cases, boxes, boxesFor, dir }) => {
    const manifest = JSON.parse(readFileSync(join(dir, 'shapes', 'manifest.json'), 'utf8'));
    assert.equal(manifest.formatVersion, 1);
    // Registry size follows main; the other categories are fixed by the generator's case tables.
    assert.equal(manifest.registrySize, BLOCK_TYPES.size);
    assert.deepEqual(manifest.baseCounts, { defaults: BLOCK_TYPES.size, slabs: 3, stairs: 40, doors: 16, fences: 16,
      'item-fence': 1, walls: 16, 'item-wall': 1 });
    const counts = Object.fromEntries(Object.entries(manifest.baseCounts).map(([name, count]) => [name, count * 4]));
    assert.equal(manifest.caseCount, cases.length);
    assert.equal(manifest.boxCount, boxes.length);
    assert.equal(cases.length, Object.values(counts).reduce((sum, count) => sum + count, 0));
    assert.equal(new Set(cases.map(row => row.case)).size, cases.length);
    for (const [category, count] of Object.entries(counts))
      assert.equal(cases.filter(row => row.category === category).length, count, category);
    assert.equal(boxes.length, cases.reduce((sum, row) => sum + Number(row.boxCount), 0));
    const known = new Set(cases.map(row => row.case));
    for (const box of boxes) assert.ok(known.has(box.case), `orphan box ${box.case}`);
    for (const row of cases) {
      const found = boxesFor(row);
      assert.equal(found.length, Number(row.boxCount), `case ${row.case}`);
      assert.ok(found.length <= 9);
      found.forEach((box, index) => assert.equal(Number(box.index), index));
      for (const box of found) for (const axis of ['X', 'Y', 'Z']) {
        assert.ok(Number.isFinite(Number(box[`min${axis}`])));
        assert.ok(Number.isFinite(Number(box[`max${axis}`])));
        assert.ok(Number(box[`min${axis}`]) < Number(box[`max${axis}`]));
      }
    }
    const water = cases.filter(row => row.id === 'water');
    assert.equal(water.length, 4);
    assert.ok(water.every(row => row.boxCount === '0' && row.solid === '0'));
  });
});

test('shape fixtures distinguish fence selection rails and no-world arm order', () => {
  withFixtures(({ cases, boxesFor }) => {
    const fences = cases.filter(row => row.category === 'fences' || row.category === 'item-fence');
    for (const row of fences) {
      const connections = Number(row.mask) === -1 ? 2 : Number(row.mask).toString(2).replaceAll('0', '').length;
      const collision = row.kind === 'collision';
      assert.equal(Number(row.boxCount), 1 + connections * (collision ? 1 : 2));
      const boxes = boxesFor(row);
      assert.equal(Number(boxes[0].maxY) - Number(row.y), collision ? 1.5 : 1);
      const ranges = [[.4375, 0, .5625, .375], [.625, .4375, 1, .5625],
        [.4375, .625, .5625, 1], [0, .4375, .375, .5625]];
      const sides = Number(row.mask) === -1 ? [1, 3] : [0, 1, 2, 3].filter(side => Number(row.mask) & (1 << side));
      // At most four connection sides, each contributes one box or two rails.
      sides.forEach((side, index) => {
        const box = boxes[1 + index * (collision ? 1 : 2)];
        assert.deepEqual([Number(box.minX) - Number(row.x), Number(box.minZ) - Number(row.z),
          Number(box.maxX) - Number(row.x), Number(box.maxZ) - Number(row.z)], ranges[side]);
      });
      if (row.category === 'item-fence') {
        assert.equal(Number(boxes[1].minX) - Number(row.x), .625, 'first arm points east');
        assert.equal(Number(boxes[collision ? 2 : 3].minX) - Number(row.x), 0, 'second arm points west');
      }
    }
  });
});

test('shape fixtures cover stair quadrants, door orientations and opacity independently', () => {
  withFixtures(({ cases, boxesFor }) => {
    for (const row of cases.filter(row => row.category === 'stairs')) {
      const expected = row.stairShape.startsWith('outer') ? 2 : row.stairShape.startsWith('inner') ? 4 : 3;
      assert.equal(Number(row.boxCount), expected);
      const base = boxesFor(row)[0];
      assert.equal(Number(base.minY) - Number(row.y), row.half === 'top' ? .5 : 0);
    }
    const doors = cases.filter(row => row.category === 'doors' && row.x === '0' && row.kind === 'collision');
    assert.equal(doors.length, 16);
    const north = doors.find(row => row.facing === 'north' && row.open === '0');
    assert.equal(Number(boxesFor(north)[0].minZ), .8125);
    const leftOpen = doors.find(row => row.facing === 'north' && row.open === '1' && row.hinge === 'left');
    const rightOpen = doors.find(row => row.facing === 'north' && row.open === '1' && row.hinge === 'right');
    assert.equal(Number(boxesFor(leftOpen)[0].maxX), .1875);
    assert.equal(Number(boxesFor(rightOpen)[0].minX), .8125);
    assert.ok(cases.filter(row => row.id === 'glass').every(row => row.fullCube === '1' && row.opaque === '0'));
    assert.ok(cases.filter(row => row.type === 'double').every(row => row.fullCube === '1' && row.opaque === '1'));
  });
});

test('negative world translations preserve box order and exact addition results', () => {
  withFixtures(({ cases, boxesFor }) => {
    const identity = row => CASE_FIELDS.split(',').filter(field => !['case', 'x', 'y', 'z'].includes(field))
      .map(field => row[field]).join(',');
    const origin = new Map(cases.filter(row => row.x === '0').map(row => [identity(row), row]));
    for (const row of cases.filter(row => row.x !== '0')) {
      assert.deepEqual([Number(row.x), Number(row.y), Number(row.z)], [-17, -3, -.5]);
      const local = origin.get(identity(row));
      assert.ok(local, `missing origin counterpart for ${row.case}`);
      const localBoxes = boxesFor(local), shifted = boxesFor(row);
      for (let index = 0; index < shifted.length; index++) for (const end of ['min', 'max'])
        for (const axis of ['X', 'Y', 'Z']) assert.ok(Object.is(Number(shifted[index][`${end}${axis}`]),
          Number(row[axis.toLowerCase()]) + Number(localBoxes[index][`${end}${axis}`])));
    }
  });
});

test('shape fixture generation is byte deterministic', () => {
  const a = mkdtempSync(join(tmpdir(), 'shapes-a-'));
  const b = mkdtempSync(join(tmpdir(), 'shapes-b-'));
  try {
    generateShapes(a);
    generateShapes(b);
    for (const file of FILES) assert.ok(readFileSync(join(a, 'shapes', file))
      .equals(readFileSync(join(b, 'shapes', file))), file);
  } finally {
    rmSync(a, { recursive: true, force: true });
    rmSync(b, { recursive: true, force: true });
  }
});
