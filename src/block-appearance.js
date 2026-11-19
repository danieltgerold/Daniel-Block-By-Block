export const blockShade = (axis, sign) => axis === 1 ? (sign > 0 ? 1 : .55) : axis === 0 ? .82 : .71;
export function shaded(color, amount) {
  const channels = color.slice(1).match(/../g).map(hex => {
    const c = parseInt(hex, 16) / 255;
    const linear = (c <= .04045 ? c / 12.92 : ((c + .055) / 1.055) ** 2.4) * amount;
    return Math.round((linear <= .0031308 ? linear * 12.92 : 1.055 * linear ** (1 / 2.4) - .055) * 255).toString(16).padStart(2, '0');
  });
  return `#${channels.join('')}`;
}
