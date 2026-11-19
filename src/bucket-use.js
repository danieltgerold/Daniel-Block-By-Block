import { isWaterSource } from './fluid-surface.js';
export function useBucket(controller, world, yaw, pitch) {
  const inventory = controller.inventory, stack = inventory.mainHand;
  if (!['bucket', 'water.bucket'].includes(stack?.id)) return { handled: false, success: false };
  const empty = stack.id === 'bucket', ray = controller.interactionRay(controller.player, yaw, pitch);
  const hit = world.raycast(ray.origin, ray.direction, controller.effective.reach, { waterSources: empty });
  if (!hit) return { handled: true, success: false };
  let at;
  if (empty) {
    if (!isWaterSource(world.blockAt(hit.x, hit.y, hit.z))) return { handled: true, success: false };
    at = hit; world.setBlock(hit.x, hit.y, hit.z, false);
  } else {
    at = { x: hit.x + hit.normal.x, y: hit.y + hit.normal.y, z: hit.z + hit.normal.z };
    if (![at.x, at.y, at.z].every(Number.isSafeInteger) || !Math.hypot(hit.normal.x, hit.normal.y, hit.normal.z)
      || !world.isReplaceable(at.x, at.y, at.z) || isWaterSource(world.blockAt(at.x, at.y, at.z))) return { handled: true, success: false };
    if (!world.setBlock(at.x, at.y, at.z, 'water', { level: 0, falling: false })) return { handled: true, success: false };
  }
  if (controller.gameMode !== 'creative') {
    const result = empty ? 'water.bucket' : 'bucket';
    if (stack.count === 1) inventory.slots[inventory.selected] = { id: result, count: 1 };
    else {
      stack.count--;
      const overflow = inventory.insert(result, 1); if (overflow) inventory.onDrop({ id: result, count: overflow });
    }
    inventory.changed();
  }
  return { handled: true, success: true, at };
}
