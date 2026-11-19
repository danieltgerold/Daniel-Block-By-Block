import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { runParity } from '../../tools/parity/run-parity.mjs';
import * as core from '../../web-core/build/generated/teavm/js/core.js';

const cache = new Map();
async function readText(path) {
  if (!cache.has(path)) cache.set(path, await readFile(new URL(`../golden/${path}`, import.meta.url), 'utf8'));
  return cache.get(path);
}
function changed(path, transform) {
  return async requested => {
    const text = await readText(requested);
    return requested === path ? transform(text) : text;
  };
}
function editCell(text, line, field, value) {
  const rows = text.split('\n'), cells = rows[line].split(',');
  cells[field] = value;
  rows[line] = cells.join(',');
  return rows.join('\n');
}

test('compiled TeaVM core matches all reference suites by raw bits', async () => {
  const result = await runParity(core, readText);
  assert.equal(result.checked, 163_982, 'all six suites must contribute their full field coverage');
  assert.equal(result.mismatchCount, 0);
  assert.deepEqual(result.mismatches, []);
});

test('replay identifies the exact corrupted numerical row and signed-zero field', async () => {
  const path = 'movement/walk/expected.csv';
  const corrupt = await runParity(core, changed(path, text => editCell(text, 100, 0, '-99')));
  assert.equal(corrupt.mismatchCount, 1);
  assert.deepEqual(corrupt.mismatches.map(({ suite, scenario, row, field }) => ({ suite, scenario, row, field })),
    [{ suite: 'movement', scenario: 'walk', row: 101, field: 'x' }]);
  const signedZero = await runParity(core, changed(path, text => editCell(text, 1, 3, '-0')));
  assert.equal(signedZero.mismatchCount, 1);
  assert.equal(signedZero.mismatches[0].field, 'vx');
  assert.ok(Object.is(signedZero.mismatches[0].expected, -0));
  assert.ok(Object.is(signedZero.mismatches[0].actual, 0));
});

test('empty, truncated, malformed and invalid-boolean traces never pass', async () => {
  const cases = [
    ['movement/walk/expected.csv', text => text.split('\n')[0] + '\n', /rowCount|empty/],
    ['movement/walk/inputs.csv', text => text.split('\n').slice(0, -2).join('\n') + '\n', /rowCount/],
    ['world/queries.csv', text => text.replace('case,world,op', 'bad,world,op'), /header mismatch/],
    ['world/edits.csv', text => text.split('\n').slice(0, -2).join('\n') + '\n', /rowCount/],
    ['current/movement/flowing-water/edits.csv', text => text.split('\n').slice(0, -2).join('\n') + '\n', /rowCount/],
    ['shapes/boxes.csv', text => text.split('\n').slice(0, -2).join('\n') + '\n', /rowCount/],
    ['movement/walk/inputs.csv', text => editCell(text, 1, 2, 'yes'), /Invalid boolean/],
    ['trig/cases.csv', text => editCell(text, 1, 0, 'invalid'), /Invalid double bits/],
  ];
  // Eight finite adversarial files: every malformed read must reject explicitly.
  for (const [path, transform, message] of cases)
    await assert.rejects(runParity(core, changed(path, transform)), message, path);
});

test('compiled exports reject invalid edits instead of returning a plausible no-op', () => {
  core.reset(3);
  assert.equal(core.setBlock(0, -1, 0, true), false, 'restating base terrain is a legitimate no-op');
  assert.throws(() => core.setBlock(.5, -1, 0, true));
  assert.throws(() => core.setTypedBlock(0, 0, 0, 'missing.block', '', '', '', '', '', false, 0, false));
  assert.throws(() => core.setTypedBlock(0, 0, 0, 'water', '', '', '', '', '', false, 8, false));
});

test('the exported player state is a live zero-copy view across ticks', () => {
  core.reset(3); core.setPosition(.5, 0, .5);
  const state = core.stateView();
  assert.equal(state.length, 21);
  const before = state[2];
  core.step(1, 0, false, false, 0, 1, .42, 1, false, false, false, true);
  assert.notEqual(state[2], before, 'holding the view must observe the next refreshed Java state buffer');
});

test('resetCurrent starts on the four-layer terrain surface', () => {
  core.resetCurrent();
  const state = core.stateView();
  assert.deepEqual(Array.from(state.subarray(0, 3)), [.5, 4, .5]);
  core.step(1, 0, false, false, 0, 1, .42, 1, false, false, false, true);
  assert.equal(state[1], 4);
  assert.equal(state[8], 1);
});
