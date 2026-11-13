// The world currently has one registered block type. All placement paths share
// this transaction so invalid attempts never edit terrain or request a swing.
import { ITEMS } from './inventory.js';
export function breakTargetBlock({ controller, world, yaw, pitch, feet = controller.player, onBreak = () => {} }) {
  const hit = controller.targetBlock(feet, yaw, pitch);
  if (!hit || !world.setBlock(hit.x, hit.y, hit.z, false)) return false;
  if (controller.gameMode !== 'creative') controller.drops.spawn('test.block', 1, { x: hit.x + .5, y: hit.y + .25, z: hit.z + .5 });
  onBreak(hit.x, hit.y, hit.z); return true;
}
export class BlockPlacement {
  constructor({ controller, world, getAim, canInteract, onPlace = () => {} }) {
    Object.assign(this, { controller, world, getAim, canInteract, onPlace });
  }

  press() {
    if (!this.canInteract() || this.controller.placementHeld) return false;
    this.controller.placementHeld = true;
    this.controller.placementPresses++;
    return true;
  }

  release(cancel = false) {
    this.controller.placementHeld = false;
    if (cancel) { this.controller.placementPresses = 0; this.controller.placementRepeat = 0; }
  }

  tick() {
    if (!this.canInteract()) { this.release(true); return false; }
    if (this.controller.placementRepeat > 0) this.controller.placementRepeat--;
    const presses = this.controller.placementPresses;
    this.controller.placementPresses = 0;
    let placed = false;
    for (let i = 0; i < presses; i++) {
      placed = this.attempt() || placed;
      this.controller.placementRepeat = 4;
    }
    if (this.controller.placementHeld && this.controller.placementRepeat === 0) {
      placed = this.attempt() || placed;
      this.controller.placementRepeat = 4;
    }
    return placed;
  }

  attempt() {
    if (!this.canInteract()) { this.release(true); return false; }
    const { yaw, pitch } = this.getAim();
    // Never cache a hit or use the third-person camera as the ray origin.
    // Tick callbacks use the actual post-collision feet, even in catch-up frames.
    const hit = this.controller.targetBlock(this.controller.player, yaw, pitch);
    const stack = this.controller.inventory.mainHand;
    if (this.controller.miningHeld || !stack || stack.id !== 'test.block' || !ITEMS.get(stack.id)?.block) return false;
    if (!hit || !Math.hypot(hit.normal.x, hit.normal.y, hit.normal.z)) return false;
    const x = hit.x + hit.normal.x, y = hit.y + hit.normal.y, z = hit.z + hit.normal.z;
    if (!this.world.canPlaceBlock(x, y, z, [this.controller.player])) return false;
    if (!this.world.setBlock(x, y, z, true)) return false;
    if (this.controller.gameMode !== 'creative') this.controller.inventory.consumeSelected();
    this.controller.requestSwing();
    this.onPlace(x, y, z);
    return true;
  }
}

export function bindPlacementInput(placement, canvas, document, window) {
  const listeners = [];
  const listen = (target, name, callback) => {
    target.addEventListener(name, callback);
    listeners.push(() => target.removeEventListener(name, callback));
  };
  listen(canvas, 'mousedown', event => {
    // Capturing the mouse, interacting with a menu, or returning with an old
    // physical hold must not count as a fresh placement press.
    if (event.button !== 2 || !placement.canInteract()) return;
    event.preventDefault();
    placement.press();
  });
  listen(document, 'mouseup', event => { if (event.button === 2) placement.release(); });
  listen(window, 'blur', () => placement.release(true));
  listen(document, 'visibilitychange', () => { if (document.hidden) placement.release(true); });
  listen(document, 'pointerlockchange', () => {
    if (document.pointerLockElement !== canvas) placement.release(true);
  });
  listen(canvas, 'contextmenu', event => { if (placement.canInteract()) event.preventDefault(); });
  return () => { placement.release(true); for (const remove of listeners) remove(); };
}
