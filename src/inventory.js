export const ITEMS = new Map();
import { BLOCK_COLOR } from './block-appearance.js';
export function registerItem(definition) {
  if (!definition.id || !Number.isSafeInteger(definition.maxStack) || definition.maxStack < 1) throw new Error('Invalid item definition');
  ITEMS.set(definition.id, Object.freeze({ ...definition }));
}
registerItem({ id: 'test.block', name: 'Test Block', maxStack: 64, block: true, color: BLOCK_COLOR });
export const HOTBAR = Array.from({ length: 9 }, (_, i) => i);
export const MAIN = Array.from({ length: 27 }, (_, i) => i + 9);
export const STORAGE = [...HOTBAR, ...MAIN];
export const ARMOR = ['head', 'chest', 'legs', 'feet'];
export const OFFHAND = 40;
export const copyStack = stack => stack ? { ...stack } : null;
export const quantity = count => typeof count === 'bigint' ? count : BigInt(count);

export class PlayerInventory {
  constructor({ onDrop = () => {} } = {}) {
    this.slots = Array(41).fill(null);
    this.cursor = null;
    this.selected = 0;
    this.onDrop = onDrop;
    this.listeners = new Set();
  }
  subscribe(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn); }
  changed() { for (const fn of this.listeners) fn(); }
  accepts(index, id) {
    const item = ITEMS.get(id);
    return Boolean(item && index >= 0 && index < 41 && (index < 36 || index === OFFHAND || item.armor === ARMOR[index - 36]));
  }
  capacity(id, indices = STORAGE) {
    const item = ITEMS.get(id);
    const offhand = indices === STORAGE && this.offhand?.id === id ? item.maxStack - this.offhand.count : 0;
    return item ? offhand + indices.reduce((sum, i) => sum + (this.accepts(i, id) && (!this.slots[i] || this.slots[i].id === id)
      ? item.maxStack - (this.slots[i]?.count ?? 0) : 0), 0) : 0;
  }
  insert(id, count, indices = STORAGE) {
    let remaining = quantity(count);
    if (!ITEMS.has(id) || remaining < 0n) throw new Error('Invalid item stack');
    const partials = indices === STORAGE ? [this.selected, OFFHAND, ...STORAGE.filter(i => i !== this.selected)] : indices;
    for (const empty of [false, true]) for (const i of empty ? indices : partials) {
      if (!remaining) break;
      const stack = this.slots[i];
      if (!this.accepts(i, id) || (empty ? Boolean(stack) : !stack || stack.id !== id)) continue;
      const amount = Number(remaining < BigInt(ITEMS.get(id).maxStack - (stack?.count ?? 0))
        ? remaining : BigInt(ITEMS.get(id).maxStack - (stack?.count ?? 0)));
      if (amount) { this.slots[i] = { id, count: (stack?.count ?? 0) + amount }; remaining -= BigInt(amount); }
    }
    this.changed();
    return remaining;
  }
  select(index) { this.selected = (index + 9) % 9; this.changed(); }
  get mainHand() { return this.slots[this.selected]; }
  get offhand() { return this.slots[OFFHAND]; }
  consumeSelected() {
    const stack = this.mainHand;
    if (!stack) return false;
    if (--stack.count === 0) this.slots[this.selected] = null;
    this.changed(); return true;
  }
  click(index, button = 0) {
    const stack = this.slots[index];
    if (!this.cursor) {
      if (!stack) return;
      const count = button === 2 ? Math.ceil(stack.count / 2) : stack.count;
      this.cursor = { id: stack.id, count };
      stack.count -= count;
      if (!stack.count) this.slots[index] = null;
    } else if (this.accepts(index, this.cursor.id)) {
      if (!stack || stack.id === this.cursor.id) {
        const amount = Math.min(button === 2 ? 1 : this.cursor.count, ITEMS.get(this.cursor.id).maxStack - (stack?.count ?? 0));
        this.slots[index] = { id: this.cursor.id, count: (stack?.count ?? 0) + amount };
        this.cursor.count -= amount;
        if (!this.cursor.count) this.cursor = null;
      } else [this.slots[index], this.cursor] = [this.cursor, stack];
    }
    this.changed();
  }
  dragPlan(indices, button) {
    const plan = new Map();
    if (!this.cursor) return plan;
    const eligible = [...new Set(indices)].filter(i => this.accepts(i, this.cursor.id)
      && (!this.slots[i] || this.slots[i].id === this.cursor.id) && (this.slots[i]?.count ?? 0) < ITEMS.get(this.cursor.id).maxStack);
    const share = button === 2 ? 1 : Math.floor(this.cursor.count / (eligible.length || 1));
    let left = this.cursor.count;
    for (const i of eligible) {
      const count = Math.min(share, left, ITEMS.get(this.cursor.id).maxStack - (this.slots[i]?.count ?? 0));
      if (count) { plan.set(i, count); left -= count; }
    }
    return plan;
  }
  drag(indices, button) {
    for (const [i, count] of this.dragPlan(indices, button)) {
      this.slots[i] = { id: this.cursor.id, count: (this.slots[i]?.count ?? 0) + count };
      this.cursor.count -= count;
    }
    if (this.cursor?.count === 0) this.cursor = null;
    this.changed();
  }
  shift(index) {
    const stack = this.slots[index];
    if (!stack) return;
    const target = index < 9 ? MAIN : index < 36 ? HOTBAR : STORAGE;
    const remaining = this.insert(stack.id, stack.count, target);
    this.slots[index] = remaining ? { id: stack.id, count: Number(remaining) } : null;
    this.changed();
  }
  shiftMatching(id, fromHotbar) {
    for (const i of fromHotbar ? HOTBAR : MAIN) if (this.slots[i]?.id === id) this.shift(i);
  }
  collect(id = this.cursor?.id) {
    if (!id || (this.cursor && this.cursor.id !== id)) return;
    if (!this.cursor) this.cursor = { id, count: 0 };
    for (const i of [...STORAGE, OFFHAND, 36, 37, 38, 39]) {
      const stack = this.slots[i];
      if (stack?.id !== id) continue;
      const amount = Math.min(stack.count, ITEMS.get(id).maxStack - this.cursor.count);
      this.cursor.count += amount; stack.count -= amount;
      if (!stack.count) this.slots[i] = null;
    }
    if (!this.cursor.count) this.cursor = null;
    this.changed();
  }
  swap(a, b) {
    const left = this.slots[a], right = this.slots[b];
    if ((left && !this.accepts(b, left.id)) || (right && !this.accepts(a, right.id))) return false;
    [this.slots[a], this.slots[b]] = [right, left]; this.changed(); return true;
  }
  drop(index, whole = false) {
    const stack = this.slots[index];
    if (!stack) return;
    const count = whole ? stack.count : 1;
    this.onDrop({ id: stack.id, count }); stack.count -= count;
    if (!stack.count) this.slots[index] = null;
    this.changed();
  }
  dropCursor(whole = false) {
    if (!this.cursor) return;
    const count = whole ? this.cursor.count : 1;
    this.onDrop({ id: this.cursor.id, count }); this.cursor.count -= count;
    if (!this.cursor.count) this.cursor = null;
    this.changed();
  }
  close() {
    if (this.cursor) {
      const { id, count } = this.cursor;
      const remainder = this.insert(id, count);
      if (remainder) this.onDrop({ id, count: remainder });
      this.cursor = null;
    }
    this.changed();
  }
  pick(id) {
    let index = HOTBAR.find(i => this.slots[i]?.id === id);
    if (index !== undefined) this.select(index);
    else { index = MAIN.find(i => this.slots[i]?.id === id); if (index !== undefined) this.swap(index, this.selected); }
  }
}
