// Writes the Java block table and its golden CSV from the JS registry. Run via `npm run golden`.
import { mkdirSync, writeFileSync } from 'node:fs';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { BLOCK_TYPES } from '../../src/block-types.js';
import { ITEMS } from '../../src/inventory.js';
import { RECIPES } from '../../src/recipes.js';
import { SMELTING, FUELS } from '../../src/smelting.js';
import { blockRows, blocksCsv, javaBlocksSource, itemRows, itemsCsv, javaItemsSource,
  recipeRows, recipesCsv, smeltingRows, smeltingCsv, fuelRows, fuelsCsv, javaRecipesSource } from './export.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

export function generateRegistry(rootDir = root) {
  const rows = blockRows(BLOCK_TYPES);
  const javaDir = join(rootDir, 'core/src/main/java/blockbyblock/core/world/shape');
  const goldenDir = join(rootDir, 'tests/golden/registry');
  mkdirSync(javaDir, { recursive: true });
  mkdirSync(goldenDir, { recursive: true });
  writeFileSync(join(javaDir, 'GeneratedBlocks.java'), javaBlocksSource(rows));
  writeFileSync(join(goldenDir, 'blocks.csv'), blocksCsv(rows));
  const items = itemRows(ITEMS), itemDir = join(rootDir, 'core/src/main/java/blockbyblock/core/item');
  mkdirSync(itemDir, { recursive: true });
  writeFileSync(join(itemDir, 'GeneratedItems.java'), javaItemsSource(items));
  writeFileSync(join(goldenDir, 'items.csv'), itemsCsv(items));
  const recipes = recipeRows(RECIPES, ITEMS), smelting = smeltingRows(SMELTING), fuels = fuelRows(FUELS);
  const recipeDir = join(rootDir, 'core/src/main/java/blockbyblock/core/recipe');
  mkdirSync(recipeDir, { recursive: true });
  writeFileSync(join(recipeDir, 'GeneratedRecipes.java'), javaRecipesSource(recipes, smelting, fuels));
  writeFileSync(join(goldenDir, 'recipes.csv'), recipesCsv(recipes));
  writeFileSync(join(goldenDir, 'smelting.csv'), smeltingCsv(smelting));
  writeFileSync(join(goldenDir, 'fuels.csv'), fuelsCsv(fuels));
  return `${rows.length} blocks, ${items.length} items, ${recipes.length} recipes, ${smelting.length} smelting, ${fuels.length} fuels`;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) console.log(`registry: ${generateRegistry(process.argv[2] ?? root)}`);
