import { blockBoxes, blockOpaque } from './block-shapes.js';
import { blockFaceTexture } from './block-types.js';
import { blockShade } from './block-appearance.js';
export function faceUv(p, axis, block) {
  let axes = axis === 0 ? [2, 1] : axis === 1 ? [2, 0] : [0, 1];
  const logAxis = 'xyz'.indexOf(block.state?.axis ?? 'y');
  if (block.definition.tags.includes('wood.logs') && axis !== logAxis && axes[1] !== logAxis) axes = [axes[1], axes[0]];
  const uv = axes.map(a => p[a]);
  if (block.definition.collisionShape === 'door' && axis !== 1 && block.state.hinge === 'right') uv[0] = 1 - uv[0];
  return uv;
}
// Tessellate the UNION of a few authored boxes, removing internal intersections.
// Ordinary cubes still use the existing chunk-wide greedy fast path.
export function shapeQuads(block, world = null) {
  const boxes = blockBoxes(block, 'selection', world), coords = [0, 1, 2].map(a => [...new Set(boxes.flatMap(b => [b[a], b[a + 3]]))].sort((a, b) => a - b));
  const dimensions = coords.map(c => c.length - 1), quads = [];
  const solid = cell => {
    if (cell.some((n, a) => n < 0 || n >= dimensions[a])) return false;
    const p = cell.map((n, a) => (coords[a][n] + coords[a][n + 1]) / 2);
    return boxes.some(b => p.every((v, a) => v > b[a] && v < b[a + 3]));
  };
  for (let axis = 0; axis < 3; axis++) for (const sign of [-1, 1]) {
    const u = (axis + 1) % 3, v = (axis + 2) % 3;
    for (let slice = 0; slice < dimensions[axis]; slice++) {
      const mask = Array(dimensions[u] * dimensions[v]).fill(false);
      for (let j = 0; j < dimensions[v]; j++) for (let i = 0; i < dimensions[u]; i++) {
        const at = [0, 0, 0]; at[axis] = slice; at[u] = i; at[v] = j;
        const next = [...at]; next[axis] += sign;
        if (solid(at) && !solid(next)) mask[i + j * dimensions[u]] = true;
      }
      for (let j = 0; j < dimensions[v]; j++) for (let i = 0; i < dimensions[u];) {
        if (!mask[i + j * dimensions[u]]) { i++; continue; }
        let w = 1, h = 1;
        while (i + w < dimensions[u] && mask[i + w + j * dimensions[u]]) w++;
        outer: while (j + h < dimensions[v]) {
          for (let k = 0; k < w; k++) if (!mask[i + k + (j + h) * dimensions[u]]) break outer;
          h++;
        }
        const p = [0, 0, 0]; p[axis] = coords[axis][slice + (sign > 0 ? 1 : 0)]; p[u] = coords[u][i]; p[v] = coords[v][j];
        const corners = [p, [...p], [...p], [...p]];
        corners[1][u] = corners[2][u] = coords[u][i + w]; corners[2][v] = corners[3][v] = coords[v][j + h];
        let hidden = false;
        if (world && (Math.abs(p[axis]) < 1e-8 || Math.abs(p[axis] - 1) < 1e-8)) {
          const offset = [0, 0, 0]; offset[axis] = sign;
          hidden = blockOpaque(world.blockAt(block.x + offset[0], block.y + offset[1], block.z + offset[2]));
        }
        if (!hidden) quads.push({ corners, axis, sign, texture: blockFaceTexture(block.id, axis, sign, block.state), shade: blockShade(axis, sign) });
        for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) mask[i + x + (j + y) * dimensions[u]] = false;
        i += w;
      }
    }
  }
  return quads;
}
