// The world currently has one unlimited block type. All placement paths share
// this transaction so invalid attempts never edit terrain or request a swing.
export class BlockPlacement {
  constructor({ controller, world, getAim, canInteract, onPlace = () => {} }) {
    Object.assign(this, { controller, world, getAim, canInteract, onPlace });
  }

  press() {
    if (!this.canInteract() || this.controller.placementHeld) return false;
    this.controller.placementHeld = true;
    this.previousEye = { ...this.controller.interactionRay().origin };
    return this.attempt();
  }

  release() { this.controller.placementHeld = false; this.previousEye = null; }

  tick() {
    if (!this.controller.placementHeld) return false;
    const { yaw, pitch } = this.getAim();
    const { origin, direction } = this.controller.interactionRay(this.controller.player, yaw, pitch);
    const previous = this.previousEye ?? origin;
    // Retreating opens a gap: allow enough fresh attempts to fill it during
    // this tick instead of imposing a one-block-per-tick speed limit.
    const away = Math.max(0, -(origin.x - previous.x) * direction.x
      - (origin.y - previous.y) * direction.y - (origin.z - previous.z) * direction.z);
    this.previousEye = { ...origin };
    const budget = Number.isFinite(away) ? Math.min(32, 1 + Math.ceil(away)) : 32;
    let placed = false;
    for (let i = 0; i < budget; i++) {
      if (!this.attempt()) break;
      placed = true;
    }
    return placed;
  }

  attempt() {
    if (!this.canInteract()) { this.release(); return false; }
    const { yaw, pitch } = this.getAim();
    // Never cache a hit or use the third-person camera as the ray origin.
    // Tick callbacks use the actual post-collision feet, even in catch-up frames.
    const hit = this.controller.targetBlock(this.controller.player, yaw, pitch);
    if (!hit || !Math.hypot(hit.normal.x, hit.normal.y, hit.normal.z)) return false;
    const x = hit.x + hit.normal.x, y = hit.y + hit.normal.y, z = hit.z + hit.normal.z;
    if (!this.world.canPlaceBlock(x, y, z, [this.controller.player])) return false;
    const eye = this.controller.interactionRay(this.controller.player, yaw, pitch).origin;
    // Measure to the nearest part of the NEW cube, not its center or the old
    // hit face, so a block's near side never builds into the player's face.
    const distance = Math.hypot(Math.max(x - eye.x, 0, eye.x - x - 1),
      Math.max(y - eye.y, 0, eye.y - y - 1), Math.max(z - eye.z, 0, eye.z - z - 1));
    if (distance < 3 - 1e-7) return false;
    if (!this.world.setBlock(x, y, z, true)) return false;
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
  listen(window, 'blur', () => placement.release());
  listen(document, 'visibilitychange', () => { if (document.hidden) placement.release(); });
  listen(document, 'pointerlockchange', () => {
    if (document.pointerLockElement !== canvas) placement.release();
  });
  listen(canvas, 'contextmenu', event => { if (placement.canInteract()) event.preventDefault(); });
  return () => { placement.release(); for (const remove of listeners) remove(); };
}
