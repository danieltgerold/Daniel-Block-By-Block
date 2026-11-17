import { BLOCK_TYPES } from './block-types.js';
export const CUBE = Object.freeze([[0, 0, 0, 1, 1, 1]]);
export const DIRECTIONS = Object.freeze({ north: [0, 0, -1], east: [1, 0, 0], south: [0, 0, 1], west: [-1, 0, 0] });
const turns = Object.keys(DIRECTIONS);
export const facingFromYaw = yaw => turns[((Math.round(-yaw / (Math.PI / 2)) % 4) + 4) % 4];
export const oppositeFacing = facing => turns[(turns.indexOf(facing) + 2) % 4];
export function fullCube(block) {
  return Boolean(block?.definition.solid && (block.definition.collisionShape === 'cube'
    || block.definition.collisionShape === 'slab' && block.state?.type === 'double'));
}
export const blockOpaque = block => Boolean(fullCube(block) && (block.definition.opaque || block.definition.collisionShape === 'slab'));
export function fenceConnections(block, world) {
  return Object.fromEntries(Object.entries(DIRECTIONS).map(([name, [x, , z]]) => {
    const neighbor = world?.blockAt(block.x + x, block.y, block.z + z);
    return [name, neighbor?.definition.collisionShape === 'fence' || blockOpaque(neighbor)];
  }));
}
export function blockBoxes(block, kind = 'collision', world = null) {
  if (!block?.definition.solid) return [];
  const shape = block.definition.collisionShape, state = block.state ?? {};
  if (shape === 'slab') return state.type === 'double' ? CUBE : state.type === 'top' ? [[0, .5, 0, 1, 1, 1]] : [[0, 0, 0, 1, .5, 1]];
  if (shape === 'door') {
    let facing = state.facing ?? 'north';
    if (state.open) facing = turns[(turns.indexOf(facing) + (state.hinge === 'right' ? 3 : 1)) % 4];
    return { north: [[0, 0, .8125, 1, 1, 1]], south: [[0, 0, 0, 1, 1, .1875]],
      east: [[0, 0, 0, .1875, 1, 1]], west: [[.8125, 0, 0, 1, 1, 1]] }[facing];
  }
  if (shape === 'fence') {
    const connections = world ? fenceConnections(block, world) : { east: true, west: true };
    const collision = kind === 'collision', boxes = [[.375, 0, .375, .625, collision ? 1.5 : 1, .625]];
    for (const [name, on] of Object.entries(connections)) if (on) {
      const ranges = { north: [.4375, 0, .5625, .375], south: [.4375, .625, .5625, 1], west: [0, .4375, .375, .5625], east: [.625, .4375, 1, .5625] };
      const [x0, z0, x1, z1] = ranges[name];
      if (collision) boxes.push([x0, 0, z0, x1, 1.5, z1]);
      else for (const y of [.375, .75]) boxes.push([x0, y, z0, x1, y + .1875, z1]);
    }
    return boxes;
  }
  return CUBE;
}
export function worldBoxes(block, kind = 'collision', world = null) {
  return blockBoxes(block, kind, world).map(b => ({
    min: { x: block.x + b[0], y: block.y + b[1], z: block.z + b[2] },
    max: { x: block.x + b[3], y: block.y + b[4], z: block.z + b[5] }, block,
  }));
}
export function itemBlock(id) { return { id, x: 0, y: 0, z: 0, definition: BLOCK_TYPES.get(id), state: BLOCK_TYPES.get(id)?.defaultState ?? {} }; }
