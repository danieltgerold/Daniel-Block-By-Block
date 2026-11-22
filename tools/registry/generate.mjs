// Writes the Java block table and its golden CSV from the JS registry. Run via `npm run golden`.
import { mkdirSync, writeFileSync } from 'node:fs';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { BLOCK_TYPES } from '../../src/block-types.js';
import { blockRows, blocksCsv, javaBlocksSource } from './export.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

export function generateRegistry(rootDir = root) {
  const rows = blockRows(BLOCK_TYPES);
  const javaDir = join(rootDir, 'core/src/main/java/blockbyblock/core/world/shape');
  const goldenDir = join(rootDir, 'tests/golden/registry');
  mkdirSync(javaDir, { recursive: true });
  mkdirSync(goldenDir, { recursive: true });
  writeFileSync(join(javaDir, 'GeneratedBlocks.java'), javaBlocksSource(rows));
  writeFileSync(join(goldenDir, 'blocks.csv'), blocksCsv(rows));
  return rows.length;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) console.log(`registry: ${generateRegistry(process.argv[2] ?? root)} blocks`);
