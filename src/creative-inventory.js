import { ITEMS, HOTBAR, MAIN, OFFHAND } from './inventory.js';

export const CREATIVE_CATEGORIES = [
  ['building', 'Building'], ['nature', 'Nature'], ['functional', 'Functional'], ['materials', 'Materials'],
];
// Explicit kind/material metadata wins; conventional <material>.<kind> IDs
// supply useful defaults. Unknown kinds/items remain visible after known ones.
export const CREATIVE_KIND_ORDER = ['test.block', 'stone', 'cobblestone', 'dirt', 'grass.block', 'sand', 'gravel',
  'planks', 'log', 'slab', 'stairs', 'fence', 'door', 'leaves', 'glass', 'crafting.table', 'furnace', 'stick'];
export const CREATIVE_MATERIAL_ORDER = ['oak', 'pine'];
export function creativeOrder(item) {
  const parts = item.id.split('.');
  const kind = item.creativeKind ?? (parts.length > 1 && !CREATIVE_KIND_ORDER.includes(item.id) ? parts.slice(1).join('.') : item.id);
  const material = item.creativeMaterial ?? (kind !== item.id ? parts[0] : '');
  return { kind, material };
}
function compareItems(a, b) {
  const x = creativeOrder(a), y = creativeOrder(b);
  const rank = (list, value) => { const index = list.indexOf(value); return index < 0 ? list.length : index; };
  const compareText = (s, t) => s.localeCompare(t, 'en', { numeric: true, sensitivity: 'base' });
  return rank(CREATIVE_KIND_ORDER, x.kind) - rank(CREATIVE_KIND_ORDER, y.kind) || compareText(x.kind, y.kind)
    || rank(CREATIVE_MATERIAL_ORDER, x.material) - rank(CREATIVE_MATERIAL_ORDER, y.material)
    || compareText(x.material, y.material) || compareText(a.name ?? a.id, b.name ?? b.id) || compareText(a.id, b.id);
}
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
      && (!term || `${item.name} ${item.id}`.toLowerCase().includes(term))).sort(compareItems);
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
  discardCursor(whole = true) {
    if (!this.enabled() || !this.inventory.cursor) return false;
    if (whole || --this.inventory.cursor.count === 0) this.inventory.cursor = null;
    this.inventory.changed(); return true;
  }
  destroy(all = false) {
    if (!this.enabled()) return false;
    if (all) for (const i of [...HOTBAR, ...MAIN, 36, 37, 38, 39, OFFHAND]) this.inventory.slots[i] = null;
    this.inventory.cursor = null; this.inventory.changed(); return true;
  }
}
