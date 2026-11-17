import { ITEMS, HOTBAR, MAIN, OFFHAND } from './inventory.js';

export const CREATIVE_CATEGORIES = [
  ['building', 'Building'], ['nature', 'Nature'], ['functional', 'Functional'], ['materials', 'Materials'],
];
export function creativeCategory(item) {
  if (item.creativeCategory) return item.creativeCategory;
  if (!item.block) return 'materials';
  if (['crafting.table', 'furnace'].includes(item.id)) return 'functional';
  if (item.tags?.includes('leaves') || item.tags?.includes('wood.logs') || ['dirt', 'grass.block', 'sand', 'gravel'].includes(item.id)) return 'nature';
  return 'building';
}

// Catalog templates never own real stacks. All creative-only mutations are
// guarded here as well as in the UI; the same real inventory survives modes.
export class CreativeInventory {
  constructor(inventory, enabled) { this.inventory = inventory; this.enabled = enabled; }
  items(category = 'search', query = '') {
    const term = query.trim().toLowerCase();
    return [...ITEMS.values()].filter(item => item.creativeVisible !== false
      && (category === 'search' || creativeCategory(item) === category)
      && (!term || `${item.name} ${item.id}`.toLowerCase().includes(term)));
  }
  click(id, button = 0, shift = false) {
    if (!this.enabled() || !ITEMS.has(id)) return false;
    const inv = this.inventory, cap = ITEMS.get(id).maxStack, cursor = inv.cursor;
    if (button === 1 || !cursor) inv.cursor = { id, count: button === 1 || shift ? cap : 1 };
    else if (cursor.id === id && (button === 0 || shift)) cursor.count = shift ? cap : Math.min(cap, cursor.count + 1);
    else if (button === 2) { if (--cursor.count === 0) inv.cursor = null; }
    else inv.cursor = null;
    inv.changed(); return true;
  }
  hotbar(id, index) {
    if (!this.enabled() || !ITEMS.has(id) || !HOTBAR.includes(index)) return false;
    this.inventory.slots[index] = { id, count: ITEMS.get(id).maxStack }; this.inventory.changed(); return true;
  }
  drop(id, whole = false) {
    if (!this.enabled() || !ITEMS.has(id)) return false;
    this.inventory.onDrop({ id, count: whole ? ITEMS.get(id).maxStack : 1 }); return true;
  }
  clone(index) {
    const inv = this.inventory, stack = inv.slots[index];
    if (!this.enabled() || index < 0 || index > OFFHAND || inv.cursor || !stack) return false;
    inv.cursor = { id: stack.id, count: ITEMS.get(stack.id).maxStack }; inv.changed(); return true;
  }
  fillPlan(indices) {
    const plan = new Map(), inv = this.inventory;
    if (!this.enabled() || !inv.cursor) return plan;
    for (const i of new Set(indices)) if (i >= 0 && i <= OFFHAND && inv.accepts(i, inv.cursor.id)
      && (!inv.slots[i] || inv.slots[i].id === inv.cursor.id)) {
      const count = ITEMS.get(inv.cursor.id).maxStack - (inv.slots[i]?.count ?? 0);
      if (count > 0) plan.set(i, count);
    }
    return plan;
  }
  fill(indices) {
    for (const [i, count] of this.fillPlan(indices)) this.inventory.slots[i] = { id: this.inventory.cursor.id, count: (this.inventory.slots[i]?.count ?? 0) + count };
    if (this.enabled()) this.inventory.changed();
  }
  remove(index) {
    if (!this.enabled() || !HOTBAR.includes(index)) return false;
    this.inventory.slots[index] = null; this.inventory.changed(); return true;
  }
  destroy(all = false) {
    if (!this.enabled()) return false;
    if (all) for (const i of [...HOTBAR, ...MAIN, 36, 37, 38, 39, OFFHAND]) this.inventory.slots[i] = null;
    this.inventory.cursor = null; this.inventory.changed(); return true;
  }
}
