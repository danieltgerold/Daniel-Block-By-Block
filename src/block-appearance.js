export const BLOCK_COLOR = '#d9dfcd';
export const BLOCK_GRID_COLOR = '#bac4ae';
export const blockShade = (axis, sign) => axis === 1 ? (sign > 0 ? 1 : .55) : axis === 0 ? .82 : .71;
function shaded(color, amount) {
  const channels = color.slice(1).match(/../g).map(hex => {
    const c = parseInt(hex, 16) / 255;
    const linear = (c <= .04045 ? c / 12.92 : ((c + .055) / 1.055) ** 2.4) * amount;
    return Math.round((linear <= .0031308 ? linear * 12.92 : 1.055 * linear ** (1 / 2.4) - .055) * 255).toString(16).padStart(2, '0');
  });
  return `#${channels.join('')}`;
}
// One static, three-face icon for all inventory/hotbar/cursor slots. No slot
// creates a renderer, canvas, or per-frame image.
const faces = [
  ['32,3 61,18 32,33 3,18', 1],
  ['3,18 32,33 32,62 3,47', blockShade(0, 1)],
  ['32,33 61,18 61,47 32,62', blockShade(2, 1)],
];
export const TEST_BLOCK_ICON = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 66">${faces.map(([points, shade]) => `<polygon points="${points}" fill="${shaded(BLOCK_COLOR, shade)}" stroke="${shaded(BLOCK_GRID_COLOR, shade)}" stroke-width="1.4" stroke-linejoin="round"/>`).join('')}</svg>`)}`;
