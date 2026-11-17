import { RECIPES, ingredientMatches, recipeLayout } from './recipes.js';
const copy = stack => stack ? { ...stack } : null;
// Only explicit storage indices participate; armor/offhand are never book supplies.
function insert(slots, indices, stack, items) {
  let left = stack.count; const cap = items.get(stack.id).maxStack;
  for (const empty of [false, true]) for (const i of indices) {
    const at = slots[i]; if (empty ? Boolean(at) : !at || at.id !== stack.id) continue;
    const n = Math.min(left, cap - (at?.count ?? 0));
    if (n) slots[i] = { id: stack.id, count: (at?.count ?? 0) + n };
    left -= n; if (!left) return 0;
  }
  return left;
}
export class CraftingSession {
  constructor(inventory, { items, storage, start = 41, registry = RECIPES }) {
    Object.assign(this, { inventory, items, storage, start, registry });
    this.size = 2; this.active = false; this.result = null; this.signature = ''; this.ghostRecipe = null;
  }
  get indices() { return Array.from({ length: this.size * this.size }, (_, i) => this.start + i); }
  get grid() { return this.indices.map(i => this.inventory.slots[i]); }
  get output() { return this.result ? { ...this.result.recipe.output } : null; }
  refresh() {
    const key = `${this.active}:${this.size}:` + this.grid.map(s => s ? `${s.id}:${s.count}` : '').join('|');
    if (key === this.signature) return;
    this.signature = key; this.result = this.active ? this.registry.match(this.grid, this.size, this.items) : null;
  }
  begin(size = 2) {
    if (![2, 3].includes(size)) throw new Error('Unsupported crafting grid');
    if (this.active) this.end();
    this.size = size; this.active = true; this.ghostRecipe = null; this.inventory.changed();
  }
  end() {
    const slots = this.inventory.slots.map(copy), overflow = [];
    for (let i = this.start; i < this.start + 9; i++) {
      const stack = slots[i]; slots[i] = null;
      if (stack) { const left = insert(slots, this.storage, stack, this.items); if (left) overflow.push({ id: stack.id, count: left }); }
    }
    this.inventory.slots = slots; this.active = false; this.ghostRecipe = null;
    for (const stack of overflow) this.inventory.onDrop(stack);
    this.refresh();
  }
  take({ destination = 'cursor', repeat = false, slot = null } = {}) {
    if (!this.active) return 0;
    let crafts = 0, recipeId = null;
    // At most 9*64 ingredients can be consumed. Never auto-refill the grid.
    for (let n = 0; n < (repeat ? 576 : 1); n++) {
      const match = this.registry.match(this.grid, this.size, this.items); if (!match) break;
      // A quick-move may expose another recipe as uneven stacks run out;
      // require another click rather than silently crafting a different result.
      if (recipeId !== null && recipeId !== match.recipe.id) break;
      recipeId = match.recipe.id;
      const output = match.recipe.output, cap = this.items.get(output.id).maxStack;
      const slots = this.inventory.slots.map(copy); let cursor = copy(this.inventory.cursor);
      if (destination === 'inventory') { if (insert(slots, this.storage, output, this.items)) break; }
      else if (destination === 'cursor') {
        if (cursor && cursor.id !== output.id || (cursor?.count ?? 0) + output.count > cap) break;
        cursor = { id: output.id, count: (cursor?.count ?? 0) + output.count };
      } else if (destination === 'slot') {
        if (!this.inventory.accepts(slot, output.id) || this.indices.includes(slot)) break;
        const at = slots[slot]; if (at && at.id !== output.id || (at?.count ?? 0) + output.count > cap) break;
        slots[slot] = { id: output.id, count: (at?.count ?? 0) + output.count };
      } else if (destination !== 'drop') break;
      for (const input of match.consume) {
        const at = this.start + input.index; slots[at].count -= input.count;
        if (!slots[at].count) slots[at] = null;
      }
      this.inventory.slots = slots; this.inventory.cursor = cursor; crafts++;
      if (destination === 'drop') this.inventory.onDrop({ ...output });
    }
    if (crafts) { this.ghostRecipe = null; this.inventory.changed(); }
    return crafts;
  }
  resources() {
    const counts = new Map();
    for (const i of [...this.storage, ...this.indices]) {
      const stack = this.inventory.slots[i]; if (stack) counts.set(stack.id, (counts.get(stack.id) ?? 0) + stack.count);
    }
    return counts;
  }
  assignments(recipe, crafts, accept = value => value) {
    const counts = this.resources(), layout = recipeLayout(recipe, this.size);
    const inputs = layout.flatMap((input, index) => input ? [{ input, index,
      candidates: [...counts.keys()].filter(id => ingredientMatches(id, input, this.items)
        && this.items.get(id).maxStack >= input.count * crafts) }] : []);
    inputs.sort((a, b) => a.candidates.length - b.candidates.length || a.index - b.index);
    const chosen = [];
    const visit = depth => {
      if (depth === inputs.length) return accept([...chosen]);
      const { input, index, candidates } = inputs[depth], need = input.count * crafts;
      const prior = inputs[depth - 1];
      for (const id of candidates) {
        // Avoid equivalent permutations of identical group slots.
        if (prior && JSON.stringify(prior.input) === JSON.stringify(input) && id < chosen[depth - 1].id) continue;
        if ((counts.get(id) ?? 0) < need) continue;
        counts.set(id, counts.get(id) - need); chosen.push({ index, id, count: need });
        const plan = visit(depth + 1); chosen.pop(); counts.set(id, counts.get(id) + need);
        if (plan) return plan;
      }
      return null;
    };
    return visit(0);
  }
  canMake(recipe) { return this.active && recipe.grids.includes(this.size) && Boolean(this.assignments(recipe, 1)); }
  fill(recipeId, maximum = false) {
    const recipe = this.registry.recipes.get(recipeId);
    if (!this.active || !recipe?.grids.includes(this.size)) return { ok: false, reason: 'Recipe does not fit this grid.' };
    for (let crafts = maximum ? 64 : 1; crafts >= 1; crafts--) {
      const plan = this.assignments(recipe, crafts, assignment => {
        const slots = this.inventory.slots.map(copy), oldGrid = this.indices.map(i => copy(slots[i]));
        for (const i of this.indices) slots[i] = null;
        for (const target of assignment) {
          let need = target.count;
          for (const stack of oldGrid) if (stack?.id === target.id && need) { const n = Math.min(need, stack.count); stack.count -= n; need -= n; }
          for (const i of this.storage) if (slots[i]?.id === target.id && need) {
            const n = Math.min(need, slots[i].count); slots[i].count -= n; need -= n; if (!slots[i].count) slots[i] = null;
          }
          if (need) return null;
          slots[this.start + target.index] = { id: target.id, count: target.count };
        }
        for (const stack of oldGrid) if (stack?.count && insert(slots, this.storage, stack, this.items)) return null;
        return slots;
      });
      if (plan) { this.inventory.slots = plan; this.ghostRecipe = null; this.inventory.changed(); return { ok: true, crafts }; }
    }
    this.ghostRecipe = recipe; this.inventory.changed();
    return { ok: false, reason: this.canMake(recipe) ? 'Not enough inventory space to rearrange the grid.' : 'Missing ingredients.' };
  }
  ghost() {
    if (!this.ghostRecipe) return [];
    const counts = this.resources();
    return recipeLayout(this.ghostRecipe, this.size).map(input => {
      if (!input) return null;
      const choices = [...this.items.keys()].filter(id => ingredientMatches(id, input, this.items));
      const id = choices.find(id => (counts.get(id) ?? 0) >= input.count) ?? choices[0];
      const missing = (counts.get(id) ?? 0) < input.count;
      if (!missing) counts.set(id, counts.get(id) - input.count);
      return { id, count: input.count, missing };
    });
  }
}
