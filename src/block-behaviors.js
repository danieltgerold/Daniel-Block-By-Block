// Optional definition hooks keep special blocks out of common cube mechanics.
// Cover checks are intentionally simplified opacity tests, not Java light propagation.
export const grassBehavior = Object.freeze({
  neighborChanged(world, block) {
    if (world.isOpaqueSolid(block.x, block.y + 1, block.z)) world.setBlock(block.x, block.y, block.z, 'dirt');
  },
  tick(world, block, random) {
    if (world.isOpaqueSolid(block.x, block.y + 1, block.z)) {
      world.setBlock(block.x, block.y, block.z, 'dirt'); return;
    }
    const offset = () => Math.floor(random() * 3) - 1;
    const x = block.x + offset(), y = block.y + offset(), z = block.z + offset();
    if (world.blockIdAt(x, y, z) === 'dirt' && !world.isOpaqueSolid(x, y + 1, z)) world.setBlock(x, y, z, 'grass.block');
  },
});
