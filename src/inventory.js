export const ITEMS = new Map();
import { BLOCK_TYPES, onBlockTypeRegistered } from './block-types.js';
import { blockIcon, textureIcon } from './block-icons.js';
import { CraftingSession, insertItemStacks } from './crafting.js';
import { SMELTING, FUELS } from './smelting.js';
export function registerItem(definition) {
  if (!definition.id || !Number.isSafeInteger(definition.maxStack) || definition.maxStack < 1) throw new Error('Invalid item definition');
  ITEMS.set(definition.id, Object.freeze({ ...definition }));
}
const registerBlockItem = block => registerItem({ id: block.id, name: block.name,
  maxStack: block.maxStack, block: true, color: block.color, tags: block.tags, icon: blockIcon(block.id),
  ...(block.itemTexture ? { model: 'flat', display: block.itemModel, texture: block.itemTexture } : {}) });
for (const block of BLOCK_TYPES.values()) registerBlockItem(block);
onBlockTypeRegistered(registerBlockItem);
registerItem({ id: 'stick', name: 'Stick', maxStack: 64, block: false, model: 'flat', display: 'handheld', texture: 'stick', color: '#ab8052', icon: textureIcon('stick') });
export const HOTBAR = Array.from({ length: 9 }, (_, i) => i);
export const MAIN = Array.from({ length: 27 }, (_, i) => i + 9);
export const STORAGE = [...HOTBAR, ...MAIN];
export const ARMOR = ['head', 'chest', 'legs', 'feet'];
export const OFFHAND = 40;
export const CRAFT_START = 41, CRAFT_OUTPUT = 50;
export const FURNACE_INPUT = 51, FURNACE_FUEL = 52, FURNACE_OUTPUT = 53;
export const copyStack = stack => stack ? { ...stack } : null;
export const quantity = count => typeof count === 'bigint' ? count : BigInt(count);

export class PlayerInventory {
  constructor({ onDrop = () => {} } = {}) {
    this.slots = Array(50).fill(null);
    this.cursor = null;
    this.selected = 0;
    this.onDrop = onDrop;
    this.listeners = new Set();
    this.crafting = new CraftingSession(this, { items: ITEMS, storage: STORAGE, start: CRAFT_START });
    this.furnace = null;
  }
  subscribe(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn); }
  changed() { this.crafting.refresh(); this.furnace?.changed(); for (const fn of this.listeners) fn(); }
  isSlot(index) { return Number.isInteger(index) && index >= 0 && (index < 41 || this.crafting.active && this.crafting.indices.includes(index)
    || this.furnace && index >= FURNACE_INPUT && index <= FURNACE_OUTPUT); }
  accepts(index, id) {
    const item = ITEMS.get(id);
    if (index === FURNACE_OUTPUT) return false;
    if (index === FURNACE_FUEL) return Boolean(this.furnace && item && FUELS.has(id));
    if (index === FURNACE_INPUT) return Boolean(this.furnace && item);
    return Boolean(item && this.isSlot(index) && (index < 36 || index === OFFHAND || index >= CRAFT_START || item.armor === ARMOR[index - 36]));
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
    if (index === FURNACE_OUTPUT && this.cursor) {
      if (!stack || stack.id !== this.cursor.id) return;
      const n = Math.min(button === 2 ? 1 : stack.count, ITEMS.get(stack.id).maxStack - this.cursor.count);
      if (n > 0) { this.cursor.count += n; stack.count -= n; if (!stack.count) this.slots[index] = null; this.changed(); }
      return;
    }
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
    let target = index < 9 ? MAIN : index < 36 ? HOTBAR : STORAGE;
    if (this.furnace && index < 36) {
      if (SMELTING.has(stack.id)) target = [FURNACE_INPUT]; else if (FUELS.has(stack.id)) target = [FURNACE_FUEL];
    }
    const remaining = this.insert(stack.id, stack.count, target);
    this.slots[index] = remaining ? { id: stack.id, count: Number(remaining) } : null;
    this.changed();
  }
  shiftMatching(id, fromHotbar, fromCraft = false) {
    for (const i of fromCraft ? this.crafting.indices : fromHotbar ? HOTBAR : MAIN) if (this.slots[i]?.id === id) this.shift(i);
  }
  collect(id = this.cursor?.id) {
    if (!id || (this.cursor && this.cursor.id !== id)) return;
    if (!this.cursor) this.cursor = { id, count: 0 };
    for (const i of [...STORAGE, OFFHAND, 36, 37, 38, 39, ...(this.crafting.active ? this.crafting.indices : []), ...(this.furnace ? [FURNACE_INPUT, FURNACE_FUEL, FURNACE_OUTPUT] : [])]) {
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
    if (!this.isSlot(a) || !this.isSlot(b)) return false;
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
    return true;
  }
  dropCursor(whole = false) {
    if (!this.cursor) return;
    const count = whole ? this.cursor.count : 1;
    this.onDrop({ id: this.cursor.id, count }); this.cursor.count -= count;
    if (!this.cursor.count) this.cursor = null;
    this.changed();
  }
  close() {
    this.closeFurnace();
    this.crafting.end();
    if (this.cursor) {
      const { id, count } = this.cursor;
      const remainder = this.insert(id, count);
      if (remainder) this.onDrop({ id, count: remainder });
      this.cursor = null;
    }
    this.changed();
  }
  openFurnace(entity) {
    this.closeFurnace(); this.crafting.end(); this.furnace = entity;
    for (let n = 0; n < 3; n++) Object.defineProperty(this.slots, FURNACE_INPUT + n, {
      configurable: true, enumerable: true, get: () => entity.slots[n], set: value => { entity.slots[n] = value; },
    });
    this.changed();
  }
  closeFurnace() {
    if (!this.furnace) return;
    for (let n = FURNACE_INPUT; n <= FURNACE_OUTPUT; n++) delete this.slots[n];
    this.slots.length = 50; this.furnace = null;
  }
  takeFurnaceOutputTo(index) {
    const out = this.furnace?.slots[2], target = this.slots[index];
    if (!out || !this.accepts(index, out.id) || target && target.id !== out.id) return false;
    const n = Math.min(out.count, ITEMS.get(out.id).maxStack - (target?.count ?? 0)); if (!n) return false;
    this.slots[index] = { id: out.id, count: (target?.count ?? 0) + n }; out.count -= n;
    if (!out.count) this.furnace.slots[2] = null; this.changed(); return true;
  }
  fillFurnaceInput(maximum = false, recipe = SMELTING.get('sand')) {
    const entity = this.furnace; if (!entity || !recipe) return { ok: false, reason: 'No furnace is open.' };
    const slots = this.slots.map(copyStack), old = copyStack(entity.slots[0]);
    const available = STORAGE.reduce((n, i) => n + (slots[i]?.id === recipe.input ? slots[i].count : 0), old?.id === recipe.input ? old.count : 0);
    if (!available) return { ok: false, reason: `Missing ${ITEMS.get(recipe.input).name}.` };
    const count = maximum ? Math.min(64, available) : 1; let need = count;
    if (old?.id === recipe.input) { const n = Math.min(need, old.count); need -= n; old.count -= n; }
    for (const i of STORAGE) if (slots[i]?.id === recipe.input && need) { const n = Math.min(need, slots[i].count); need -= n; slots[i].count -= n; if (!slots[i].count) slots[i] = null; }
    if (old?.count && insertItemStacks(slots, STORAGE, old, ITEMS)) return { ok: false, reason: 'Not enough inventory space to move the old input.' };
    for (const i of STORAGE) this.slots[i] = slots[i]; entity.slots[0] = { id: recipe.input, count }; this.changed(); return { ok: true };
  }
  pick(id, { creative = false } = {}) {
    if (!ITEMS.has(id)) return false;
    let index = HOTBAR.find(i => this.slots[i]?.id === id);
    if (index !== undefined) { this.select(index); return true; }
    if (creative) {
      index = HOTBAR.find(i => !this.slots[i]) ?? this.selected;
      const displaced = this.slots[index]; this.slots[index] = null;
      if (displaced) {
        const remaining = this.insert(displaced.id, displaced.count, MAIN);
        if (remaining) this.onDrop({ id: displaced.id, count: remaining });
      }
      this.slots[index] = { id, count: 1 }; this.select(index); return true;
    }
    index = MAIN.find(i => this.slots[i]?.id === id);
    return index !== undefined ? this.swap(index, this.selected) : false;
  }
}
