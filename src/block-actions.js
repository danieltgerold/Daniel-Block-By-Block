import { BLOCK_TYPES } from './block-types.js';
import { facingFromYaw, oppositeFacing, DIRECTIONS, fullCube, stairShapeAt } from './block-shapes.js';
export function placeBlock(world, id, hit, yaw, players = []) {
  const definition = BLOCK_TYPES.get(id); if (!definition || !hit || !Math.hypot(hit.normal.x, hit.normal.y, hit.normal.z)) return false;
  const target = world.blockAt(hit.x, hit.y, hit.z), shape = definition.collisionShape;
  let x = hit.x + hit.normal.x, y = hit.y + hit.normal.y, z = hit.z + hit.normal.z, state = { ...definition.defaultState };
  if (definition.tags.includes('wood.logs')) state.axis = hit.normal.x ? 'x' : hit.normal.z ? 'z' : 'y';
  if (id === 'furnace') state.facing = oppositeFacing(facingFromYaw(yaw));
  if (shape === 'stairs') {
    state.facing = facingFromYaw(yaw);
    state.half = hit.normal.y < 0 || !hit.normal.y && (hit.point?.y ?? hit.y) - hit.y > .5 ? 'top' : 'bottom';
    state.shape = stairShapeAt({ x, y, z, id, definition, state }, world);
  }
  if (shape === 'slab') {
    const mergeTarget = target?.id === id && target.state.type !== 'double'
      && (target.state.type === 'top' ? hit.normal.y < 0 : hit.normal.y > 0);
    if (mergeTarget) { x = hit.x; y = hit.y; z = hit.z; state.type = 'double'; }
    else {
      state.type = hit.normal.y < 0 || !hit.normal.y && (hit.point?.y ?? hit.y) - hit.y > .5 ? 'top' : 'bottom';
      const at = world.blockAt(x, y, z);
      if (at?.id === id && at.state.type !== 'double' && at.state.type !== state.type) state.type = 'double';
    }
  }
  if (![x, y, z].every(Number.isSafeInteger)) return false;
  const existing = world.blockAt(x, y, z);
  const combine = shape === 'slab' && state.type === 'double' && existing?.id === id && existing.state.type !== 'double';
  if (existing && !combine && !world.isReplaceable(x, y, z)) return false;
  const block = { x, y, z, id, definition, state };
  if (shape === 'door') {
    if (!Number.isSafeInteger(y + 1) || !world.topSupport(x, y - 1, z) || !world.isReplaceable(x, y + 1, z)) return false;
    state.facing = facingFromYaw(yaw);
    const [fx, , fz] = DIRECTIONS[state.facing], right = [-fz, fx];
    const leftDoor = world.blockAt(x - right[0], y, z - right[1]), rightDoor = world.blockAt(x + right[0], y, z + right[1]);
    const score = sign => [0, 1].reduce((n, dy) => n + Number(fullCube(world.blockAt(x + right[0] * sign, y + dy, z + right[1] * sign))), 0);
    state.hinge = leftDoor?.definition.collisionShape === 'door' && leftDoor.state.facing === state.facing ? 'right'
      : rightDoor?.definition.collisionShape === 'door' && rightDoor.state.facing === state.facing ? 'left'
      : score(-1) > score(1) ? 'left' : score(1) > score(-1) ? 'right'
        : ((hit.point?.x ?? x + .5) - x - .5) * right[0] + ((hit.point?.z ?? z + .5) - z - .5) * right[1] > 0 ? 'right' : 'left';
    if (!world.canFitBlock(block, players) || !world.canFitBlock({ ...block, y: y + 1, state: { ...state, half: 'upper' } }, players)) return false;
    const guard = world.changingDoors; world.changingDoors = true;
    world.setBlock(x, y, z, id, state); world.setBlock(x, y + 1, z, id, { ...state, half: 'upper' }); world.changingDoors = guard;
    return { x, y, z };
  }
  if (!world.canFitBlock(block, players)) return false;
  return world.setBlock(x, y, z, id, state) ? { x, y, z } : false;
}
