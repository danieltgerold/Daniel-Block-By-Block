import { fallDamage } from './player-settings.js';
const clamp = (value, max) => Math.max(0, Math.min(max, value));
export const STARTING_VITALS = Object.freeze({ health: 20, hunger: 20, saturation: 5, exhaustion: 0 });
// Simulation only. Damage sources, food and tools can call these methods without
// knowing about input, rendering, inventory ownership or the death screen.
export class PlayerVitals {
  constructor(saved = {}) { this.restore(saved); }
  restore(saved = {}) {
    for (const [key, fallback] of Object.entries(STARTING_VITALS)) this[key] = Number.isFinite(saved[key]) ? Math.max(0,saved[key]) : fallback;
    this.health = clamp(this.health,20); this.hunger = clamp(this.hunger,20); this.saturation = clamp(this.saturation,this.hunger);
    this.regenTicks = 0; this.regenMode = null; this.voidTicks = 0;
  }
  reset() { this.restore(STARTING_VITALS); }
  get dead() { return this.health <= 0; }
  damage(amount,source='other') {
    const before=this.health;
    if (amount > 0) this.health = Math.max(0,this.health-amount);
    if(this.health<before)this.onDamage?.({amount:before-this.health,source});
  }
  exhaust(amount) {
    if (amount > 0) this.exhaustion = Math.min(Number.MAX_VALUE,this.exhaustion+amount);
  }
  processExhaustion() {
    // Constant time even at developer-mode movement speeds. Java's comparison
    // is strictly > 4; an exact multiple leaves 4 exhaustion carried over.
    if (this.exhaustion > 4) {
      const losses = Math.ceil(this.exhaustion/4)-1;
      this.exhaustion = this.exhaustion % 4 || 4;
      const saturationLoss = Math.min(losses,Math.ceil(this.saturation));
      this.saturation = Math.max(0,this.saturation-saturationLoss);
      this.hunger = Math.max(0,this.hunger-(losses-saturationLoss));
    }
    this.hunger = clamp(this.hunger,20); this.saturation = clamp(this.saturation,this.hunger);
  }
  eat(food) {
    if (this.dead || this.hunger >= 20) return false;
    this.hunger = Math.min(20,this.hunger+food.hunger);
    this.saturation = Math.min(this.hunger,this.saturation+food.saturation);
    return true;
  }
  tick({ player, creative = false, distance = 0, swimDistance = distance, jumped = false, sprintJump = false, settings } = {}) {
    if (this.dead) return;
    if (player.y < -64) { if (++this.voidTicks >= 10) { this.voidTicks = 0; this.damage(4,'void'); } }
    else this.voidTicks = 0;
    if (this.dead || creative) { this.regenTicks = 0; this.regenMode = null; return; }
    if (player.inWater) this.exhaust(swimDistance*.01);
    else if (player.grounded && player.sprinting) this.exhaust(distance*.1);
    if (jumped) this.exhaust(sprintJump ? .2 : .05);
    const fall = player.landingDamageDistance ?? 0;
    if (fall > 0) this.damage(fallDamage(fall,settings ?? {size:player.size??1}),'fall');
    if (this.dead) return;
    this.processExhaustion();
    const mode = this.health < 20 && this.hunger >= 18
      ? this.hunger === 20 && this.saturation > 0 ? 'fast' : 'slow' : null;
    if (mode !== this.regenMode) { this.regenMode = mode; this.regenTicks = 0; }
    if (!mode) { this.regenTicks = 0; return; }
    if (++this.regenTicks >= (mode === 'fast' ? 10 : 80)) {
      this.regenTicks = 0;
      const amount = mode === 'fast' ? Math.min(this.saturation,6) : 6;
      this.health = Math.min(20,this.health+amount/6); this.exhaust(amount);
      this.processExhaustion();
    }
  }
  toJSON() { return Object.fromEntries(Object.keys(STARTING_VITALS).map(key=>[key,this[key]])); }
}
