// Java-style edge reduction, applied to requested horizontal movement only.
export function protectSneakingEdge(world, player, x, z) {
  const size = player.size ?? 1;
  const step = 0.05 * size;
  const supported = (dx, dz) => world.supportedPath(player, dx, dz, 0.6 * size);
  const reduce = value => Math.abs(value) <= step ? 0 : value - Math.sign(value) * step;
  let count = 0;
  while (x !== 0 && !supported(x, 0)) { x = reduce(x); if (++count > 4096) { x = 0; break; } }
  count = 0;
  while (z !== 0 && !supported(0, z)) { z = reduce(z); if (++count > 4096) { z = 0; break; } }
  count = 0;
  while (x !== 0 && z !== 0 && !supported(x, z)) {
    x = reduce(x); z = reduce(z);
    if (++count > 4096) { x = z = 0; break; }
  }
  return { x, z };
}
