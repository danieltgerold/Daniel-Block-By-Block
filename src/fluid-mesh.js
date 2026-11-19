import { isWater, waterCorner } from './fluid-surface.js';
import { blockOpaque } from './block-shapes.js';
// One buffer per visible chunk, shared material. Neighboring cells use world
// corners even across chunk borders; internal water faces are never emitted.
export function buildWaterMesh(world, cx, cz) {
  const positions = [], normals = [], uvs = [], colors = [], indices = [];
  const ox = cx * 16, oz = cz * 16;
  const blocks = new Map(), corners = new Map(), flats = new Map();
  const at = (x, y, z) => {
    const key = `${x},${y},${z}`;
    if (!blocks.has(key)) blocks.set(key, world.blockAt(x, y, z)); return blocks.get(key);
  };
  const view = { blockAt: at };
  const height = (x, y, z) => {
    const key = `${x},${y},${z}`;
    if (!corners.has(key)) corners.set(key, waterCorner(view, x, y, z)); return y + corners.get(key);
  };
  const quad = (corners, normal, shade = 1, spanU = 1, spanV = 1) => {
    const start = positions.length / 3;
    corners.forEach((p, i) => { positions.push(p[0] - ox, p[1], p[2] - oz); normals.push(...normal); uvs.push(i === 1 || i === 2 ? spanU : 0, i >= 2 ? spanV : 0); colors.push(shade, shade, shade); });
    indices.push(start, start + 1, start + 2, start, start + 2, start + 3);
  };
  for (const { x, y, z } of world.fluids.chunks.get(`${cx},${cz}`)?.values() ?? []) {
    const covered = isWater(at(x, y + 1, z));
    const a = covered ? y + 1 : height(x, y, z), b = covered ? y + 1 : height(x + 1, y, z);
    const c = covered ? y + 1 : height(x + 1, y, z + 1), d = covered ? y + 1 : height(x, y, z + 1);
    if (!covered) {
      if (a === b && b === c && c === d) {
        const key = `${y}:${a}`; if (!flats.has(key)) flats.set(key, { height: a, cells: Array(256).fill(false) });
        flats.get(key).cells[(x - ox) + (z - oz) * 16] = true;
      } else quad([[x, a, z], [x, d, z + 1], [x + 1, c, z + 1], [x + 1, b, z]], [0, 1, 0]);
    }
    for (const [dx, dz, corners] of [
      [1, 0, [[x + 1, y, z], [x + 1, b, z], [x + 1, c, z + 1], [x + 1, y, z + 1]]],
      [-1, 0, [[x, y, z + 1], [x, d, z + 1], [x, a, z], [x, y, z]]],
      [0, 1, [[x + 1, y, z + 1], [x + 1, c, z + 1], [x, d, z + 1], [x, y, z + 1]]],
      [0, -1, [[x, y, z], [x, a, z], [x + 1, b, z], [x + 1, y, z]]],
    ]) { const neighbor = at(x + dx, y, z + dz); if (!isWater(neighbor) && !blockOpaque(neighbor)) quad(corners, [dx, 0, dz], .92); }
    const below = at(x, y - 1, z);
    if (!isWater(below) && !blockOpaque(below)) quad([[x, y, z], [x + 1, y, z], [x + 1, y, z + 1], [x, y, z + 1]], [0, -1, 0], .88);
  }
  // Merge only identical flat tops. Repeat UVs once per block, preserving the
  // existing pixel texture orientation; slopes and all height changes stay exact.
  for (const { height: y, cells } of flats.values()) for (let z = 0; z < 16; z++) for (let x = 0; x < 16; x++) if (cells[x + z * 16]) {
    let width = 1, depth = 1;
    while (x + width < 16 && cells[x + width + z * 16]) width++;
    outer: while (z + depth < 16) {
      for (let i = 0; i < width; i++) if (!cells[x + i + (z + depth) * 16]) break outer;
      depth++;
    }
    quad([[ox + x, y, oz + z], [ox + x, y, oz + z + depth], [ox + x + width, y, oz + z + depth], [ox + x + width, y, oz + z]], [0, 1, 0], 1, depth, width);
    for (let a = 0; a < depth; a++) for (let b = 0; b < width; b++) cells[x + b + (z + a) * 16] = false;
  }
  return { positions, normals, uvs, colors, indices };
}
