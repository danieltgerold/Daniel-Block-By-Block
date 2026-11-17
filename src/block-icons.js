import { BLOCK_TYPES, blockFaceTexture } from './block-types.js';
import { BLOCK_TEXTURES, paletteAlpha } from './block-textures.js';
import { TEST_BLOCK_ICON, shaded } from './block-appearance.js';
import { itemBlock } from './block-shapes.js';
import { faceUv, shapeQuads } from './shape-mesh.js';
const icons = new Map();
function pixelPaths(tile, shade) {
  const paths = tile.palette.map(() => '');
  for (let y = 0; y < 16; y++) for (let x = 0; x < 16;) {
    const color = tile.indices[y * 16 + x]; let w = 1;
    while (x + w < 16 && tile.indices[y * 16 + x + w] === color) w++;
    paths[color] += `M${x} ${y}h${w}v1h-${w}z`; x += w;
  }
  return paths.map((d, i) => d && paletteAlpha(tile.palette[i]) ? `<path fill="${shaded(tile.palette[i].slice(0, 7), shade)}" d="${d}"/>` : '').join('');
}
export function textureIcon(id) {
  const key = `flat:${id}`; if (icons.has(key)) return icons.get(key);
  const tile = BLOCK_TEXTURES.get(id); if (!tile) return null;
  const paths = tile.palette.map(() => '');
  for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) paths[tile.indices[y * 16 + x]] += `M${x} ${y}h1v1h-1z`;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" shape-rendering="crispEdges">${paths.map((d, i) => paletteAlpha(tile.palette[i]) ? `<path fill="${tile.palette[i]}" d="${d}"/>` : '').join('')}</svg>`;
  const icon = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`; icons.set(key, icon); return icon;
}
export function blockIcon(id) {
  if (id === 'test.block') return TEST_BLOCK_ICON;
  if (icons.has(id)) return icons.get(id);
  if (!BLOCK_TYPES.has(id)) return null;
  if (BLOCK_TYPES.get(id).itemTexture) return textureIcon(BLOCK_TYPES.get(id).itemTexture);
  if (BLOCK_TYPES.get(id).collisionShape !== 'cube') {
    const block = itemBlock(id), door = block.definition.collisionShape === 'door';
    const parts = door ? [block, { ...block, state: { ...block.state, half: 'upper' } }] : [block];
    const project = p => [32 + (p[0] - p[2]) * 29, 3 + (p[0] + p[2]) * 15 + (1 - p[1]) * 29];
    const faces = parts.flatMap((part, n) => shapeQuads(part).filter(q => q.sign > 0).map(q => {
      const points = q.corners.map(p => door ? [p[0] * .5 + .25, (p[1] + n) * .5, p[2] * .5 + .25] : p);
      return { ...q, part, points, depth: points.reduce((s, p) => s + p[0] + p[1] + p[2], 0) };
    })).sort((a, b) => a.depth - b.depth);
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 66" shape-rendering="crispEdges">${faces.map((q, i) => {
      const tile = BLOCK_TEXTURES.get(q.texture); if (!tile) return '';
      const points = q.points.map(project);
      const tex = q.corners.map(p => { const [u, v] = faceUv(p, q.axis, q.part); return [u * 16, (1 - v) * 16]; });
      const dx = tex[1][0] - tex[0][0], dy = tex[1][1] - tex[0][1], ex = tex[3][0] - tex[0][0], ey = tex[3][1] - tex[0][1], det = dx * ey - ex * dy;
      const sx = points[1][0] - points[0][0], sy = points[1][1] - points[0][1], tx = points[3][0] - points[0][0], ty = points[3][1] - points[0][1];
      const a = (sx * ey - tx * dy) / det, b = (sy * ey - ty * dy) / det, c = (tx * dx - sx * ex) / det, d = (ty * dx - sy * ex) / det;
      const e = points[0][0] - a * tex[0][0] - c * tex[0][1], f = points[0][1] - b * tex[0][0] - d * tex[0][1];
      const x0 = Math.min(...tex.map(p => p[0])), y0 = Math.min(...tex.map(p => p[1])), w = Math.max(...tex.map(p => p[0])) - x0, h = Math.max(...tex.map(p => p[1])) - y0;
      return `<defs><clipPath id="c${i}"><polygon points="${points.map(p => p.join(',')).join(' ')}"/></clipPath><pattern id="t${i}" width="16" height="16" patternUnits="userSpaceOnUse">${pixelPaths(tile, q.shade)}</pattern></defs><g clip-path="url(#c${i})"><g transform="matrix(${a} ${b} ${c} ${d} ${e} ${f})"><rect x="${x0}" y="${y0}" width="${w}" height="${h}" fill="url(#t${i})"/></g></g>`;
    }).join('')}</svg>`;
    const icon = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`; icons.set(id, icon); return icon;
  }
  const faces = [
    [1, 1, '1.8125 .9375 -1.8125 .9375 32 3', 1],
    [0, -1, '1.8125 .9375 0 1.8125 3 18', .82],
    [2, 1, '1.8125 -.9375 0 1.8125 32 33', .71],
  ];
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 66" shape-rendering="crispEdges">${faces.map(([axis, sign, matrix, shade]) => {
    const tile = BLOCK_TEXTURES.get(blockFaceTexture(id, axis, sign, BLOCK_TYPES.get(id).itemState)); if (!tile) return '';
    const paths = tile.palette.map(() => '');
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16;) {
      const color = tile.indices[y * 16 + x]; let w = 1;
      while (x + w < 16 && tile.indices[y * 16 + x + w] === color) w++;
      paths[color] += `M${x} ${y}h${w}v1h-${w}z`; x += w;
    }
    return `<g transform="matrix(${matrix})">${paths.map((d, i) => d && paletteAlpha(tile.palette[i])
      ? `<path fill="${shaded(tile.palette[i].slice(0, 7), shade)}" fill-opacity="${paletteAlpha(tile.palette[i]) / 255}" d="${d}"/>` : '').join('')}</g>`;
  }).join('')}</svg>`;
  const icon = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`; icons.set(id, icon); return icon;
}
