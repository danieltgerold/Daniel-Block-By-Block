// Original, deterministic pixel art. Logical rows run from top to bottom.
// No per-block textures, external artwork, random speckle or runtime canvases.
export const BLOCK_TEXTURES = new Map();
function tile(id, palette, paint) {
  const indices = new Uint8Array(256);
  const rect = (x, y, w, h, color) => {
    for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) indices[((j + 16) % 16) * 16 + ((i + 16) % 16)] = color;
  };
  paint(rect);
  BLOCK_TEXTURES.set(id, { size: 16, palette, indices });
}
tile('stone', ['#929da4', '#9da7ad', '#87939b'], r => {
  r(1, 3, 6, 2, 1); r(9, 10, 5, 3, 2); r(3, 13, 3, 1, 1); r(12, 1, 3, 1, 2);
});
tile('cobblestone', ['#65727a', '#949fa6', '#88959e', '#a5afb4'], r => {
  r(1, 1, 6, 6, 1); r(2, 0, 4, 1, 1); r(0, 2, 1, 4, 1);
  r(9, 0, 6, 5, 2); r(10, 5, 4, 1, 2); r(8, 1, 1, 3, 2);
  r(0, 9, 5, 6, 2); r(1, 8, 3, 1, 2); r(5, 10, 1, 4, 2);
  r(7, 8, 8, 7, 1); r(8, 7, 6, 1, 1); r(8, 15, 6, 1, 1);
  r(2, 2, 4, 1, 3); r(9, 9, 5, 1, 3); r(10, 1, 3, 1, 1);
});
tile('dirt', ['#a47145', '#8f603d', '#b78351'], r => {
  r(2, 2, 4, 2, 2); r(9, 6, 5, 3, 1); r(3, 11, 3, 2, 1); r(11, 13, 3, 1, 2);
});
tile('grass.top', ['#74ba42', '#81c64a', '#68ad39'], r => {
  r(1, 2, 5, 2, 1); r(9, 7, 4, 2, 2); r(3, 12, 5, 1, 1);
});
tile('grass.side', ['#a47145', '#8f603d', '#b78351', '#74ba42', '#68ad39'], r => {
  r(2, 2, 4, 2, 2); r(9, 6, 5, 3, 1); r(3, 11, 3, 2, 1); r(11, 13, 3, 1, 2);
  r(0, 0, 16, 3, 3); r(1, 3, 4, 2, 3); r(8, 3, 5, 1, 3); r(2, 4, 2, 1, 4); r(13, 2, 3, 2, 4);
});
tile('sand', ['#edda98', '#e5d08c', '#f4e4ac'], r => {
  r(2, 4, 5, 1, 2); r(10, 10, 4, 1, 1); r(4, 14, 3, 1, 1);
});
tile('gravel', ['#a0a09a', '#878c8a', '#b6b6aa', '#96948e'], r => {
  r(1, 1, 3, 3, 2); r(7, 2, 4, 2, 1); r(13, 0, 2, 3, 3);
  r(2, 7, 4, 3, 1); r(9, 7, 3, 3, 2); r(14, 6, 2, 4, 1);
  r(0, 13, 3, 2, 3); r(6, 12, 3, 3, 2); r(12, 13, 3, 2, 1);
});
tile('oak.bark', ['#997044', '#7c5634', '#b1844c'], r => {
  r(1, 0, 2, 16, 1); r(7, 0, 2, 16, 1); r(13, 0, 1, 16, 1);
  r(4, 0, 2, 6, 2); r(4, 9, 2, 7, 2); r(10, 3, 2, 11, 2);
});
tile('oak.end', ['#c99c61', '#ae7f48', '#dfb77b', '#997044'], r => {
  r(0, 0, 16, 1, 3); r(0, 15, 16, 1, 3); r(0, 0, 1, 16, 3); r(15, 0, 1, 16, 3);
  r(3, 3, 10, 10, 1); r(4, 4, 8, 8, 2); r(6, 6, 4, 4, 1); r(7, 7, 2, 2, 0);
});
tile('oak.planks', ['#c79456', '#9a6d3c', '#d6a466', '#bd874b'], r => {
  for (let y = 0; y < 16; y += 4) {
    r(0, y, 16, 1, 1); r(0, y + 1, 16, 1, 2); r((y * 2 + 3) % 16, y + 1, 1, 3, 1);
  }
  r(3, 6, 5, 1, 3); r(8, 14, 5, 1, 3);
});
export function texturePixels(id) {
  const tile = BLOCK_TEXTURES.get(id); if (!tile) return null;
  if (!tile.pixels) {
    tile.pixels = new Uint8Array(16 * 16 * 4);
    tile.indices.forEach((index, n) => tile.pixels.set([...tile.palette[index].slice(1).match(/../g).map(c => parseInt(c, 16)), 255], n * 4));
  }
  return tile.pixels;
}
