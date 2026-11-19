import { grassBehavior } from './block-behaviors.js';
import { breakingProperties } from './breaking-properties.js';
import { canHarvest } from './breaking-properties.js';
import { TOOL_DEFINITIONS } from './mining-content.js';
import { registerStoneContent } from './stone-content.js';
// Definitions describe identity; world storage, inventory and cubes share them.
export const BLOCK_TYPES = new Map();
const listeners = new Set();
export const onBlockTypeRegistered = listener => { listeners.add(listener); return () => listeners.delete(listener); };
export function registerBlockType(definition) {
  if (!definition.id) throw new Error('A block needs a unique ID');
  const block = Object.freeze({ name: definition.id, maxStack: 64, solid: true, opaque: true,
    collisionShape: 'cube', breakTime: 0, behavior: null, tags: [],
    renderMode: 'opaque', cullSameType: false, defaultState: {}, drops: 'self',
    faces: { all: definition.id }, particleTexture: definition.id,
    particles: true, particleTint: [1, 1, 1], ...breakingProperties(definition.id), ...definition,
    defaultState: Object.freeze({ ...definition.defaultState }) });
  if (BLOCK_TYPES.has(block.id)) throw new Error(`Duplicate block ID: ${block.id}`);
  BLOCK_TYPES.set(block.id, block);
  for (const listener of listeners) listener(block);
  return block;
}
export function blockFaceTexture(id, axis, sign, state = BLOCK_TYPES.get(id)?.defaultState ?? {}) {
  const definition = BLOCK_TYPES.get(id);
  if(id==='farmland' && axis===1 && sign>0)return state.moisture>0?'farmland.wet':'farmland.dry';
  if (definition?.tags.includes('wood.logs')) return axis === 'xyz'.indexOf(state.axis ?? 'y') ? `${id.split('.')[0]}.end` : `${id.split('.')[0]}.bark`;
  if (definition?.collisionShape === 'door') {
    const turns = ['north', 'east', 'south', 'west']; let facing = state.facing ?? 'north';
    if (state.open) facing = turns[(turns.indexOf(facing) + (state.hinge === 'right' ? 3 : 1)) % 4];
    const frontAxis = facing === 'east' || facing === 'west' ? 0 : 2;
    return axis === frontAxis ? `${id}.${state.half ?? 'lower'}` : `${id.split('.')[0]}.planks`;
  }
  if (id === 'furnace') {
    if (axis === 1) return 'furnace.top';
    const face = axis === 0 ? sign > 0 ? 'east' : 'west' : sign > 0 ? 'south' : 'north';
    return face === (state.facing ?? 'north') ? state.lit ? 'furnace.lit' : 'furnace.front' : 'furnace.side';
  }
  const faces = BLOCK_TYPES.get(id)?.faces ?? { all: 'dirt' };
  if (typeof faces === 'string') return faces;
  return faces[`${sign > 0 ? 'p' : 'n'}${'xyz'[axis]}`]
    ?? faces[axis === 1 ? (sign > 0 ? 'top' : 'bottom') : 'side'] ?? faces.all ?? id;
}
export function blockFaceVisible(id, neighborId) {
  if (!id) return false;
  const block = BLOCK_TYPES.get(id), neighbor = BLOCK_TYPES.get(neighborId);
  if (neighbor?.solid && neighbor.opaque) return false;
  return !(block?.cullSameType && id === neighborId);
}
// Tool/enchantment-sensitive rules can later be functions of this context.
// Collision and render opacity have no bearing on what an item drops.
export function blockDrops(block, context = {}) {
  if (context.gameMode === 'creative') return [];
  const item=context.toolDefinition??TOOL_DEFINITIONS.get(context.tool?.id)??context.tool;
  if(!canHarvest(block.definition,item))return [];
  if(block.definition.tags.includes('leaves')&&item?.tool?.type==='shears')return [{id:block.id,count:1}];
  const rule = block.definition.drops;
  const drops = typeof rule === 'function' ? rule({ ...context, block })
    : rule === 'self' ? [{ id: block.definition.id, count: 1 }] : rule ?? [];
  return drops.map(stack => ({ ...stack }));
}
// Future recipe ingredients can name an exact ID or a shared tag.
export const blockMatches = (id, ingredient) => typeof ingredient === 'string' ? id === ingredient
  : Boolean(ingredient?.tag && BLOCK_TYPES.get(id)?.tags.includes(ingredient.tag));
for (const [id, name, color, extra = {}] of [
  ['bedrock', 'Bedrock', '#41474b'],
  ['stone', 'Stone', '#929da4', {drops:[{id:'cobblestone',count:1}]}], ['cobblestone', 'Cobblestone', '#879198'],
  ['dirt', 'Dirt', '#a47145'],
  ['grass.block', 'Grass Block', '#74ba42', { faces: { top: 'grass.top', bottom: 'dirt', side: 'grass.side' }, particleTexture: 'grass.side', behavior: grassBehavior, drops: [{ id: 'dirt', count: 1 }] }],
  ['sand', 'Sand', '#edda98', { falling: true }], ['gravel', 'Gravel', '#a0a09a', { falling: true }],
  ['oak.log', 'Oak Log', '#997044', { defaultState: { axis: 'y' }, faces: { top: 'oak.end', bottom: 'oak.end', side: 'oak.bark' }, particleTexture: 'oak.bark', tags: ['wood.logs', 'wood.oak'] }],
  ['oak.planks', 'Oak Planks', '#c79456', { tags: ['wood.planks', 'wood.oak'] }],
  ['glass', 'Glass', '#dceff4', { opaque: false, renderMode: 'glass', cullSameType: true, drops: [] }],
  ['oak.leaves', 'Oak Leaves', '#55a141', { opaque: false, renderMode: 'cutout',
    defaultState: { persistent: true, distance: 7 }, drops: [], tags: ['leaves', 'wood.oak'] }],
  ['pine.log', 'Pine Log', '#635044', { defaultState: { axis: 'y' }, faces: { top: 'pine.end', bottom: 'pine.end', side: 'pine.bark' }, particleTexture: 'pine.bark', tags: ['wood.logs', 'wood.pine'] }],
  ['pine.planks', 'Pine Planks', '#80634c', { tags: ['wood.planks', 'wood.pine'] }],
  ['pine.leaves', 'Pine Leaves', '#326b47', { opaque: false, renderMode: 'cutout', defaultState: { persistent: true, distance: 7 }, drops: [], tags: ['leaves', 'wood.pine'] }],
  ['crafting.table', 'Crafting Table', '#b08450', { faces: { top: 'crafting.top', bottom: 'oak.planks', side: 'crafting.side' }, particleTexture: 'crafting.side', interaction: 'crafting.table' }],
]) registerBlockType({ id, name, color, ...extra });
for (const wood of ['oak', 'pine']) {
  const name = wood === 'oak' ? 'Oak' : 'Pine', faces = { all: `${wood}.planks` };
  registerBlockType({ id: `${wood}.slab`, name: `${name} Slab`, faces, particleTexture: `${wood}.planks`, collisionShape: 'slab', opaque: false,
    defaultState: { type: 'bottom' }, drops: ({ block }) => [{ id: block.id, count: block.state?.type === 'double' ? 2 : 1 }] });
  registerBlockType({ id: `${wood}.fence`, name: `${name} Fence`, faces, particleTexture: `${wood}.planks`, collisionShape: 'fence', opaque: false });
  registerBlockType({ id: `${wood}.stairs`, name: `${name} Stairs`, faces, particleTexture: `${wood}.planks`, collisionShape: 'stairs', opaque: false,
    defaultState: { facing: 'north', half: 'bottom', shape: 'straight' } });
  registerBlockType({ id: `${wood}.door`, name: `${name} Door`, faces: { all: `${wood}.door.lower` }, particleTexture: `${wood}.door.lower`, collisionShape: 'door', opaque: false,
    interaction: 'door', itemModel: 'generated', itemTexture: `${wood}.door.item`, itemSpriteDepth: 0, defaultState: { facing: 'north', hinge: 'left', open: false, half: 'lower' } });
}
registerBlockType({ id: 'furnace', name: 'Furnace', particleTexture: 'furnace.side', interaction: 'furnace',
  defaultState: { facing: 'north', lit: false }, itemState: { facing: 'south', lit: false } });
registerBlockType({ id: 'water', name: 'Water', solid: false, opaque: false, collisionShape: 'fluid', renderMode: 'fluid', inventoryItem: false,
  particles: false, drops: [], defaultState: { level: 0, falling: false } });
registerStoneContent(registerBlockType);
