import { BLOCK_TYPES } from './block-types.js';
export const CUBE = Object.freeze([[0, 0, 0, 1, 1, 1]]);
export const DIRECTIONS = Object.freeze({ north: [0, 0, -1], east: [1, 0, 0], south: [0, 0, 1], west: [-1, 0, 0] });
const turns = Object.keys(DIRECTIONS);
export const turnFacing = (facing, amount) => turns[(turns.indexOf(facing) + amount + 4) % 4];
export const facingFromYaw = yaw => turns[((Math.round(-yaw / (Math.PI / 2)) % 4) + 4) % 4];
export const oppositeFacing = facing => turns[(turns.indexOf(facing) + 2) % 4];
const stairBoxCache = new Map();
export function stairShapeAt(block, world) {
  const facing = block.state.facing ?? 'north', half = block.state.half ?? 'bottom';
  const at = direction => { const [x, , z] = DIRECTIONS[direction]; return world.blockAt(block.x + x, block.y, block.z + z); };
  const compatible = other => other?.definition.collisionShape === 'stairs' && (other.state.half ?? 'bottom') === half;
  const guarded = direction => { const side = at(direction); return compatible(side) && side.state.facing === facing; };
  const perpendicular = other => (DIRECTIONS[other.state.facing][0] !== 0) !== (DIRECTIONS[facing][0] !== 0);
  const front = at(facing);
  if (compatible(front) && perpendicular(front) && !guarded(oppositeFacing(front.state.facing))) {
    return front.state.facing === turnFacing(facing, -1) ? 'outer-left' : 'outer-right';
  }
  const back = at(oppositeFacing(facing));
  if (compatible(back) && perpendicular(back) && !guarded(back.state.facing)) {
    return back.state.facing === turnFacing(facing, -1) ? 'inner-left' : 'inner-right';
  }
  return 'straight';
}
export function stairBoxes(state = {}) {
  const facing = state.facing ?? 'north', half = state.half ?? 'bottom', shape = state.shape ?? 'straight';
  const key = `${facing}:${half}:${shape}`; if (stairBoxCache.has(key)) return stairBoxCache.get(key);
  const boxes = [half === 'top' ? [0, .5, 0, 1, 1, 1] : [0, 0, 0, 1, .5, 1]];
  const inHalf = (direction, x, z) => direction === 'north' ? z === 0 : direction === 'south' ? z === 1 : direction === 'west' ? x === 0 : x === 1;
  const side = turnFacing(facing, shape.endsWith('left') ? -1 : 1);
  for (let x = 0; x < 2; x++) for (let z = 0; z < 2; z++) {
    const front = inHalf(facing, x, z), lateral = inHalf(side, x, z);
    const raised = shape.startsWith('outer') ? front && lateral : shape.startsWith('inner') ? front || lateral : front;
    if (raised) boxes.push([x / 2, half === 'top' ? 0 : .5, z / 2, (x + 1) / 2, half === 'top' ? .5 : 1, (z + 1) / 2]);
  }
  boxes.forEach(Object.freeze); Object.freeze(boxes); stairBoxCache.set(key, boxes); return boxes;
}
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
export function wallConnections(block,world) {
  return Object.fromEntries(Object.entries(DIRECTIONS).map(([name,[x,,z]])=>{
    const neighbor=world?.blockAt(block.x+x,block.y,block.z+z);
    if(neighbor?.definition.collisionShape==='wall')return [name,true];
    if(fullCube(neighbor))return [name,true];
    const axis=x?0:2,face=x>0||z>0?0:1,boxes=blockBoxes(neighbor,'selection',null);
    const solid=[.25,.75].every(y=>[.25,.75].every(u=>boxes.some(b=>b[axis]<=face&&b[axis+3]>=face&&y>b[1]&&y<b[4]&&u>b[axis===0?2:0]&&u<b[axis===0?5:3])));
    return [name,solid];
  }));
}
export function blockBoxes(block, kind = 'collision', world = null) {
  if (!block?.definition.solid) return [];
  const shape = block.definition.collisionShape, state = block.state ?? {};
  if(shape==='farmland')return [[0,0,0,1,15/16,1]];
  if(shape==='wall') {
    const links=world?wallConnections(block,world):{east:true,west:true},collision=kind==='collision';
    const boxes=[[.25,0,.25,.75,collision?1.5:1,.75]];
    for(const [name,on] of Object.entries(links))if(on){
      const range={north:[.3125,0,.6875,.5],south:[.3125,.5,.6875,1],west:[0,.3125,.5,.6875],east:[.5,.3125,1,.6875]}[name];
      boxes.push([range[0],0,range[1],range[2],collision?1.5:.8125,range[3]]);
    }
    return boxes;
  }
  if (shape === 'slab') return state.type === 'double' ? CUBE : state.type === 'top' ? [[0, .5, 0, 1, 1, 1]] : [[0, 0, 0, 1, .5, 1]];
  if (shape === 'stairs') return stairBoxes(state);
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
