import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';
import { formatBool, formatNumber } from '../tools/golden/format.mjs';
import { generate } from '../tools/golden/generate.mjs';

test('formatNumber keeps signed zero and round-trips doubles', () => {
  assert.equal(formatNumber(-0), '-0');
  assert.equal(formatNumber(0), '0');
  for (const v of [0.1, -2.067678045460254, 1e-320, 1.7976931348623157e308, Infinity, -Infinity])
    assert.ok(Object.is(Number(formatNumber(v)), v), `round-trip ${v}`);
  assert.ok(Number.isNaN(Number(formatNumber(NaN))));
  assert.equal(formatBool(true), '1');
  assert.equal(formatBool(false), '0');
});

const listFiles = dir => readdirSync(dir, { recursive: true, withFileTypes: true })
  .filter(entry => entry.isFile())
  .map(entry => relative(dir, join(entry.parentPath, entry.name)))
  .sort();

test('generator is deterministic', () => {
  const a = mkdtempSync(join(tmpdir(), 'golden-a-'));
  const b = mkdtempSync(join(tmpdir(), 'golden-b-'));
  try {
    generate(a);
    generate(b);
    const files = listFiles(a);
    assert.ok(files.length >= 18, `expected at least 18 files, got ${files.length}`);
    assert.deepEqual(listFiles(b), files);
    for (const file of files) assert.ok(readFileSync(join(a, file)).equals(readFileSync(join(b, file))), file);
  } finally {
    rmSync(a, { recursive: true, force: true });
    rmSync(b, { recursive: true, force: true });
  }
});
