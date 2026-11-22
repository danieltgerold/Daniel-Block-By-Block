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
export const farmlandBehavior = Object.freeze({
  neighborChanged(world,b) {if(world.isOpaqueSolid(b.x,b.y+1,b.z))world.setBlock(b.x,b.y,b.z,'dirt');},
  tick(world,b) {
    if(world.isOpaqueSolid(b.x,b.y+1,b.z)){world.setBlock(b.x,b.y,b.z,'dirt');return;}
    let wet=false;
    for(let x=-4;x<=4&&!wet;x++)for(let z=-4;z<=4&&!wet;z++)for(let y=0;y<=1;y++)if(world.blockIdAt(b.x+x,b.y+y,b.z+z)==='water'){wet=true;break;}
    const moisture=wet?7:Math.max(0,b.state.moisture-1),dryTicks=wet||moisture?0:(b.state.dryTicks??0)+1;
    world.setBlock(b.x,b.y,b.z,dryTicks>=30?'dirt':'farmland',dryTicks>=30?{}:{moisture,dryTicks});
  },
});
