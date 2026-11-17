import { ITEMS } from './inventory.js';
export class RecipeBookUI {
  constructor({ document, crafting, drawStack }) {
    Object.assign(this, { document, crafting, drawStack }); this.buttons = new Map(); this.removers = []; this.lastKey = '';
    this.root = document.getElementById('recipe-book'); this.search = document.getElementById('recipe-search');
    this.category = document.getElementById('recipe-category'); this.only = document.getElementById('recipe-craftable');
    this.list = document.getElementById('recipe-list'); this.status = document.getElementById('recipe-status');
    this.ghost = document.getElementById('recipe-ghost'); this.ghostGrid = document.getElementById('recipe-ghost-grid');
    this.ghostSlots = Array.from({ length: 9 }, () => {
      const cell = document.createElement('div'); cell.className = 'inventory-slot ghost-slot'; this.ghostGrid.append(cell); return cell;
    });
    const listen = (target, name, fn) => { target.addEventListener(name, fn); this.removers.push(() => target.removeEventListener(name, fn)); };
    for (const [target, event] of [[this.search, 'input'], [this.category, 'change'], [this.only, 'change']]) listen(target, event, () => this.render(true));
  }
  reset() { this.lastKey = ''; this.status.textContent = ''; this.render(true); }
  render(force = false) {
    const c = this.crafting; if (this.root.hidden || !c.active) return;
    const recipes = c.registry.forGrid(c.size), search = this.search.value.trim().toLowerCase();
    const categoryKey = recipes.map(r => r.category).join('|');
    if (this.categoryKey !== categoryKey) {
      this.categoryKey = categoryKey; this.category.replaceChildren();
      for (const id of ['all', ...new Set(recipes.map(r => r.category))]) {
        const option = this.document.createElement('option'); option.value = id;
        option.textContent = id === 'all' ? 'All categories' : id[0].toUpperCase() + id.slice(1); this.category.append(option);
      }
      this.category.value = 'all';
    }
    const key = `${c.size}:${search}:${this.category.value}:${this.only.checked}:`
      + [...c.storage, ...c.indices].map(i => { const s = c.inventory.slots[i]; return s ? `${s.id}:${s.count}` : ''; }).join('|')
      + `:${c.ghostRecipe?.id ?? ''}`;
    if (!force && key === this.lastKey) return; this.lastKey = key;
    for (const button of this.buttons.values()) button.hidden = true;
    for (const recipe of recipes) {
      const craftable = c.canMake(recipe), name = recipe.name ?? ITEMS.get(recipe.output.id).name;
      if (search && !`${name} ${recipe.id} ${recipe.output.id}`.toLowerCase().includes(search)) continue;
      if (this.category.value !== 'all' && recipe.category !== this.category.value || this.only.checked && !craftable) continue;
      let button = this.buttons.get(recipe.id);
      if (!button) {
        button = this.document.createElement('button'); button.type = 'button'; button.className = 'recipe-entry'; button.dataset.recipe = recipe.id;
        const icon = this.document.createElement('span'); icon.className = 'recipe-icon'; this.drawStack(this.document, icon, recipe.output);
        const label = this.document.createElement('span'); label.textContent = name; button.append(icon, label);
        const click = event => {
          const result = c.fill(recipe.id, event.shiftKey); this.status.textContent = result.ok ? '' : result.reason; this.render(true);
        };
        button.addEventListener('click', click); this.removers.push(() => button.removeEventListener('click', click));
        this.buttons.set(recipe.id, button); this.list.append(button);
      }
      button.hidden = false; button.classList.toggle('unavailable', !craftable);
      button.setAttribute('aria-label', `${name}${craftable ? ', craftable' : ', missing ingredients'}`);
    }
    const ghosts = c.ghost(); this.ghost.hidden = !c.ghostRecipe;
    this.ghostGrid.style.setProperty('--craft-size', c.size);
    this.ghostSlots.forEach((cell, i) => {
      cell.hidden = i >= c.size * c.size;
      this.drawStack(this.document, cell, ghosts[i] ?? null); cell.classList.toggle('missing', Boolean(ghosts[i]?.missing));
    });
  }
  dispose() { for (const remove of this.removers) remove(); }
}
