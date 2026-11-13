// World block appearance is independent of the selected inventory item.
export const BLOCK_TYPES = new Map();
export function registerBlockType(definition) {
  const block = Object.freeze({ particles: true, particleTint: [1, 1, 1], ...definition });
  BLOCK_TYPES.set(block.id, block); return block;
}
registerBlockType({ id: 'test.block', particleTexture: 'test.block' });
