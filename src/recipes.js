// Recipe data/matching has no DOM or inventory mutations. A server can use it too.
export const INGREDIENT_GROUPS = new Map([['planks', { tag: 'wood.planks' }]]);
export const registerIngredientGroup = (id, selector) => INGREDIENT_GROUPS.set(id, selector);
const ingredient = value => typeof value === 'string' ? { item: value, count: 1 } : { count: 1, ...value };
export function ingredientMatches(id, value, items) {
  const input = ingredient(value), group = input.group ? INGREDIENT_GROUPS.get(input.group) : input;
  return input.item ? id === input.item : Array.isArray(group) ? group.includes(id)
    : Boolean(group?.tag && items.get(id)?.tags?.includes(group.tag));
}
export class RecipeRegistry {
  constructor() { this.recipes = new Map(); this.grids = new Map([[2, []], [3, []]]); this.byCount = new Map(); }
  register(definition) {
    if (!definition.id || this.recipes.has(definition.id)) throw new Error('Recipe IDs must be unique');
    let cells, width, height;
    if (definition.type === 'shaped') {
      const rows = definition.pattern;
      if (!rows?.length || rows.some(row => row.length !== rows[0].length)) throw new Error('Invalid recipe pattern');
      const occupied = rows.flatMap((row, y) => [...row].flatMap((symbol, x) => symbol === ' ' ? [] : [{ x, y }]));
      if (!occupied.length) throw new Error('Empty recipe');
      const x0 = Math.min(...occupied.map(p => p.x)), y0 = Math.min(...occupied.map(p => p.y));
      width = Math.max(...occupied.map(p => p.x)) - x0 + 1; height = Math.max(...occupied.map(p => p.y)) - y0 + 1;
      cells = Array.from({ length: width * height }, (_, i) => {
        const symbol = rows[y0 + Math.floor(i / width)][x0 + i % width];
        if (symbol === ' ') return null;
        if (!definition.key?.[symbol]) throw new Error(`Missing recipe key: ${symbol}`);
        return ingredient(definition.key[symbol]);
      });
    } else if (definition.type === 'shapeless') {
      cells = definition.ingredients.map(ingredient); width = height = null;
    } else throw new Error('Unknown recipe type');
    if (!cells.some(Boolean) || cells.some(c => c && (!Number.isSafeInteger(c.count) || c.count < 1))) throw new Error('Invalid ingredients');
    if (!definition.output?.id || !Number.isSafeInteger(definition.output.count) || definition.output.count < 1) throw new Error('Invalid output');
    const count = cells.filter(Boolean).length;
    const grids = (definition.grids ?? [2, 3]).filter(size => [2, 3].includes(size)
      && (width ? width <= size && height <= size : count <= size * size));
    const recipe = Object.freeze({ mirror: true, category: 'building', ...definition, cells, width, height, grids,
      output: Object.freeze({ ...definition.output }) });
    this.recipes.set(recipe.id, recipe);
    for (const size of grids) {
      this.grids.get(size).push(recipe);
      const key = `${size}:${count}`; if (!this.byCount.has(key)) this.byCount.set(key, []);
      this.byCount.get(key).push(recipe);
    }
    return recipe;
  }
  forGrid(size) { return this.grids.get(size) ?? []; }
  match(grid, size, items) {
    const count = grid.filter(Boolean).length;
    for (const recipe of this.byCount.get(`${size}:${count}`) ?? []) {
      const accepts = (stack, input) => input ? stack && stack.count >= input.count && ingredientMatches(stack.id, input, items) : !stack;
      if (recipe.type === 'shaped') {
        for (let y = 0; y <= size - recipe.height; y++) for (let x = 0; x <= size - recipe.width; x++) {
          for (const mirrored of recipe.mirror && recipe.width > 1 ? [false, true] : [false]) {
            const consume = []; let matches = true;
            for (let i = 0; i < size * size; i++) {
              const cx = i % size - x, cy = Math.floor(i / size) - y;
              const input = cx >= 0 && cx < recipe.width && cy >= 0 && cy < recipe.height
                ? recipe.cells[cy * recipe.width + (mirrored ? recipe.width - cx - 1 : cx)] : null;
              if (!accepts(grid[i], input)) { matches = false; break; }
              if (input) consume.push({ index: i, count: input.count });
            }
            if (matches) return { recipe, consume };
          }
        }
      } else {
        // Bipartite assignment handles overlapping exact/group ingredients.
        const slots = grid.flatMap((stack, index) => stack ? [{ stack, index }] : []), owners = new Map();
        const assign = (inputIndex, seen) => {
          for (let s = 0; s < slots.length; s++) if (!seen.has(s) && accepts(slots[s].stack, recipe.cells[inputIndex])) {
            seen.add(s);
            if (!owners.has(s) || assign(owners.get(s), seen)) { owners.set(s, inputIndex); return true; }
          }
          return false;
        };
        if (recipe.cells.every((_, i) => assign(i, new Set()))) return { recipe,
          consume: [...owners].map(([s, input]) => ({ index: slots[s].index, count: recipe.cells[input].count })) };
      }
    }
    return null;
  }
}
export function recipeLayout(recipe, size) {
  const layout = Array(size * size).fill(null);
  recipe.cells.forEach((input, i) => { if (input) layout[recipe.width ? Math.floor(i / recipe.width) * size + i % recipe.width : i] = input; });
  return layout;
}
export const RECIPES = new RecipeRegistry();
// Ready for the future iron item; deliberately absent from the active book
// until that ingredient exists. No iron progression is introduced here.
export const BUCKET_RECIPE = Object.freeze({ id: 'bucket', type: 'shaped', pattern: ['I I', ' I '],
  key: { I: 'iron.ingot' }, output: { id: 'bucket', count: 1 }, name: 'Bucket', category: 'materials', grids: [3] });
export function registerBucketRecipe(items) {
  if (items.has('iron.ingot') && items.has('bucket') && !RECIPES.recipes.has('bucket')) RECIPES.register(BUCKET_RECIPE);
}
for (const wood of ['oak', 'pine']) RECIPES.register({ id: `${wood}.planks`, type: 'shapeless',
  ingredients: [`${wood}.log`], output: { id: `${wood}.planks`, count: 4 }, name: `${wood === 'oak' ? 'Oak' : 'Pine'} Planks`, category: 'building', grids: [2, 3] });
RECIPES.register({ id: 'sticks', type: 'shaped', pattern: ['P', 'P'], key: { P: { group: 'planks' } },
  output: { id: 'stick', count: 4 }, name: 'Sticks', category: 'materials', grids: [2, 3] });
RECIPES.register({ id: 'crafting.table', type: 'shaped', pattern: ['PP', 'PP'], key: { P: { group: 'planks' } },
  output: { id: 'crafting.table', count: 1 }, name: 'Crafting Table', category: 'building', grids: [2, 3] });
for (const wood of ['oak', 'pine']) for (const [part, pattern, count] of [['slab', ['PPP'], 6], ['fence', ['PSP', 'PSP'], 3], ['door', ['PP', 'PP', 'PP'], 3]]) {
  RECIPES.register({ id: `${wood}.${part}`, type: 'shaped', pattern, key: { P: `${wood}.planks`, S: 'stick' },
    output: { id: `${wood}.${part}`, count }, name: `${wood === 'oak' ? 'Oak' : 'Pine'} ${part[0].toUpperCase() + part.slice(1)}`, category: 'building', grids: [3] });
}
RECIPES.register({ id: 'furnace', type: 'shaped', pattern: ['CCC', 'C C', 'CCC'], key: { C: 'cobblestone' }, output: { id: 'furnace', count: 1 }, name: 'Furnace', category: 'building', grids: [3] });
for (const wood of ['oak', 'pine']) RECIPES.register({ id: `${wood}.stairs`, type: 'shaped', pattern: ['P  ', 'PP ', 'PPP'], key: { P: `${wood}.planks` },
  output: { id: `${wood}.stairs`, count: 4 }, name: `${wood === 'oak' ? 'Oak' : 'Pine'} Stairs`, category: 'building', grids: [3] });
