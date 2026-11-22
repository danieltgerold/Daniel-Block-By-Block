export const SMELTING = new Map(), FUELS = new Map();
export const registerSmelting = recipe => {
  if (!recipe.id || !recipe.input || !recipe.output || !Number.isSafeInteger(recipe.count) || recipe.count < 1 || !Number.isSafeInteger(recipe.ticks) || recipe.ticks < 1) throw new Error('Invalid smelting recipe');
  return SMELTING.set(recipe.input, Object.freeze({ ...recipe }));
};
export const registerFuel = (id, ticks) => { if (!Number.isSafeInteger(ticks) || ticks <= 0) throw new Error('Invalid fuel duration'); FUELS.set(id, ticks); };
registerSmelting({ id: 'sand.glass', input: 'sand', output: 'glass', count: 1, ticks: 200, name: 'Glass' });
registerSmelting({ id: 'porkchop.cooked', input: 'raw.porkchop', output: 'cooked.porkchop', count: 1, ticks: 200, name: 'Cooked Porkchop' });
for(const [input,output] of [['iron.ore','iron.ingot'],['gold.ore','gold.ingot'],['cobblestone','stone'],['stone.bricks','cracked.stone.bricks']])
  registerSmelting({id:`${input}.smelt`,input,output,count:1,ticks:200});
registerFuel('coal',1600);
for (const wood of ['oak', 'pine']) {
  for (const part of ['log', 'planks', 'fence', 'stairs']) registerFuel(`${wood}.${part}`, 300);
  registerFuel(`${wood}.door`, 200); registerFuel(`${wood}.slab`, 150);
}
registerFuel('crafting.table', 300); registerFuel('stick', 100);
export class FurnaceEntity {
  constructor(saved = {}) {
    this.slots = Array.from({ length: 3 }, (_, i) => saved.slots?.[i] ? { ...saved.slots[i] } : null);
    this.burnTime = saved.burnTime ?? 0; this.burnDuration = saved.burnDuration ?? 0;
    this.cookTime = saved.cookTime ?? 0; this.recipeId = saved.recipeId ?? null;
    this.listeners = new Set(); this.revision = 0; this.removed = false;
  }
  subscribe(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn); }
  changed() { this.revision++; for (const fn of this.listeners) fn(); }
  get recipe() { return SMELTING.get(this.slots[0]?.id); }
  canCook() {
    const r = this.recipe, out = this.slots[2];
    return Boolean(r && this.slots[0]?.count > 0 && (!out || out.id === r.output) && (out?.count ?? 0) + r.count <= 64);
  }
  tick() {
    if (this.removed) return;
    const previousBurn = this.burnTime, previousCook = this.cookTime, previousRecipe = this.recipeId; let slotsChanged = false;
    if (this.burnTime > 0) this.burnTime--;
    const recipe = this.recipe, valid = this.canCook();
    if (this.recipeId !== (recipe?.id ?? null)) this.cookTime = 0;
    this.recipeId = recipe?.id ?? null;
    if (!this.burnTime && valid && FUELS.has(this.slots[1]?.id)) {
      this.burnDuration = this.burnTime = FUELS.get(this.slots[1].id);
      if (!--this.slots[1].count) this.slots[1] = null;
      slotsChanged = true;
    }
    if (!valid) this.cookTime = 0;
    else if (this.burnTime > 0) {
      if (++this.cookTime >= recipe.ticks) {
        if (!--this.slots[0].count) this.slots[0] = null;
        this.slots[2] = { id: recipe.output, count: (this.slots[2]?.count ?? 0) + recipe.count }; this.cookTime = 0;
        slotsChanged = true;
      }
    } else this.cookTime = Math.max(0, this.cookTime - 2);
    if (slotsChanged || previousBurn !== this.burnTime || previousCook !== this.cookTime || previousRecipe !== this.recipeId) this.changed();
  }
  toJSON() { return { slots: this.slots.map(s => s ? { ...s } : null), burnTime: this.burnTime, burnDuration: this.burnDuration, cookTime: this.cookTime, recipeId: this.recipeId }; }
}
