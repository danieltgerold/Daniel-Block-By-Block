import { ITEMS } from './inventory.js';
import { CreativeInventory, CREATIVE_CATEGORIES } from './creative-inventory.js';

export class CreativeInventoryUI {
  constructor(owner, drawStack) {
    this.owner = owner; this.drawStack = drawStack; this.tab = 'building'; this.row = 0; this.hovered = null;
    this.model = new CreativeInventory(owner.inventory, () => this.active);
    const doc = owner.document;
    const element = (tag, className, label) => {
      const el = doc.createElement(tag); el.className = className;
      if (label) el.setAttribute('aria-label', label); return el;
    };
    this.tabs = element('nav', 'creative-tabs', 'Creative categories'); this.tabs.hidden = true;
    this.tabs.setAttribute('role', 'tablist');
    this.area = element('div', 'creative-catalog'); this.area.hidden = true;
    this.search = element('input', 'creative-search', 'Search creative items'); this.search.type = 'search'; this.search.placeholder = 'Search items'; this.search.autocomplete = 'off';
    this.grid = element('div', 'creative-grid', 'Creative catalog');
    this.scroll = element('input', 'creative-scroll', 'Catalog row'); this.scroll.type = 'range'; this.scroll.min = 0; this.scroll.step = 1; this.scroll.value = 0;
    this.area.append(this.search, this.grid, this.scroll);
    this.cells = Array.from({ length: 45 }, () => {
      const cell = element('button', 'inventory-slot'); cell.type = 'button'; cell.dataset.catalog = ''; this.grid.append(cell); return cell;
    });
    this.destroy = element('button', 'creative-destroy inventory-slot', 'Destroy Item');
    this.destroy.type = 'button'; this.destroy.textContent = 'Destroy Item'; this.destroy.dataset.destroy = ''; this.destroy.hidden = true;
    const content = owner.panel.querySelector('.inventory-content'); content.prepend(this.tabs, this.area);
    content.insertBefore(this.destroy, owner.document.getElementById('inventory-hotbar'));
    this.removers = [];
    const on = (target, event, fn, options) => { target.addEventListener(event, fn, options); this.removers.push(() => target.removeEventListener(event, fn, options)); };
    on(this.tabs, 'click', e => { const tab = e.target.closest('[data-creative-tab]'); if (tab && this.active) this.select(tab.dataset.creativeTab); });
    on(this.search, 'input', () => { this.row = 0; this.hovered = null; owner.render(); });
    on(this.scroll, 'input', () => { this.row = Number(this.scroll.value); this.hovered = null; owner.render(); });
    on(this.area, 'wheel', e => {
      if (!this.active || !e.deltaY) return;
      e.preventDefault(); this.row = Math.max(0, Math.min(Number(this.scroll.max), this.row + Math.sign(e.deltaY))); this.hovered = null; owner.render();
    }, { passive: false });
  }
  get active() { return this.owner.isOpen && this.owner.creativeOpen && this.owner.getGameMode() === 'creative'; }
  get catalog() { return this.active && this.tab !== 'inventory'; }
  open() { this.search.value = ''; this.select('building'); }
  reset() { this.hovered = null; this.owner.gesture = null; this.search.blur(); }
  select(tab) {
    if (!this.active) return;
    this.tab = tab; this.row = 0; this.reset(); this.owner.hovered = null; this.owner.lastClick = null;
    this.owner.panel.classList.remove('book-open'); this.owner.book.root.hidden = true;
    this.owner.render();
    if (tab === 'search') this.search.focus({ preventScroll: true }); else this.owner.document.activeElement?.blur();
    this.owner.preview?.reset();
  }
  hover(target) { this.hovered = this.catalog ? target.closest?.('[data-catalog]')?.dataset.catalog || null : null; }
  mouseDown(event) {
    if (!this.active || ![0, 1, 2].includes(event.button)) return false;
    const id = event.target.closest?.('[data-catalog]')?.dataset.catalog;
    if (this.catalog && id) {
      event.preventDefault(); this.owner.gesture = null; this.owner.lastClick = null;
      this.model.click(id, event.button, event.shiftKey); return true;
    }
    const control = event.target.closest?.('input, textarea, select, a, button:not([data-catalog]), .creative-tabs, [data-slot], #inventory-hotbar, #inventory-main, .inventory-top, [data-recipe-book]');
    if (this.catalog && this.owner.panel.contains(event.target) && !control && event.button !== 1) {
      event.preventDefault(); this.owner.gesture = null; this.owner.lastClick = null;
      this.model.discardCursor(event.button === 0); return true;
    }
    if (this.tab === 'inventory' && event.target.closest?.('[data-destroy]')) {
      event.preventDefault(); this.owner.gesture = null; this.model.destroy(event.shiftKey); return true;
    }
    return Boolean(event.target.closest?.('.creative-tabs, .creative-catalog'));
  }
  handleKey(event, textEntry = false) {
    if (!this.active) return false;
    const digit = /^(?:Digit|Numpad)([1-9])$/.exec(event.code);
    if (this.catalog && this.hovered && digit) { if (!event.repeat) this.model.hotbar(this.hovered, Number(digit[1]) - 1); return true; }
    if (textEntry) return false;
    if (event.code === 'KeyT') { if (!event.repeat) this.select('search'); return true; }
    if (this.catalog && this.hovered && event.code === 'KeyQ') { if (!event.repeat) this.model.drop(this.hovered, event.ctrlKey); return true; }
    if (this.catalog && ['ArrowUp', 'ArrowDown'].includes(event.code)) {
      this.row = Math.max(0, Math.min(Number(this.scroll.max), this.row + (event.code === 'ArrowDown' ? 1 : -1))); this.hovered = null; this.owner.render(); return true;
    }
    return false;
  }
  render() {
    const active = this.active;
    this.owner.root.classList.toggle('creative-view', active);
    this.owner.root.classList.toggle('creative-catalog-view', this.catalog);
    this.tabs.hidden = !active; this.area.hidden = !this.catalog; this.destroy.hidden = !active || this.tab !== 'inventory';
    if (!active) return;
    const categories = CREATIVE_CATEGORIES.filter(([id]) => this.model.items(id).length);
    const tabs = [...categories, ['search', 'Search'], ['inventory', 'Player Inventory']];
    const signature = tabs.map(([id]) => id).join(':');
    if (signature !== this.tabsSignature) {
      this.tabsSignature = signature; this.tabs.replaceChildren();
      for (const [id, label] of tabs) {
        const button = this.owner.document.createElement('button'); button.type = 'button'; button.dataset.creativeTab = id;
        button.textContent = label; button.setAttribute('role', 'tab'); this.tabs.append(button);
      }
    }
    for (const button of this.tabs.children) { const selected = button.dataset.creativeTab === this.tab; button.setAttribute('aria-selected', String(selected)); button.classList.toggle('active-tab', selected); }
    if (!this.catalog) return;
    this.search.hidden = this.tab !== 'search';
    const items = this.model.items(this.tab, this.tab === 'search' ? this.search.value : '');
    const max = Math.max(0, Math.ceil(items.length / 9) - 5); this.row = Math.max(0, Math.min(this.row, max));
    this.scroll.max = max; this.scroll.value = this.row; this.scroll.disabled = max === 0;
    this.cells.forEach((cell, i) => {
      const item = items[this.row * 9 + i]; cell.dataset.catalog = item?.id ?? ''; cell.disabled = false;
      cell.classList.toggle('empty-catalog-slot', !item);
      cell.setAttribute('aria-label', item?.name ?? 'Empty catalog slot'); this.drawStack(this.owner.document, cell, item ? { id: item.id, count: 1 } : null);
    });
  }
  dispose() { for (const remove of this.removers) remove(); }
}
