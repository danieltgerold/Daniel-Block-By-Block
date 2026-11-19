import { breakTargetBlock } from './block-placement.js';
import { ITEMS } from './inventory.js';
import { miningProgress, sameBreakingTarget } from './breaking-properties.js';
import { stackKey } from './stack-data.js';

export function breakingRate(block, controller, eye) {
  return miningProgress(block.definition, ITEMS.get(controller.inventory.mainHand?.id), {
    grounded: controller.player.grounded, underwater: controller.world?.fluids.submerged(eye) ?? false });
}

export class BlockBreaking {
  constructor({ controller, world, getAim, canInteract = () => true, onBreak = () => {} }) {
    Object.assign(this, { controller, world, getAim, canInteract, onBreak }); controller.breaking = this; this.cancel();
    this.unsubscribe = world.subscribe?.(({ x,y,z }) => { if (this.target && this.target.x === x && this.target.y === y && this.target.z === z
      && !sameBreakingTarget(this.target, world.blockAt(x,y,z))) this.clearProgress(); });
  }
  dispose() { this.unsubscribe?.(); this.cancel(); if (this.controller.breaking === this) this.controller.breaking = null; }
  cancel() { this.target = null; this.progress = 0; this.hit = null; this.cooldown = 0; this.creativeRepeat = 0; this.hitTicks = 0; }
  clearProgress() { this.target = null; this.progress = 0; this.hit = null; this.hitTicks = 0; this.heldKey=null; }
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
    const heldKey=`${this.controller.inventory.selected}:${stackKey(this.controller.inventory.mainHand)}`;
    if (!sameBreakingTarget(block, this.target)||heldKey!==this.heldKey) {
      this.clearProgress(); this.target = block;this.heldKey=heldKey;
    }
    this.hit = hit;
    const eye = this.controller.interactionRay(this.controller.player, aim.yaw, aim.pitch).origin;
    this.progress = Math.min(1, this.progress + breakingRate(block, this.controller, eye));
    if (++this.hitTicks % 4 === 0) this.controller.particles?.hitBlock?.(block, hit);
    if (this.progress < 1 - 1e-9) return false;
    const broke = breakTargetBlock({ controller: this.controller, world: this.world, ...aim, hit, onBreak: this.onBreak });
    this.clearProgress(); if (broke && block.definition.hardness > 0) this.cooldown = 6;
    return broke;
  }
}
