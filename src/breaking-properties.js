const properties = new Map([
  ['dirt', [.5, 15]], ['grass.block', [.6, 18]], ['sand', [.5, 15]], ['gravel', [.6, 18]],
  ['stone', [1.5, 150]], ['cobblestone', [2, 200]], ['glass', [.3, 9]],
  ['oak.leaves', [.2, 6]], ['pine.leaves', [.2, 6]], ['crafting.table', [2.5, 75]], ['furnace', [3.5, 350]],
  ['bedrock', [-1, Infinity]],
]);
for (const wood of ['oak', 'pine']) for (const kind of ['log', 'planks', 'slab', 'stairs', 'fence', 'door']) properties.set(`${wood}.${kind}`, [kind === 'door' ? 3 : 2, kind === 'door' ? 90 : 60]);
export function breakingProperties(id) {
  const [hardness, breakTicks] = properties.get(id) ?? [0, 0];
  const requiresTool = ['stone', 'cobblestone', 'furnace'].includes(id);
  return { hardness, breakTicks, breakTime: breakTicks / 20, unbreakable: hardness < 0,
    preferredTool: requiresTool ? 'pickaxe' : id === 'glass' ? null : id.includes('leaves') ? 'shears'
      : ['dirt', 'grass.block', 'sand', 'gravel'].includes(id) ? 'shovel' : 'axe',
    requiresTool, harvestLevel: 0 };
}

// Item definitions provide tool: { type, speed, level }. Ordinary
// held blocks/items have no tool metadata and always use bare-hand speed.
export function miningProgress(definition, item, { grounded = true, underwater = false } = {}) {
  const { hardness, unbreakable, preferredTool } = definition;
  if (unbreakable || hardness < 0) return 0;
  if (hardness === 0) return 1;
  const tool = item?.tool, effective = Boolean(tool && tool.type === preferredTool);
  const harvest = canHarvest(definition,item);
  let speed = effective ? tool.speed ?? 1 : 1;
  if(tool?.type==='sword'&&(definition.tags?.includes('leaves')||definition.tags?.includes('plants')))speed=1.5;
  if (underwater) speed /= 5;
  if (!grounded) speed /= 5;
  return speed / hardness / (harvest ? 30 : 100);
}
export function canHarvest(definition,item) {
  return !definition.requiresTool || Boolean(item?.tool && item.tool.type===definition.preferredTool && (item.tool.level??0)>=(definition.harvestLevel??0));
}

export function sameBreakingTarget(a, b) {
  return Boolean(a && b && a.x === b.x && a.y === b.y && a.z === b.z && a.id === b.id
    && Object.keys(a.state).length === Object.keys(b.state).length
    && Object.keys(a.state).every(key => Object.is(a.state[key], b.state[key])));
}
