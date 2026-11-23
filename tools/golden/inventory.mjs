// Records seeded operation traces on the JS PlayerInventory. Each row is one operation and the complete
// observable state after it (slots, cursor, selection, items dropped into the world, return value), written
// as text. The Java inventory replays the operations and must produce the identical text after every step.
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { PlayerInventory, ITEMS, HOTBAR, MAIN, STORAGE } from '../../src/inventory.js';

const lcg = seed => () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
export const stackText = s => s ? `${s.id}x${s.count}${(s.damage ?? 0) ? `d${s.damage}` : ''}` : '-';
export const TARGETS = { storage: STORAGE, main: MAIN, hotbar: HOTBAR };

export function stateText(inv, drops, ret) {
  const slots = [];
  for (let i = 0; i < 50; i++) if (inv.slots[i]) slots.push(`${i}:${stackText(inv.slots[i])}`);
  return [`sel=${inv.selected}`, `cur=${stackText(inv.cursor)}`, `slots=${slots.join('|') || '-'}`,
    `drops=${drops.map(stackText).join('|') || '-'}`, `ret=${ret}`].join(';');
}

const POOL = ['stone', 'cobblestone', 'oak.planks', 'pine.planks', 'stick', 'coal', 'raw.porkchop', 'sand', 'bucket', 'water.bucket', 'stone.pickaxe', 'iron.ingot'];

function randomOp(rand, step) {
  const pick = list => list[Math.floor(rand() * list.length)];
  const n = max => Math.floor(rand() * max);
  const index = () => n(rand() < 0.9 ? 41 : 54);
  const roll = rand();
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

function parseLoad(text) {
  const [slotText, cursor, selected] = text.split(':');
  const read = part => { if (!part || part === '-') return undefined; const m = /^(.*)x(-?[\d.]+)(?:d(\d+))?$/.exec(part);
    return { id: m[1], count: Number(m[2]), ...(m[3] ? { damage: Number(m[3]) } : {}) }; };
  const slots = []; if (slotText !== '-') for (const part of slotText.split('|')) { const [i, s] = part.split('='); slots[Number(i)] = read(s); }
  return { slots, cursor: read(cursor), selected: selected === '-' ? undefined : Number(selected) };
}

export function applyOp(inv, op, drops) {
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
    case 'shiftmatching': inv.shiftMatching(a[0], a[1] === '1'); return '-';
    case 'capacity': return String(inv.capacity(a[0], TARGETS[a[1]]));
    case 'close': inv.close(); return '-';
    case 'dropcarried': inv.dropCarried(stack => drops.push(stack)); return '-';
    case 'reload': inv.load(JSON.parse(JSON.stringify(inv.save()))); return '-';
    case 'load': inv.load(parseLoad(a.join(':'))); return '-';
    default: throw new Error(`unknown op ${op}`);
  }
}

export function inventoryRows(seed, steps) {
  const rand = lcg(seed), drops = [];
  const inv = new PlayerInventory({ onDrop: stack => drops.push({ ...stack }) });
  const rows = [];
  for (let step = 0; step < steps; step++) {
    drops.length = 0;
    const op = randomOp(rand, step);
    const ret = applyOp(inv, op, drops);
    rows.push(`${step},${op},${stateText(inv, drops, ret)}`);
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
}
