export const WORLD_VERSION = 3;
export const FLAT_LAYERS = Object.freeze(['bedrock', 'dirt', 'dirt', 'grass.block']);
export const canonicalBlockId = id => id === 'test.block' ? 'dirt' : id;
// Compatibility for the existing programmatic data helpers; no browser save
// store or save UI is introduced. Clone input so importing cannot mutate it.
export function migrateLegacyItems(value) {
  if (typeof value === 'string') return canonicalBlockId(value);
  if (Array.isArray(value)) return value.map(migrateLegacyItems);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([k,v]) => [k, migrateLegacyItems(v)]));
  return value;
}
export function migrateWorldData(input) {
  const data = migrateLegacyItems(Array.isArray(input) ? { edits: input, version: 1, depth: 3 } : input);
  const world = data.world ?? data;
  if ((world.version ?? 1) >= WORLD_VERSION) return { data, world, shiftY: 0 };
  const shiftY = 4; // Old analytic surface 0 -> new surface 4.
  world.edits = (world.edits ?? []).map(edit => ({ ...edit, y: edit.y + shiftY,
    id: edit.id === undefined ? edit.solid ? 'dirt' : null : edit.id }))
    .filter(edit => edit.y !== 0 || edit.id !== null); // New bedrock fills air, not existing builds.
  world.version = WORLD_VERSION; world.terrain = { baseY: 0, layers: [...FLAT_LAYERS] }; delete world.depth;
  const shift = point => { if (point && Number.isFinite(point.y)) point.y += shiftY; };
  for (const player of new Set([data.player, world.player])) if (player) { shift(player); shift(player.position); shift(player.feet); }
  for (const pile of data.drops?.piles ?? []) { shift(pile); shift(pile.previous); }
  return { data, world, shiftY };
}
