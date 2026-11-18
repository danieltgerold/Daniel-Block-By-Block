import { ITEMS } from './inventory.js';
export const EATING_TICKS = 32;
export class FoodUse {
  constructor(controller) { this.controller = controller; this.active = null; }
  start() {
    const c = this.controller, stack = c.inventory.mainHand;
    if (this.active || c.gameMode !== 'survival' || c.vitals.dead || c.vitals.hunger >= 20 || !ITEMS.get(stack?.id)?.food) return false;
    this.active = { slot: c.inventory.selected, stack, id: stack.id, age: 0 };
    c.player.animation.eating = true; c.player.animation.eatAge = 0; return true;
  }
  cancel() { this.active = null; this.controller.player.animation.eating = false; this.controller.player.animation.eatAge = 0; }
  tick(held) {
    const c = this.controller, use = this.active;
    if (!use) return false;
    if (!held || c.miningHeld || c.gameMode !== 'survival' || c.vitals.dead || c.vitals.hunger >= 20
      || c.inventory.selected !== use.slot || c.inventory.mainHand !== use.stack || use.stack.id !== use.id || use.stack.count <= 0) { this.cancel(); return false; }
    c.player.animation.eatAge = ++use.age;
    if (use.age < EATING_TICKS) return false;
    if (!c.vitals.eat(ITEMS.get(use.id).food)) { this.cancel(); return false; }
    c.inventory.consumeSelected(); this.cancel(); return true;
  }
}
