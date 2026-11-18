import { breakTargetBlock } from './block-placement.js';

export function breakingRate(block, controller, eye) {
  if (block.definition.unbreakable) return 0;
  const ticks = block.definition.miningTicks?.(controller.inventory.mainHand, controller.player) ?? block.definition.breakTicks;
  if (!Number.isFinite(ticks)) return 0;
  const ground = controller.player.grounded ? 1 : .2;
  const water = controller.world?.fluids.submerged(eye) ? .2 : 1;
  return ticks > 0 ? ground * water / ticks : 1;
}

export class BlockBreaking {
  constructor({ controller, world, getAim, canInteract = () => true, onBreak = () => {} }) {
    Object.assign(this, { controller, world, getAim, canInteract, onBreak }); controller.breaking = this; this.cancel();
    this.unsubscribe = world.subscribe?.(({ x,y,z }) => { if (this.target && this.target.x === x && this.target.y === y && this.target.z === z) this.clearProgress(); });
  }
  dispose() { this.unsubscribe?.(); this.cancel(); if (this.controller.breaking === this) this.controller.breaking = null; }
  cancel() { this.target = null; this.progress = 0; this.hit = null; this.cooldown = 0; this.creativeRepeat = 0; this.hitTicks = 0; }
  clearProgress() { this.target = null; this.progress = 0; this.hit = null; this.hitTicks = 0; }
  press() {
    if (!this.canInteract()) return false;
    this.controller.setMining(true); this.controller.requestSwing();
    if (this.controller.gameMode === 'creative') { this.creativeRepeat = 3; return this.instant(); }
    return true;
  }
  instant() {
    const aim = this.getAim(); this.clearProgress();
    return breakTargetBlock({ controller: this.controller, world: this.world, ...aim, onBreak: this.onBreak });
  }
  tick() {
    if (!this.canInteract() || !this.controller.miningHeld) { this.cancel(); return false; }
    if (this.controller.gameMode === 'creative') {
      this.clearProgress(); if (this.creativeRepeat > 0 && --this.creativeRepeat > 0) return false;
      this.creativeRepeat = 3; return this.instant();
    }
    if (this.cooldown > 0) { this.cooldown--; this.clearProgress(); return false; }
    const aim = this.getAim(), hit = this.controller.targetBlock(this.controller.player, aim.yaw, aim.pitch);
    const block = hit && this.world.blockAt(hit.x, hit.y, hit.z);
    if (!block?.definition.solid || block.definition.unbreakable) { this.clearProgress(); return false; }
    if (!this.target || block.x !== this.target.x || block.y !== this.target.y || block.z !== this.target.z || block.id !== this.target.id || block.state !== this.target.state) {
      this.clearProgress(); this.target = block;
    }
    this.hit = hit;
    const eye = this.controller.interactionRay(this.controller.player, aim.yaw, aim.pitch).origin;
    this.progress = Math.min(1, this.progress + breakingRate(block, this.controller, eye));
    if (++this.hitTicks % 4 === 0) this.controller.particles?.hitBlock?.(block, hit);
    if (this.progress < 1 - 1e-9) return false;
    const broke = breakTargetBlock({ controller: this.controller, world: this.world, ...aim, hit, onBreak: this.onBreak });
    this.clearProgress(); if (broke && block.definition.breakTicks > 0) this.cooldown = 6;
    return broke;
  }
}
