import { BLOCK_TYPES, blockFaceTexture } from './block-types.js';
import { BLOCK_TEXTURES, paletteAlpha } from './block-textures.js';
import { TEST_BLOCK_ICON, shaded } from './block-appearance.js';
const icons = new Map();
export function blockIcon(id) {
  if (id === 'test.block') return TEST_BLOCK_ICON;
  if (icons.has(id)) return icons.get(id);
  if (!BLOCK_TYPES.has(id)) return null;
  const faces = [
    [1, 1, '1.8125 .9375 -1.8125 .9375 32 3', 1],
    [0, -1, '1.8125 .9375 0 1.8125 3 18', .82],
    [2, 1, '1.8125 -.9375 0 1.8125 32 33', .71],
  ];
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 66" shape-rendering="crispEdges">${faces.map(([axis, sign, matrix, shade]) => {
    const tile = BLOCK_TEXTURES.get(blockFaceTexture(id, axis, sign)); if (!tile) return '';
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
