// Records what the JS recipe matcher does for crafting grids: every recipe in every legal
// placement (and mirrored), near-misses, and seeded random grids. The Java matcher must agree
// on the recipe chosen and on which cells are consumed, in the same order.
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { ITEMS } from '../../src/inventory.js';
import { RECIPES, ingredientMatches, recipeLayout } from '../../src/recipes.js';

const lcg = seed => () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;

const cellText = stack => stack ? `${stack.id}:${stack.count}` : '-';
const concrete = input => [...ITEMS.keys()].find(id => ingredientMatches(id, input, ITEMS));
const alternatives = input => [...ITEMS.keys()].filter(id => ingredientMatches(id, input, ITEMS)).slice(0, 3);

function record(rows, size, grid) {
  const match = RECIPES.match(grid, size, ITEMS);
  rows.push([rows.length, size, grid.map(cellText).join(';'), match?.recipe.id ?? '',
    match ? match.consume.map(c => `${c.index}:${c.count}`).join(';') : ''].join(','));
}

export function matchRows() {
  const rows = [];
  for (const recipe of RECIPES.recipes.values()) for (const size of recipe.grids) {
    const layout = recipeLayout(recipe, size);
    const placements = [];
    if (recipe.type === 'shaped') {
      for (let y = 0; y <= size - recipe.height; y++) for (let x = 0; x <= size - recipe.width; x++) placements.push([x, y]);
    } else placements.push([0, 0]);
    for (const [x, y] of placements) for (const mirrored of recipe.type === 'shaped' ? [false, true] : [false]) {
      const grid = Array(size * size).fill(null);
      recipe.cells.forEach((input, i) => {
        if (!input) return;
        const cx = recipe.width ? i % recipe.width : i % size, cy = recipe.width ? Math.floor(i / recipe.width) : Math.floor(i / size);
        const col = recipe.width && mirrored ? recipe.width - 1 - cx : cx;
        const index = recipe.width ? (cy + y) * size + col + x : i;
        grid[index] = { id: concrete(input), count: input.count };
      });
      record(rows, size, grid);
      record(rows, size, grid.map(s => s && { ...s, count: s.count + 2 })); // extra items still craft
      const filled = grid.flatMap((s, i) => s ? [i] : []);
      record(rows, size, grid.map((s, i) => i === filled[0] && s.count > 1 ? { ...s, count: s.count - 1 } : s)); // too few
      record(rows, size, grid.map((s, i) => i === filled.at(-1) ? null : s)); // missing one
      record(rows, size, grid.map((s, i) => i === filled[0] ? { id: 'dirt', count: s.count } : s)); // wrong item
    }
    // Other legal items for tag ingredients (oak vs pine planks), once per recipe.
    const tagged = layout.findIndex(input => input && !input.item);
    if (tagged >= 0) for (const id of alternatives(layout[tagged])) {
      const grid = layout.map(input => input ? { id: input.item ?? id, count: input.count } : null);
      record(rows, size, grid);
    }
  }
  const pool = ['oak.planks', 'pine.planks', 'stick', 'cobblestone', 'stone', 'oak.log', 'pine.log', 'iron.ingot', 'coal', 'dirt',
    'stone.bricks', 'granite', 'stone.slab', 'diamond', 'iron.block', 'lapis.block', 'raw.porkchop'];
  const rand = lcg(2024);
  for (let i = 0; i < 900; i++) {
    const size = rand() < 0.5 ? 2 : 3, fill = rand();
    record(rows, size, Array.from({ length: size * size }, () => rand() < fill
      ? { id: pool[Math.floor(rand() * pool.length)], count: 1 + Math.floor(rand() * 9) } : null));
  }
  return rows;
}

export function generateCrafting(outDir) {
  const dir = join(outDir, 'crafting');
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'match.csv'), ['case,size,grid,recipe,consume', ...matchRows()].join('\n') + '\n');
}
