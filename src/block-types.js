import { grassBehavior } from './block-behaviors.js';
// Definitions describe identity; world storage, inventory and cubes share them.
export const BLOCK_TYPES = new Map();
const listeners = new Set();
export const onBlockTypeRegistered = listener => { listeners.add(listener); return () => listeners.delete(listener); };
export function registerBlockType(definition) {
  if (!definition.id) throw new Error('A block needs a unique ID');
  const block = Object.freeze({ name: definition.id, maxStack: 64, solid: true, opaque: true,
    collisionShape: 'cube', breakTime: 0, behavior: null, tags: [],
    faces: { all: definition.id }, particleTexture: definition.id,
    particles: true, particleTint: [1, 1, 1], ...definition });
  if (BLOCK_TYPES.has(block.id)) throw new Error(`Duplicate block ID: ${block.id}`);
  BLOCK_TYPES.set(block.id, block);
  for (const listener of listeners) listener(block);
  return block;
}
export function blockFaceTexture(id, axis, sign) {
  const faces = BLOCK_TYPES.get(id)?.faces ?? { all: 'test.block' };
  if (typeof faces === 'string') return faces;
  return faces[`${sign > 0 ? 'p' : 'n'}${'xyz'[axis]}`]
    ?? faces[axis === 1 ? (sign > 0 ? 'top' : 'bottom') : 'side'] ?? faces.all ?? id;
}
// Future recipe ingredients can name an exact ID or a shared tag.
export const blockMatches = (id, ingredient) => typeof ingredient === 'string' ? id === ingredient
  : Boolean(ingredient?.tag && BLOCK_TYPES.get(id)?.tags.includes(ingredient.tag));
for (const [id, name, color, extra = {}] of [
  ['test.block', 'Test Block', '#d9dfcd'],
  ['stone', 'Stone', '#929da4'], ['cobblestone', 'Cobblestone', '#879198'],
  ['dirt', 'Dirt', '#a47145'],
  ['grass.block', 'Grass Block', '#74ba42', { faces: { top: 'grass.top', bottom: 'dirt', side: 'grass.side' }, particleTexture: 'grass.side', behavior: grassBehavior }],
  ['sand', 'Sand', '#edda98'], ['gravel', 'Gravel', '#a0a09a'],
  ['oak.log', 'Oak Log', '#997044', { faces: { top: 'oak.end', bottom: 'oak.end', side: 'oak.bark' }, particleTexture: 'oak.bark', tags: ['wood.logs', 'wood.oak'] }],
  ['oak.planks', 'Oak Planks', '#c79456', { tags: ['wood.planks', 'wood.oak'] }],
]) registerBlockType({ id, name, color, ...extra });
