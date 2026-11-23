// Records seeded operation traces on the JS PlayerVitals. Numbers are written as shortest round-trip
// decimals; the Java port must reproduce every field of every step bit for bit.
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { PlayerVitals } from '../../src/player-vitals.js';
import { formatNumber } from './format.mjs';

const lcg = seed => () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
const num = v => v === undefined ? '-' : formatNumber(v);
const readNum = t => t === '-' ? undefined : Number(t);

export function applyVitalsOp(v, op, events) {
  const [name, ...a] = op.split(':');
  switch (name) {
    case 'tick': {
      const [y, water, grounded, sprint, fall, size, dist, swim, jumped, sprintJump, creative, jump, fd] = a;
      const settings = jump === '-' && fd === '-' ? undefined : { size: readNum(size), jump: readNum(jump), falldamage: readNum(fd) };
      const player = { y: Number(y), inWater: water === '1', grounded: grounded === '1', sprinting: sprint === '1',
        landingDamageDistance: readNum(fall), size: readNum(size) };
      v.tick({ player, creative: creative === '1', distance: readNum(dist), swimDistance: readNum(swim),
        jumped: jumped === '1', sprintJump: sprintJump === '1', settings });
      return '-';
    }
    case 'damage': v.damage(Number(a[0]), a[1]); return '-';
    case 'exhaust': v.exhaust(Number(a[0])); return '-';
    case 'process': v.processExhaustion(); return '-';
    case 'eat': return v.eat({ hunger: Number(a[0]), saturation: Number(a[1]) }) ? '1' : '0';
    case 'restore': v.restore({ health: readNum(a[0]), hunger: readNum(a[1]), saturation: readNum(a[2]), exhaustion: readNum(a[3]) }); return '-';
    case 'reset': v.reset(); return '-';
    default: throw new Error(`unknown op ${op}`);
  }
}

export function vitalsState(v, events, ret) {
  return [num(v.health), num(v.hunger), num(v.saturation), num(v.exhaustion), v.regenTicks, v.regenMode ?? '-', v.voidTicks,
    v.dead ? 1 : 0, events.map(e => `${num(e.amount)}~${e.source}`).join('|') || '-', ret].join(',');
}

function randomOp(rand) {
  const pick = list => list[Math.floor(rand() * list.length)];
  const f = (lo, hi) => lo + rand() * (hi - lo);
  const r = rand();
  if (r < 0.62) {
    const fall = rand() < 0.12 ? num(pick([2.9, 3, 3.2, 4, 5.5, 8, 20, 60, 1e3])) : '-';
    const settings = rand() < 0.2 ? [num(pick([0, 0.5, 1.252203352512, 3, 10])), num(pick([0, 0.5, 1, 2, 5]))] : ['-', '-'];
    const size = num(pick([1, 1, 1, 0.5, 2, 4, 0.1]));
    const dist = pick([0, 0.2, 0.2, 1, 5, 40, 1e3, 1e306]);
    return `tick:${pick([10, 0, -63, -64, -65, -200])}:${rand() < 0.15 ? 1 : 0}:${rand() < 0.7 ? 1 : 0}:${rand() < 0.5 ? 1 : 0}:${fall}:${size}:${num(dist)}:${num(rand() < 0.5 ? dist : f(0, 3))}:${rand() < 0.1 ? 1 : 0}:${rand() < 0.5 ? 1 : 0}:${rand() < 0.08 ? 1 : 0}:${settings[0]}:${settings[1]}`;
  }
  if (r < 0.72) return `damage:${num(pick([0.5, 1, 3, 4, 7.25, 20, 100, -1, 0]))}:${pick(['fall', 'void', 'other', 'mob'])}`;
  if (r < 0.80) return `exhaust:${num(pick([0.005, 0.1, 1, 3.999, 4, 4.0001, 8, 12.5, 100, 1e300, 1.7976931348623157e308]))}`;
  if (r < 0.84) return 'process';
  if (r < 0.92) return `eat:${pick([1, 3, 8, 20])}:${num(pick([0.6, 1.8, 12.8, 0]))}`;
  if (r < 0.97) return `restore:${[0, 1, 2, 3].map(() => pick(['-', num(f(0, 25)), '0', '20', '5', num(-3)])).join(':')}`;
  return 'reset';
}

const DIRECTED = {
  starve: ['restore:20:3:0:0', 'exhaust:40', 'process', 'exhaust:4', 'process', 'exhaust:4.0000001', 'process', 'exhaust:12', 'process'],
  regen: ['damage:10:other', ...Array(120).fill('tick:10:0:1:0:-:1:0.2:0.2:0:0:0:-:-'), 'restore:10:18:0:0', ...Array(260).fill('tick:10:0:1:0:-:1:0.2:0.2:0:0:0:-:-')],
  fall: ['tick:10:0:1:0:3:1:0:0:0:0:0:-:-', 'reset', 'tick:10:0:1:0:3.0000001:1:0:0:0:0:0:-:-', 'reset', 'tick:10:0:1:0:4:1:0:0:0:0:0:-:-', 'reset', 'tick:10:0:1:0:20:0.5:0:0:0:0:0:-:-', 'reset', 'tick:10:0:1:0:20:4:0:0:0:0:0:-:-', 'reset', 'tick:10:0:1:0:20:1:0:0:0:0:0:10:1', 'reset', 'tick:10:0:1:0:20:1:0:0:0:0:0:0:0', 'reset', 'tick:10:0:1:0:1000:1:0:0:0:0:0:-:-'],
  fallEpsilon: ['tick:10:0:1:0:4.0000003:1:0:0:0:0:0:-:-', 'reset', 'tick:10:0:1:0:5.0000003:1:0:0:0:0:0:-:-', 'reset', 'tick:10:0:1:0:4.00000030005:1:0:0:0:0:0:-:-', 'reset',
    'tick:10:0:1:0:4.000000299:1:0:0:0:0:0:-:-', 'reset', 'tick:10:0:1:0:6.0000003005:1:0:0:0:0:0:-:-', 'reset', 'tick:10:0:1:0:5.0000003005:1:0:0:0:0:0:3:2'],
  hugeExhaustion: ['exhaust:1.7976931348623157e308', 'exhaust:1.7976931348623157e308', 'process', 'exhaust:1.7976931348623157e308', 'tick:10:0:1:1:-:1:1e306:0:0:0:0:-:-', 'process'],
  fractionalSaturation: ['restore:20:20:0.5:0', 'exhaust:5', 'process', 'restore:20:20:0.5:0', 'exhaust:12.5', 'process', 'restore:20:20:2.2:0', 'exhaust:20', 'process', 'restore:20:3:0:0', 'exhaust:9', 'process'],
  voidDeath: ['reset', ...Array(15).fill('tick:-65:0:0:0:-:1:0:0:0:0:0:-:-'), ...Array(25).fill('tick:-65:0:0:0:-:1:0:0:0:0:0:-:-'), 'eat:8:1', 'damage:5:other', 'reset'],
  creative: ['damage:5:other', 'tick:10:0:1:1:-:1:5:5:1:1:1:-:-', 'tick:-70:0:0:0:-:1:0:0:0:0:1:-:-', 'tick:10:0:1:0:50:1:0:0:0:0:1:-:-'],
  water: ['tick:10:1:0:0:-:1:0:7:0:0:0:-:-', 'tick:10:1:1:1:-:1:3:50:0:0:0:-:-', 'tick:10:0:1:1:-:1:50:50:1:1:0:-:-'],
};

export function vitalsRows(seed, steps) {
  const rand = lcg(seed), events = [], v = new PlayerVitals();
  v.onDamage = e => events.push(e);
  const rows = [];
  for (let step = 0; step < steps; step++) { events.length = 0; const op = v.dead && rand() < 0.35 ? (rand() < 0.5 ? 'reset' : 'restore:20:20:5:0') : randomOp(rand); const ret = applyVitalsOp(v, op, events); rows.push(`${step},${op},${vitalsState(v, events, ret)}`); }
  return rows;
}

export function generateVitals(outDir) {
  const dir = join(outDir, 'vitals');
  mkdirSync(dir, { recursive: true });
  const rows = [];
  for (const seed of [3, 17, 404, 90210, 777]) rows.push(...vitalsRows(seed, 900).map(r => `${seed},${r}`));
  for (const [name, ops] of Object.entries(DIRECTED)) {
    const events = [], v = new PlayerVitals(); v.onDamage = e => events.push(e);
    ops.forEach((op, step) => { events.length = 0; const ret = applyVitalsOp(v, op, events); rows.push(`${name},${step},${op},${vitalsState(v, events, ret)}`); });
  }
  writeFileSync(join(dir, 'trace.csv'), ['seed,step,op,health,hunger,saturation,exhaustion,regenTicks,regenMode,voidTicks,dead,events,ret', ...rows].join('\n') + '\n');
}
