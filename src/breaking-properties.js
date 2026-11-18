const properties = new Map([
  ['dirt', [.5, 15]], ['grass.block', [.6, 18]], ['sand', [.5, 15]], ['gravel', [.6, 18]],
  ['stone', [1.5, 150]], ['cobblestone', [2, 200]], ['glass', [.3, 9]],
  ['oak.leaves', [.2, 6]], ['pine.leaves', [.2, 6]], ['crafting.table', [2.5, 75]], ['furnace', [3.5, 350]],
  ['bedrock', [-1, Infinity]],
]);
for (const wood of ['oak', 'pine']) for (const kind of ['log', 'planks', 'slab', 'stairs', 'fence', 'door']) properties.set(`${wood}.${kind}`, [kind === 'door' ? 3 : 2, kind === 'door' ? 90 : 60]);
export function breakingProperties(id) {
  const [hardness, breakTicks] = properties.get(id) ?? [0, 0];
  return { hardness, breakTicks, breakTime: breakTicks / 20, unbreakable: hardness < 0, preferredTool: null };
}
