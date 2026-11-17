import { ITEMS, MAIN, HOTBAR, ARMOR, OFFHAND, CRAFT_START, CRAFT_OUTPUT, FURNACE_INPUT, FURNACE_FUEL, FURNACE_OUTPUT } from './inventory.js';
import { RecipeBookUI } from './recipe-book-ui.js';

export function drawStack(document, element, stack, extra = 0) {
  const signature = stack ? `${stack.id}:${stack.count + extra}` : '';
  if (element.dataset.stack === signature) return;
  element.dataset.stack = signature;
  element.replaceChildren();
  element.title = ''; // Names use the immediate in-game tooltip, not the browser delay.
  if (!stack) return;
  const item = ITEMS.get(stack.id);
  const icon = document.createElement(item.icon ? 'img' : 'span');
  icon.className = 'item-icon'; icon.setAttribute('aria-hidden', 'true');
  if (item.icon) { icon.src = item.icon; icon.alt = ''; icon.draggable = false; }
  icon.style.setProperty('--item-color', ITEMS.get(stack.id).color ?? '#d9dfcd');
  const count = document.createElement('span'); count.className = 'stack-count';
  count.textContent = stack.count + extra === 1 ? '' : String(stack.count + extra);
  element.append(icon, count);
}

export class InventoryUI {
  constructor({ inventory, document, window, onClose = () => {}, onGameplayDrop = () => {} }) {
    Object.assign(this, { inventory, document, window, onClose, onGameplayDrop });
    this.root = document.getElementById('inventory-screen');
    this.panel = document.getElementById('inventory-panel');
    this.cursorView = document.getElementById('cursor-stack');
    this.tooltip = document.getElementById('inventory-tooltip');
    this.pointer = { x: 0, y: 0 };
    this.hotbar = document.getElementById('hotbar');
    this.hovered = null; this.gesture = null; this.lastClick = null; this.isOpen = false;
    this.slotViews = new Map(); this.hudViews = new Map(); this.removers = [];
    const makeSlot = (parent, index, label, map) => {
      const button = document.createElement('button'); button.type = 'button';
      button.className = 'inventory-slot'; button.dataset.slot = String(index);
      button.dataset.label = label; button.setAttribute('aria-label', label);
      parent.append(button); map.set(index, button);
    };
    MAIN.forEach((i, n) => makeSlot(document.getElementById('inventory-main'), i, `Inventory ${n + 1}`, this.slotViews));
    HOTBAR.forEach((i, n) => {
      makeSlot(document.getElementById('inventory-hotbar'), i, `Hotbar ${n + 1}`, this.slotViews);
      makeSlot(this.hotbar, i, `Hotbar ${n + 1}`, this.hudViews);
    });
    ARMOR.forEach((name, n) => makeSlot(document.getElementById('inventory-armor'), 36 + n, name, this.slotViews));
    makeSlot(document.getElementById('inventory-offhand'), OFFHAND, 'Offhand', this.slotViews);
    for (let i = 0; i < 9; i++) makeSlot(document.getElementById('crafting-grid'), CRAFT_START + i, `Crafting input ${i + 1}`, this.slotViews);
    this.output = document.getElementById('crafting-output'); this.output.dataset.slot = CRAFT_OUTPUT;
    this.slotViews.set(CRAFT_OUTPUT, this.output);
    this.book = new RecipeBookUI({ document, crafting: inventory.crafting, drawStack });
    for (const [id, index, label] of [['furnace-input', FURNACE_INPUT, 'Furnace input'], ['furnace-fuel', FURNACE_FUEL, 'Furnace fuel'], ['furnace-output', FURNACE_OUTPUT, 'Furnace output']]) makeSlot(document.getElementById(id), index, label, this.slotViews);
    const listen = (target, name, fn) => { target.addEventListener(name, fn); this.removers.push(() => target.removeEventListener(name, fn)); };
    listen(this.root, 'contextmenu', e => e.preventDefault());
    listen(this.root, 'mousedown', e => this.mouseDown(e));
    listen(this.root, 'mouseover', e => {
      const slot = e.target.closest?.('[data-slot]');
      this.hovered = slot ? Number(slot.dataset.slot) : null;
      this.pointer = { x: e.clientX, y: e.clientY }; this.updateTooltip();
      if (this.gesture && slot) this.visit(this.hovered);
    });
    listen(this.root, 'mouseleave', () => { this.hovered = null; this.updateTooltip(); });
    listen(window, 'mousemove', e => {
      if (!this.isOpen) return;
      this.cursorView.style.left = `${e.clientX}px`; this.cursorView.style.top = `${e.clientY}px`;
      this.pointer = { x: e.clientX, y: e.clientY }; this.updateTooltip();
      this.preview?.aim(e.clientX, e.clientY);
    });
    listen(window, 'mouseup', e => {
      if (!this.gesture || e.button !== this.gesture.button) return;
      const { indices, button, start } = this.gesture;
      this.gesture = null;
      if (indices.size > 1 || (indices.size === 1 && !indices.has(start))) { inventory.drag(indices, button); this.lastClick = null; }
      else inventory.click(start, button);
      this.render();
    });
    listen(document.getElementById('inventory-close'), 'click', onClose);
    const toggleBook = () => {
      this.book.root.hidden = !this.book.root.hidden; this.panel.classList.toggle('book-open', !this.book.root.hidden);
      document.getElementById('recipe-book-toggle').setAttribute('aria-expanded', String(!this.book.root.hidden)); this.book.render(true);
    };
    listen(document.getElementById('recipe-book-toggle'), 'click', toggleBook);
    listen(document.getElementById('furnace-book-toggle'), 'click', toggleBook);
    this.unsubscribe = inventory.subscribe(() => this.render());
    this.render();
  }
  open(size = 2) {
    this.inventory.closeFurnace(); this.book.furnaceInventory = null; this.root.classList.remove('furnace-view');
    this.isOpen = true; this.root.hidden = false; this.hotbar.hidden = true;
    this.root.classList.toggle('table-view', size === 3);
    this.document.getElementById('crafting-grid').style.setProperty('--craft-size', size);
    this.inventory.crafting.begin(size); this.book.reset();
    this.hovered = null; this.gesture = null; this.lastClick = null;
    this.document.activeElement?.blur(); this.preview?.reset(); this.render();
  }
  close() {
    this.furnaceUnsubscribe?.(); this.furnaceUnsubscribe = null; this.book.furnaceInventory = null;
    this.gesture = null; this.hovered = null; this.lastClick = null;
    this.inventory.close(); this.isOpen = false; this.root.hidden = true;
    this.document.activeElement?.blur();
    this.cursorView.hidden = true; this.preview?.reset();
    this.tooltip.hidden = true;
  }
  openFurnace(entity) {
    this.isOpen = true; this.root.hidden = false; this.hotbar.hidden = true; this.root.classList.add('furnace-view');
    this.hovered = null; this.gesture = null; this.lastClick = null; this.document.activeElement?.blur();
    this.book.furnaceInventory = this.inventory; this.inventory.openFurnace(entity);
    this.furnaceUnsubscribe = entity.subscribe(() => { if (entity.removed) this.onClose(); else this.render(); });
    this.book.reset(); this.render();
  }
  updateTooltip() {
    const stack = this.hovered === null ? null : this.stackAt(this.hovered);
    this.tooltip.hidden = !this.isOpen || !stack;
    if (this.tooltip.hidden) return;
    this.tooltip.textContent = ITEMS.get(stack.id).name;
    const width = this.tooltip.offsetWidth || this.tooltip.textContent.length * 7 + 16;
    this.tooltip.style.left = `${Math.max(8, Math.min(this.pointer.x + 14, this.window.innerWidth - width - 8))}px`;
    this.tooltip.style.top = `${Math.max(8, this.pointer.y - 30)}px`;
  }
  mouseDown(event) {
    if (!this.isOpen || (event.button !== 0 && event.button !== 2)) return;
    if (event.target.closest?.('[data-recipe-book], #recipe-book-toggle, #furnace-book-toggle, input, select')) return;
    event.preventDefault();
    const slot = event.target.closest?.('[data-slot]');
    if (!slot) {
      if (!this.panel.contains(event.target)) this.inventory.dropCursor(event.button === 0);
      return;
    }
    const i = Number(slot.dataset.slot), now = this.window.performance.now();
    this.hovered = i;
    if (i === CRAFT_OUTPUT) {
      this.gesture = null; this.lastClick = null;
      this.inventory.crafting.take({ destination: event.shiftKey ? 'inventory' : 'cursor', repeat: event.shiftKey }); return;
    }
    if (!this.inventory.isSlot(i)) return;
    const id = this.inventory.slots[i]?.id ?? this.inventory.cursor?.id ?? this.lastClick?.id;
    const double = event.button === 0 && this.lastClick?.button === 0 && this.lastClick?.index === i && now - this.lastClick.time < 250
      && this.lastClick.shift === event.shiftKey && id === this.lastClick.id;
    if (event.shiftKey) {
      if (double && i >= FURNACE_INPUT) {
        for (const index of [FURNACE_INPUT, FURNACE_FUEL, FURNACE_OUTPUT]) if (this.inventory.slots[index]?.id === id) this.inventory.shift(index);
      } else if (double) this.inventory.shiftMatching(id, i < 9, i >= CRAFT_START && i < CRAFT_OUTPUT);
      else this.inventory.shift(i);
    } else if (double) this.inventory.collect(id);
    else if (this.inventory.cursor) {
      this.gesture = { start: i, button: event.button, indices: new Set() };
      this.visit(i);
    } else this.inventory.click(i, event.button);
    this.lastClick = double ? null : { index: i, time: now, id, shift: event.shiftKey, button: event.button };
  }
  visit(index) {
    const cursor = this.inventory.cursor, stack = this.inventory.slots[index];
    if (!cursor || !this.inventory.accepts(index, cursor.id) || (stack && (stack.id !== cursor.id || stack.count === ITEMS.get(cursor.id).maxStack))) return;
    if (!this.gesture.indices.has(index)) { this.gesture.indices.add(index); this.render(); }
  }
  handleKey(event) {
    const i = this.hovered;
    if (i === null || event.repeat) return;
    this.gesture = null;
    const digit = /^(?:Digit|Numpad)([1-9])$/.exec(event.code);
    if (i === CRAFT_OUTPUT) {
      if (digit || event.code === 'KeyF') this.inventory.crafting.take({ destination: 'slot', slot: digit ? Number(digit[1]) - 1 : OFFHAND });
      else if (event.code === 'KeyQ') this.inventory.crafting.take({ destination: 'drop', repeat: event.ctrlKey });
      return;
    }
    if (i === FURNACE_OUTPUT && (digit || event.code === 'KeyF')) {
      this.inventory.takeFurnaceOutputTo(digit ? Number(digit[1]) - 1 : OFFHAND); return;
    }
    if (digit) this.inventory.swap(i, Number(digit[1]) - 1);
    else if (event.code === 'KeyF') this.inventory.swap(i, OFFHAND);
    else if (event.code === 'KeyQ') this.inventory.drop(i, event.ctrlKey);
    this.render();
  }
  gameplayKey(event) {
    const digit = /^(?:Digit|Numpad)([1-9])$/.exec(event.code);
    if (!digit && !['KeyF', 'KeyQ'].includes(event.code)) return false;
    if (!event.repeat) {
      if (digit) this.inventory.select(Number(digit[1]) - 1);
      else if (event.code === 'KeyF') this.inventory.swap(this.inventory.selected, OFFHAND);
      else if (this.inventory.drop(this.inventory.selected, event.ctrlKey)) this.onGameplayDrop();
    }
    return true;
  }
  render() {
    const plan = this.gesture ? this.inventory.dragPlan(this.gesture.indices, this.gesture.button) : new Map();
    for (const [index, button] of this.slotViews) {
      if (index >= CRAFT_START && index < CRAFT_OUTPUT) {
        button.hidden = index >= CRAFT_START + this.inventory.crafting.size ** 2;
        button.disabled = !this.inventory.crafting.active;
      }
      const stack = this.stackAt(index), extra = plan.get(index) ?? 0;
      drawStack(this.document, button, stack ?? (extra ? { id: this.inventory.cursor.id, count: 0 } : null), extra);
      button.classList.toggle('drag-preview', extra > 0);
      button.classList.toggle('selected-slot', index === this.inventory.selected);
    }
    for (const [index, button] of this.hudViews) {
      drawStack(this.document, button, this.inventory.slots[index]);
      button.classList.toggle('selected-slot', index === this.inventory.selected);
    }
    const remaining = this.inventory.cursor ? this.inventory.cursor.count - [...plan.values()].reduce((a, b) => a + b, 0) : 0;
    drawStack(this.document, this.cursorView, remaining ? { id: this.inventory.cursor.id, count: remaining } : null);
    this.cursorView.style.left = `${this.pointer.x}px`; this.cursorView.style.top = `${this.pointer.y}px`;
    this.cursorView.hidden = !this.isOpen || remaining === 0;
    this.updateTooltip();
    this.book.render();
    const entity = this.inventory.furnace;
    this.document.getElementById('furnace-area').hidden = !entity;
    this.document.getElementById('furnace-flame').value = entity ? entity.burnTime / Math.max(1, entity.burnDuration) : 0;
    const fuelLevel = entity ? entity.burnTime / Math.max(1, entity.burnDuration) : 0;
    this.document.getElementById('furnace-flame-level').setAttribute('y', String(26 * (1 - fuelLevel)));
    this.document.getElementById('furnace-flame-level').setAttribute('height', String(26 * fuelLevel));
    this.document.getElementById('furnace-progress').value = entity ? entity.cookTime / (entity.recipe?.ticks ?? 200) : 0;
  }
  stackAt(index) { return index === CRAFT_OUTPUT ? this.inventory.crafting.output : this.inventory.slots[index]; }
  dispose() { this.furnaceUnsubscribe?.(); this.unsubscribe(); this.book.dispose(); for (const remove of this.removers) remove(); }
}
