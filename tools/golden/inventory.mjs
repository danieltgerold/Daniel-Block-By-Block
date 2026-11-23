// Records seeded operation traces on the JS PlayerInventory. Each row is one operation and the complete
// observable state after it (slots, cursor, selection, items dropped into the world, return value), written
// as text. The Java inventory replays the operations and must produce the identical text after every step.
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { PlayerInventory, ITEMS, HOTBAR, MAIN, STORAGE } from '../../src/inventory.js';
import { RECIPES } from '../../src/recipes.js';
import { FurnaceEntity, SMELTING } from '../../src/smelting.js';

const lcg = seed => () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
export const stackText = s => s ? `${s.id}x${s.count}${(s.damage ?? 0) ? `d${s.damage}` : ''}` : '-';
export const TARGETS = { storage: STORAGE, main: MAIN, hotbar: HOTBAR };

export function stateText(inv, drops, ret, furnace = null) {
  const slots = [];
  for (let i = 0; i < 50; i++) if (inv.slots[i]) slots.push(`${i}:${stackText(inv.slots[i])}`);
  const out = inv.crafting.output;
  const f = furnace ? [...furnace.slots.map(stackText), `b${furnace.burnTime}`, `d${furnace.burnDuration}`, `c${furnace.cookTime}`, `r${furnace.recipeId ?? '-'}`].join('/') : '-';
  return [`sel=${inv.selected}`, `cur=${stackText(inv.cursor)}`, `slots=${slots.join('|') || '-'}`,
    `craft=${inv.crafting.active ? inv.crafting.size : 'off'}`, `out=${out ? `${out.id}x${out.count}` : '-'}`,
    `furnace=${f}`, `open=${inv.furnace ? 1 : 0}`,
    `drops=${drops.map(stackText).join('|') || '-'}`, `ret=${ret}`].join(';');
}

const FURNACE_POOL = ['sand', 'cobblestone', 'iron.ore', 'gold.ore', 'raw.porkchop', 'stone.bricks', 'coal', 'oak.planks', 'oak.log', 'stick', 'oak.door', 'oak.slab', 'stone', 'glass', 'iron.ingot', 'crafting.table', 'water.bucket'];
const SMELT_INPUTS = [...SMELTING.keys(), 'stone', 'nothing'];
// Saved furnaces: input|fuel|output|burnTime|burnDuration|cookTime (recipeId is derived on the first tick).
const FURNACE_SAVES = ['sandx5|coalx2|-|0|0|0', 'iron.orex64|oak.logx3|iron.ingotx60|0|0|0', 'cobblestonex3|stickx9|stonex62|150|300|120', 'raw.porkchopx2|-|-|0|0|0',
  'sandx1|coalx1|glassx63|0|0|199', '-|-|-|0|0|0', 'gold.orex1|coalx1|-|0|0|0', 'stone.bricksx4|oak.planksx2|cracked.stone.bricksx2|40|300|0', 'sandx3|coalx5|cobblestonex1|0|0|0'];
const RECIPE_IDS = [...RECIPES.recipes.keys()];
// Recipes the crafting pool can actually satisfy, so random traces craft instead of mostly failing.
const LIKELY = ['oak.planks', 'pine.planks', 'sticks', 'crafting.table', 'oak.slab', 'pine.slab', 'oak.fence', 'pine.door', 'oak.stairs', 'pine.stairs', 'furnace',
  'stone.bricks', 'stone.slab', 'stone.stairs', 'stone.wall', 'cobblestone.slab', 'wood.pickaxe', 'wood.axe', 'stone.pickaxe', 'stone.sword', 'iron.pickaxe',
  'chiseled.stone.bricks', 'polished.granite', 'lapis.unpack', 'iron.block'];
const CRAFT_POOL = ['oak.planks', 'pine.planks', 'oak.log', 'pine.log', 'stick', 'cobblestone', 'stone', 'iron.ingot', 'coal', 'diamond', 'granite', 'stone.bricks', 'stone.slab', 'lapis.block'];
const POOL = ['stone', 'cobblestone', 'oak.planks', 'pine.planks', 'stick', 'coal', 'raw.porkchop', 'sand', 'bucket', 'water.bucket', 'stone.pickaxe', 'iron.ingot'];

function randomOp(rand, step, mode = '') {
  const crafting = mode === 'crafting';
  const pick = list => list[Math.floor(rand() * list.length)];
  const n = max => Math.floor(rand() * max);
  const index = () => mode === 'furnace' ? n(rand() < 0.5 ? 54 : 41) : crafting ? n(rand() < 0.93 ? 50 : 54) : n(rand() < 0.9 ? 41 : 54);
  const roll = rand();
  if (mode === 'furnace') {
    const r = rand();
    if (r < 0.06) return `furnacenew:${pick(FURNACE_SAVES)}`;
    if (r < 0.14) return 'furnaceopen';
    if (r < 0.17) return 'furnaceclose';
    if (r < 0.34) return `ftick:${pick([1, 1, 2, 5, 20, 100, 200, 400])}`;
    if (r < 0.40) return `takeout:${pick([0, 1, 9, 40, 53])}`;
    if (r < 0.48) return `fillinput:${n(2)}:${pick(SMELT_INPUTS)}`;
    if (r < 0.62) return `insert:${pick(FURNACE_POOL)}:${1 + n(rand() < 0.4 ? 70 : 16)}:${pick(['storage', 'storage', 'main', 'hotbar'])}:0`;
    if (r < 0.66) return `begin:${rand() < 0.5 ? 2 : 3}`;
  }
  if (crafting) {
    const r = rand();
    const recipe = () => rand() < 0.75 ? LIKELY[Math.floor(rand() * LIKELY.length)] : RECIPE_IDS[Math.floor(rand() * RECIPE_IDS.length)];
    if (r < 0.08) return `begin:${rand() < 0.4 ? 2 : 3}`;
    if (r < 0.10) return 'end';
    if (r < 0.26) return `take:${pick(['cursor', 'inventory', 'slot', 'drop', 'cursor', 'inventory'])}:${n(2)}:${n(54)}`;
    if (r < 0.40) return `fill:${recipe()}:${n(2)}`;
    if (r < 0.44) return `canmake:${recipe()}`;
    if (r < 0.62) return `insert:${pick(CRAFT_POOL)}:${1 + n(rand() < 0.4 ? 70 : 16)}:${pick(['storage', 'storage', 'main', 'hotbar'])}:0`;
    if (r < 0.65) return `shiftmatching:${pick(CRAFT_POOL)}:${n(2)}:${n(2)}`;
  }
  if (roll < 0.14) return `insert:${pick(POOL)}:${rand() < 0.2 ? 60 + n(200) : 1 + n(40)}:${pick(Object.keys(TARGETS))}:${n(4)}`;
  if (roll < 0.34) return `click:${index()}:${pick([0, 0, 2])}`;
  if (roll < 0.42) return `drag:${Array.from({ length: 1 + n(6) }, index).join('|')}:${pick([0, 2])}`;
  if (roll < 0.50) return `shift:${index()}`;
  if (roll < 0.54) return `select:${n(20) - 5}`;
  if (roll < 0.57) return 'consume';
  if (roll < 0.62) return `collect:${pick(POOL)}`;
  if (roll < 0.67) return `swap:${index()}:${index()}`;
  if (roll < 0.73) return `drop:${index()}:${n(2)}`;
  if (roll < 0.77) return `dropcursor:${n(2)}`;
  if (roll < 0.80) return `pick:${pick(POOL)}:${n(2)}`;
  if (roll < 0.83) return `shiftmatching:${pick(POOL)}:${n(2)}`;
  if (roll < 0.86) return `capacity:${pick(POOL)}:${pick(Object.keys(TARGETS))}`;
  if (roll < 0.89) return 'close';
  if (roll < 0.91) return 'dropcarried';
  if (roll < 0.94) return 'reload';
  if (roll < 0.97) return `load:${pick(LOADS)}`;
  return `insert:${pick(POOL)}:${1 + n(64)}:storage:0`;
}

// Hand-written saved games: oversized stacks, unknown ids, bad counts, bad selection.
const LOADS = [
  '0=stonex200|1=oak.planksx64|9=stickx3:cobblestonex70:4',
  '0=nopex5|1=stonex0|2=stonex-3|3=stonex1.5|4=stonex2:-:99',
  '8=bucketx40|40=water.bucketx5|20=stone.pickaxex1d7:oak.planksx10:-3',
  '-:-:-', '0=stonex64|1=stonex64|2=stonex64|3=stonex64|4=stonex64|5=stonex64|6=stonex64|7=stonex64|8=stonex64:stonex300:0',
];

function parseFurnace(text) {
  const [input, fuel, output, burn, duration, cook] = text.split('|');
  const read = part => { if (!part || part === '-') return null; const m = /^(.*)x(\d+)$/.exec(part); return { id: m[1], count: Number(m[2]) }; };
  return { slots: [read(input), read(fuel), read(output)], burnTime: Number(burn), burnDuration: Number(duration), cookTime: Number(cook) };
}

function parseLoad(text) {
  const [slotText, cursor, selected] = text.split(':');
  const read = part => { if (!part || part === '-') return undefined; const m = /^(.*)x(-?[\d.]+)(?:d(\d+))?$/.exec(part);
    return { id: m[1], count: Number(m[2]), ...(m[3] ? { damage: Number(m[3]) } : {}) }; };
  const slots = []; if (slotText !== '-') for (const part of slotText.split('|')) { const [i, s] = part.split('='); slots[Number(i)] = read(s); }
  return { slots, cursor: read(cursor), selected: selected === '-' ? undefined : Number(selected) };
}

export function applyOp(inv, op, drops, ctx = {}) {
  const [name, ...a] = op.split(':');
  const yes = v => v ? '1' : '0';
  switch (name) {
    case 'insert': return String(inv.insert(a[0], Number(a[1]), TARGETS[a[2]], Number(a[3]) && ITEMS.get(a[0]).durability ? { damage: Number(a[3]) } : {}));
    case 'click': inv.click(Number(a[0]), Number(a[1])); return '-';
    case 'drag': inv.drag(a[0].split('|').map(Number), Number(a[1])); return '-';
    case 'shift': inv.shift(Number(a[0])); return '-';
    case 'select': inv.select(Number(a[0])); return '-';
    case 'consume': return yes(inv.consumeSelected());
    case 'collect': inv.collect(a[0]); return '-';
    case 'swap': return yes(inv.swap(Number(a[0]), Number(a[1])));
    case 'drop': return yes(inv.drop(Number(a[0]), a[1] === '1'));
    case 'dropcursor': inv.dropCursor(a[0] === '1'); return '-';
    case 'pick': return yes(inv.pick(a[0], { creative: a[1] === '1' }));
    case 'shiftmatching': inv.shiftMatching(a[0], a[1] === '1', a[2] === '1'); return '-';
    case 'begin': inv.crafting.begin(Number(a[0])); return '-';
    case 'end': inv.crafting.end(); return '-';
    case 'take': return String(inv.crafting.take({ destination: a[0], repeat: a[1] === '1', slot: Number(a[2]) }));
    case 'fill': { const r = inv.crafting.fill(a[0], a[1] === '1'); return r.ok ? `ok${r.crafts}` : `no:${r.reason}`; }
    case 'canmake': return yes(inv.crafting.canMake(RECIPES.recipes.get(a[0])));
    case 'furnacenew': { ctx.furnace = new FurnaceEntity(parseFurnace(a.join(':'))); inv.openFurnace(ctx.furnace); return '-'; }
    case 'furnaceopen': if (ctx.furnace) inv.openFurnace(ctx.furnace); return '-';
    case 'furnaceclose': inv.closeFurnace(); return '-';
    case 'ftick': for (let i = 0; i < Number(a[0]); i++) ctx.furnace?.tick(); return '-';
    case 'takeout': return yes(inv.takeFurnaceOutputTo(Number(a[0])));
    case 'fillinput': { const r = inv.fillFurnaceInput(a[0] === '1', SMELTING.get(a[1])); return r.ok ? 'ok' : r.reason.startsWith('Missing') ? 'no:missing' : r.reason.startsWith('Not enough') ? 'no:space' : 'no:closed'; }
    case 'capacity': return String(inv.capacity(a[0], TARGETS[a[1]]));
    case 'close': inv.close(); return '-';
    case 'dropcarried': inv.dropCarried(stack => drops.push(stack)); return '-';
    case 'reload': inv.load(JSON.parse(JSON.stringify(inv.save()))); return '-';
    case 'load': inv.load(parseLoad(a.join(':'))); return '-';
    default: throw new Error(`unknown op ${op}`);
  }
}

export function inventoryRows(seed, steps, mode = '') {
  const rand = lcg(seed), drops = [], ctx = {};
  const inv = new PlayerInventory({ onDrop: stack => drops.push({ ...stack }) });
  const rows = [];
  for (let step = 0; step < steps; step++) {
    drops.length = 0;
    const op = randomOp(rand, step, mode);
    const ret = applyOp(inv, op, drops, ctx);
    rows.push(`${step},${op},${stateText(inv, drops, ret, ctx.furnace)}`);
  }
  return rows;
}

// Short scripted scenarios aimed at behaviours random traces seldom reach.
const DIRECTED = {
  offhand: ['insert:stone:30:storage:0', 'click:0:0', 'click:40:0', 'capacity:stone:storage', 'shift:40', 'insert:stone:50:storage:0',
    'shift:40', 'capacity:stone:storage', 'collect:stone', 'swap:40:1', 'drop:40:1', 'drop:40:0'],
  offhandPartial: ['insert:stone:40:storage:0', 'click:0:0', 'click:40:0', 'shift:40', 'capacity:stone:storage'],
  dragDuplicates: ['insert:stone:20:main:0', 'click:9:0', 'drag:1|1|2|2|3:0', 'click:9:2', 'drag:4|4:2', 'drag:5|5|5|6:2', 'drag:6|6|7:0', 'close'],
  creativePick: ['insert:stone:64:hotbar:0', 'insert:coal:64:hotbar:0', 'insert:sand:64:hotbar:0', 'insert:stick:64:hotbar:0', 'insert:oak.planks:64:hotbar:0',
    'insert:pine.planks:64:hotbar:0', 'insert:cobblestone:64:hotbar:0', 'insert:raw.porkchop:64:hotbar:0', 'insert:iron.ingot:64:hotbar:0',
    'pick:bucket:1', 'pick:stone:1', 'pick:water.bucket:1', 'select:4', 'pick:coal:0', 'pick:sand:0'],
  fullClose: ['insert:stone:2304:storage:0', 'click:0:0', 'insert:coal:30:storage:0', 'close', 'dropcarried'],
  collect: ['insert:stone:200:storage:0', 'click:3:0', 'collect:stone', 'click:12:0', 'click:20:2', 'collect:stone', 'close'],
  tools: ['insert:stone.pickaxe:1:hotbar:3', 'insert:stone.pickaxe:1:hotbar:0', 'insert:stone.pickaxe:1:main:3', 'click:0:0', 'click:1:0', 'collect:stone.pickaxe', 'shift:0'],
  load: ['insert:stone:100:storage:0', 'load:0=stonex200|1=oak.planksx64|9=stickx3:cobblestonex70:4', 'close', 'reload', 'dropcarried'],
};

const FURNACE_DIRECTED = {
  smelt: ['insert:sand:5:storage:0', 'insert:coal:2:storage:0', 'furnacenew:-|-|-|0|0|0', 'shift:0', 'shift:1', 'ftick:5', 'ftick:250', 'takeout:5', 'click:53:0', 'click:53:2', 'collect:glass', 'furnaceclose', 'ftick:400', 'furnaceopen', 'click:53:0'],
  outputMerge: ['insert:glass:30:storage:0', 'furnacenew:sandx2|coalx1|glassx40|0|0|0', 'ftick:420', 'click:0:0', 'click:53:0', 'click:53:2', 'click:53:0', 'drop:53:1', 'drop:53:0', 'takeout:9', 'takeout:0'],
  fillInput: ['insert:sand:70:storage:0', 'insert:iron.ore:10:storage:0', 'furnacenew:iron.orex5|-|-|0|0|0', 'fillinput:1:sand', 'fillinput:0:sand', 'fillinput:1:iron.ore', 'fillinput:0:nothing', 'furnaceclose', 'fillinput:1:sand'],
  fillFull: ['insert:stone:2304:storage:0', 'furnacenew:iron.orex5|-|-|0|0|0', 'insert:sand:3:storage:0', 'fillinput:0:sand', 'fillinput:1:iron.ore'],
  routing: ['insert:cobblestone:20:storage:0', 'insert:oak.planks:8:storage:0', 'insert:stick:5:storage:0', 'insert:water.bucket:1:storage:0', 'furnacenew:-|-|-|0|0|0', 'shift:0', 'shift:1', 'shift:2', 'shift:3', 'shift:51', 'shift:52', 'ftick:400', 'shift:53', 'shiftmatching:cobblestone:1:0'],
  slotRules: ['insert:sand:10:storage:0', 'insert:coal:4:storage:0', 'furnacenew:-|-|-|0|0|0', 'click:0:0', 'click:52:0', 'click:51:0', 'click:52:0', 'swap:0:51', 'swap:1:52', 'swap:1:53', 'drag:51|52|53|1:0', 'collect:sand', 'furnaceclose', 'click:51:0'],
  closeKeeps: ['furnacenew:sandx64|coalx8|-|0|0|0', 'ftick:1000', 'furnaceclose', 'ftick:1000', 'furnaceopen', 'dropcarried', 'close', 'furnaceopen', 'reload'],
  burnOut: ['furnacenew:sandx2|stickx1|-|0|0|0', 'ftick:100', 'ftick:1', 'ftick:5', 'ftick:30', 'ftick:200'],
  outputRight: ['insert:glass:30:storage:0', 'furnacenew:sandx2|coalx1|glassx40|0|0|0', 'ftick:420', 'click:0:0', 'click:53:2', 'click:53:2', 'click:53:0'],
  cookDecay: ['furnacenew:sandx2|-|-|0|0|150', 'ftick:10', 'insert:coal:1:storage:0', 'shift:0', 'ftick:3', 'ftick:60', 'ftick:200'],
};

const CRAFTING_DIRECTED = {
  sticks: ['insert:oak.planks:8:storage:0', 'begin:2', 'click:0:0', 'click:41:2', 'click:43:2', 'take:cursor:0:0', 'take:cursor:1:0', 'click:41:2', 'take:inventory:1:0', 'end'],
  table: ['insert:pine.planks:12:storage:0', 'begin:2', 'fill:crafting.table:1', 'take:inventory:1:0', 'take:drop:0:0', 'end'],
  fillMax: ['insert:oak.planks:64:storage:0', 'insert:stick:20:storage:0', 'begin:3', 'fill:oak.fence:1', 'take:inventory:1:0', 'fill:oak.door:0', 'take:slot:0:8', 'canmake:oak.stairs', 'end', 'close'],
  mixedPlanks: ['insert:oak.planks:1:hotbar:0', 'insert:pine.planks:1:main:0', 'begin:2', 'fill:sticks:0', 'take:cursor:0:0', 'end'],
  overflow: ['insert:stone:2304:storage:0', 'begin:3', 'insert:oak.planks:4:hotbar:0', 'fill:oak.slab:1', 'end', 'close'],
  tools: ['insert:stone.bricks:4:storage:0', 'insert:cobblestone:20:storage:0', 'insert:stick:8:storage:0', 'begin:3', 'fill:stone.pickaxe:0', 'take:inventory:0:0', 'fill:stone.shovel:1', 'take:cursor:1:0', 'end'],
  pineFirstSticks: ['insert:pine.planks:1:hotbar:0', 'insert:oak.planks:1:main:0', 'begin:2', 'fill:sticks:0', 'take:inventory:1:0', 'end'],
  recipeChange: ['insert:oak.planks:6:storage:0', 'begin:2', 'click:0:0', 'click:41:2', 'click:41:2', 'click:42:2', 'click:43:2', 'click:43:2', 'click:44:2',
    'take:slot:0:41', 'take:slot:0:42', 'take:inventory:1:0', 'take:cursor:1:0', 'end'],
  gridSlot: ['insert:oak.planks:2:storage:0', 'begin:2', 'click:0:0', 'click:41:2', 'click:43:2', 'take:slot:0:42', 'take:slot:0:5', 'take:slot:0:40'],
  switchGrid: ['insert:oak.log:3:storage:0', 'begin:2', 'fill:oak.planks:1', 'begin:3', 'begin:2', 'take:inventory:1:0', 'end'],
};

export function generateInventory(outDir) {
  const dir = join(outDir, 'inventory');
  mkdirSync(dir, { recursive: true });
  const rows = [];
  for (const [seed, steps] of [[11, 700], [29, 700], [5150, 700], [8675309, 700]]) rows.push(...inventoryRows(seed, steps).map(r => `${seed},${r}`));
  for (const [name, ops] of Object.entries(DIRECTED)) {
    const drops = [], inv = new PlayerInventory({ onDrop: stack => drops.push({ ...stack }) });
    ops.forEach((op, step) => { drops.length = 0; const ret = applyOp(inv, op, drops); rows.push(`${name},${step},${op},${stateText(inv, drops, ret)}`); });
  }
  writeFileSync(join(dir, 'basic.csv'), ['seed,step,op,state', ...rows].join('\n') + '\n');
  const crafting = [];
  for (const [seed, steps] of [[31, 700], [77, 700], [2468, 700], [13579, 700]]) crafting.push(...inventoryRows(seed, steps, 'crafting').map(r => `${seed},${r}`));
  for (const [name, ops] of Object.entries(CRAFTING_DIRECTED)) {
    const drops = [], inv = new PlayerInventory({ onDrop: stack => drops.push({ ...stack }) });
    ops.forEach((op, step) => { drops.length = 0; const ret = applyOp(inv, op, drops); crafting.push(`${name},${step},${op},${stateText(inv, drops, ret)}`); });
  }
  const furnace = [];
  for (const [seed, steps] of [[41, 700], [89, 700], [1357, 700], [24680, 700]]) furnace.push(...inventoryRows(seed, steps, 'furnace').map(r => `${seed},${r}`));
  for (const [name, ops] of Object.entries(FURNACE_DIRECTED)) {
    const drops = [], ctx = {}, inv = new PlayerInventory({ onDrop: stack => drops.push({ ...stack }) });
    ops.forEach((op, step) => { drops.length = 0; const ret = applyOp(inv, op, drops, ctx); furnace.push(`${name},${step},${op},${stateText(inv, drops, ret, ctx.furnace)}`); });
  }
  writeFileSync(join(dir, 'furnace.csv'), ['seed,step,op,state', ...furnace].join('\n') + '\n');
  writeFileSync(join(dir, 'crafting.csv'), ['seed,step,op,state', ...crafting].join('\n') + '\n');
}
