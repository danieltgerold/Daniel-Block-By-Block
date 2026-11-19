export const isWater = block => block?.id === 'water';
export const isWaterSource = block => isWater(block) && !block.state.falling && block.state.level === 0;
export const waterHeight = block => block.state.falling ? 1 : (8 - block.state.level) / 9;
// Every adjoining cell asks for the SAME world-space corner. Sources receive
// Java-style extra weight; air lowers an exposed edge, solid banks do not.
export function waterCorner(world, x, y, z) {
  let total = 0, weights = 0;
  for (const dx of [-1, 0]) for (const dz of [-1, 0]) {
    if (isWater(world.blockAt(x + dx, y + 1, z + dz))) return 1;
    const block = world.blockAt(x + dx, y, z + dz);
    if (isWater(block)) { const weight = isWaterSource(block) ? 10 : 1; total += waterHeight(block) * weight; weights += weight; }
    else if (!block) weights++;
  }
  return weights ? total / weights : 0;
}
export function waterSurfaceAt(world, point) {
  const x = Math.floor(point.x), y = Math.floor(point.y), z = Math.floor(point.z);
  if (!isWater(world.blockAt(x, y, z))) return -Infinity;
  const u = point.x - x, v = point.z - z;
  return y + (1 - v) * ((1 - u) * waterCorner(world, x, y, z) + u * waterCorner(world, x + 1, y, z))
    + v * ((1 - u) * waterCorner(world, x, y, z + 1) + u * waterCorner(world, x + 1, y, z + 1));
}
