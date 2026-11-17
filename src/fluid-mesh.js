import { isWater, waterCorner } from './fluid-surface.js';
// One buffer per visible chunk, shared material. Neighboring cells use world
// corners even across chunk borders; internal water faces are never emitted.
export function buildWaterMesh(world, cx, cz) {
  const positions = [], normals = [], uvs = [], colors = [], indices = [];
  const ox = cx * 16, oz = cz * 16;
  const quad = (corners, normal, shade = 1) => {
    const start = positions.length / 3;
    corners.forEach((p, i) => { positions.push(p[0] - ox, p[1], p[2] - oz); normals.push(...normal); uvs.push(i === 1 || i === 2 ? 1 : 0, i >= 2 ? 1 : 0); colors.push(shade, shade, shade); });
    indices.push(start, start + 1, start + 2, start, start + 2, start + 3);
  };
  for (const { x, y, z } of world.fluids.chunks.get(`${cx},${cz}`)?.values() ?? []) {
    const a = y + waterCorner(world, x, y, z), b = y + waterCorner(world, x + 1, y, z);
    const c = y + waterCorner(world, x + 1, y, z + 1), d = y + waterCorner(world, x, y, z + 1);
    if (!isWater(world.blockAt(x, y + 1, z))) quad([[x, a, z], [x, d, z + 1], [x + 1, c, z + 1], [x + 1, b, z]], [0, 1, 0]);
    for (const [dx, dz, corners] of [
      [1, 0, [[x + 1, y, z], [x + 1, b, z], [x + 1, c, z + 1], [x + 1, y, z + 1]]],
      [-1, 0, [[x, y, z + 1], [x, d, z + 1], [x, a, z], [x, y, z]]],
      [0, 1, [[x + 1, y, z + 1], [x + 1, c, z + 1], [x, d, z + 1], [x, y, z + 1]]],
      [0, -1, [[x, y, z], [x, a, z], [x + 1, b, z], [x + 1, y, z]]],
    ]) if (!isWater(world.blockAt(x + dx, y, z + dz)) && !world.isOpaqueSolid(x + dx, y, z + dz)) quad(corners, [dx, 0, dz], .92);
    if (!isWater(world.blockAt(x, y - 1, z)) && !world.isOpaqueSolid(x, y - 1, z)) quad([[x, y, z], [x + 1, y, z], [x + 1, y, z + 1], [x, y, z + 1]], [0, -1, 0], .88);
  }
  return { positions, normals, uvs, colors, indices };
}
