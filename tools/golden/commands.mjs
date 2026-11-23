// Records chat input on the real JS ChatService and MovementController: every reply, message and broadcast, the
// resulting settings, game mode, position, items given and teleports, and Tab completions. Inputs mix valid
// commands, bad numbers, odd whitespace and plain chat. Cells are JSON-encoded; state doubles are exact decimals.
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { ChatService } from '../../src/chat.js';
import { MovementController } from '../../src/movement.js';
import { VoxelWorld } from '../../src/voxel-world.js';
import { formatNumber } from './format.mjs';
import { cell } from './chatnames.mjs';

const lcg = seed => () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
const ch = code => String.fromCharCode(code);

export function makeCommandWorld() {
  const world = new VoxelWorld({ baseY: 0, layers: ['bedrock', 'dirt', 'dirt', 'grass.block'] });
  world.setBlock(0, 6, 0, 'stone');
  const controller = new MovementController(world);
  const log = { gives: [], teleports: [], broadcasts: [] };
  const give = controller.giveItem.bind(controller), teleport = controller.teleport.bind(controller);
  controller.giveItem = (id, count) => { log.gives.push(`${id}:${count}`); return give(id, count); };
  controller.teleport = position => { log.teleports.push(['x', 'y', 'z'].map(a => formatNumber(position[a])).join(':')); return teleport(position); };
  controller.teleport({ x: 0.5, y: 4, z: 0.5 });
  log.teleports.length = 0;
  const profile = { player: { id: 'p1', displayName: 'player1' } };
  const service = new ChatService({ profile, controller, broadcast: message => log.broadcasts.push(message.id) });
  const delivered = [];
  service.subscribe(message => delivered.push([message.id, message.kind, message.senderId, message.senderName, message.text, message.recipientId]));
  return { world, controller, service, log, delivered };
}

export function applyOp(ctx, op) {
  const [name, value] = op;
  ctx.delivered.length = 0; ctx.log.gives.length = 0; ctx.log.teleports.length = 0; ctx.log.broadcasts.length = 0;
  if (name === 'submit') return ctx.service.submit(value);
  if (name === 'completions') return ctx.service.completions(value);
  if (name === 'deliver') return ctx.service.deliver(value[0], { broadcast: value[1] });
  if (name === 'configure') { const r = ctx.controller.configure(value[0], Number(value[1])); return r.ok ? 'ok' : r.error; }
  throw new Error(`unknown op ${name}`);
}

export function stateRow(ctx) {
  const c = ctx.controller, s = c.settings;
  return [['speed', 'reach', 'jump', 'size', 'falldamage'].map(k => formatNumber(s[k])), formatNumber(c.jumpLaunchVelocity), c.gameMode, c.developerMode,
    ['x', 'y', 'z'].map(a => formatNumber(c.player[a])), ctx.log.gives, ctx.log.teleports, ctx.log.broadcasts, ctx.service.messages.length];
}

const NUMBERS = ['0', '1', '2', '4', '4.5', '5', '6', '10', '100', '255', '256', '0.1', '0.05', '0.099999', '3.99999', '4.00001', '-1', '-0', '+5', '.5', '5.', '1e2', '1E2', '1e+2', '1e-2', '1e3', '1e308', '1e309', '1e400',
  'abc', '', 'NaN', 'Infinity', '-Infinity', '0x10', '1,5', '1_000', '5e', 'e5', '--5', '1.2.3', '12345678.5', '0.1234567891', '254.99999999', '1.252203352512', '4.317180616740089', 'default', 'DEFAULT', 'Default'];
const ITEM_IDS = ['stone', 'oak.planks', 'stick', 'stone.pickaxe', 'water.bucket', 'iron.ingot', 'nope', 'STONE', 'oak.door', 'raw.porkchop'];
const AMOUNTS = ['1', '5', '64', '65', '100', '999999', '99999999999999999999999', '0', '00', '007', '+3', '-2', '1.5', '2x', '1e3', '', ' '];

function randomInput(rand) {
  const pick = list => list[Math.floor(rand() * list.length)];
  const space = () => pick([' ', ' ', ' ', '  ', '\t', ch(0xA0), ' \t ']);
  const r = rand();
  const setting = pick(['/speed', '/reach', '/jump', '/size', '/falldamage']);
  if (r < 0.34) return `${rand() < 0.1 ? setting.toUpperCase() : setting}${space()}${pick(NUMBERS)}`;
  if (r < 0.40) return `${setting}${rand() < 0.5 ? '' : space()}${rand() < 0.5 ? '' : `${pick(NUMBERS)}${space()}${pick(NUMBERS)}`}`;
  if (r < 0.50) return `/tp${space()}${[0, 1, 2].map(() => pick(['~', '~1', '~-2.5', '0', '10', '-3.5', '1e2', '~1e400', '1e400', 'x', '~~', '+4', '.5', '5.', '~.5', '~+1'])).join(pick([' ', '  ', ', ', ',', ' , ', '\t']))}`;
  if (r < 0.56) return `/tp${pick(['', ' ', ' 1 2', ' 1 2 3 4', ' a b c', ' ~ ~ ~', ' 1,2', ' 1,2,3', ' 1 ,2 ,3', ' 1,, 2,3'])}`;
  if (r < 0.66) return `/give${space()}${pick(ITEM_IDS)}${rand() < 0.15 ? '' : `${space()}${pick(AMOUNTS)}`}${rand() < 0.1 ? ' extra' : ''}`;
  if (r < 0.70) return `/gamemode${space()}${pick(['survival', 'creative', 'Creative', 'SURVIVAL', 'adventure', '', 'creative x'])}`;
  if (r < 0.76) return pick(['/devmode', '/devmode', '/devmode now', '/DEVMODE']);
  if (r < 0.82) return pick(['/default', '/default x', '/help', '/HELP', '/help me', '/foo', '/', '/ ', '/speed', '/tp', '/give', '/gamemode', '//speed 5', '/spe ed 5']);
  if (r < 0.88) return pick(['hello', 'Hello world', ' spaced out ', 'x', 'a'.repeat(300), '/ speed 5', '~/speed 5', 'speed 5']);
  if (r < 0.93) return pick(['   ', '', '\t', ch(0xA0), '  /help  ', `${ch(0xFEFF)}/help`, '\n/help']);
  return `${setting} ${pick(['default', 'DEFAULT', 'default x', 'defaults'])}`;
}

const COMPLETION_INPUTS = ['/', '/s', '/sp', '/speed', '/speed ', '/speed d', '/speed de', '/speed x', '/speed default', '/speed default ', '/size ', '/gamemode ', '/gamemode s', '/gamemode c', '/gamemode x', '/gamemode creative ', '/tp ', '/tp ~', '/tp ~ ~ ~',
  '/give ', '/give s', '/give stone', '/give stone ', '/give oak.', '/give OAK', '/give zzz', '/g', '/ga', '/d', '/de', '/h', '/H', '/HELP', '/falldamage d', '/reach ', '/jump def', '/jump default', '/default ', '/devmode ', '/e', '/q', 'hello', '', ' ', '/ ', '/speed  d', '/speed\td', `/speed${ch(0xA0)}d`, '/speed d\nx', '/spe\nd', '/give  s'];

const DIRECTED = [
  '/help', '/speed 6', '/speed default', '/size 2', '/speed 6', '/reach 10', '/jump 3', '/size 0.5', '/default', '/devmode', '/speed 1000', '/size 0.01', '/size 1e300', '/size 1e-300', '/jump 1e300', '/reach 1e300', '/speed 1e308', '/size 1e308', '/default',
  '/gamemode creative', '/reach default', '/gamemode survival', '/reach default', '/tp 5 6 7', '/tp ~ ~1 ~-1', '/tp ~1e400 0 0', '/size 3', '/tp 0.5 4 0.5', '/size 2', '/size 1', '/give stone 5', '/give stone 99999999999999999999999', '/give stone.pickaxe 1', '/give nope', '/give stone 0', '/give stone +7',
  '/falldamage 0', '/falldamage 2.5', '/falldamage default', '/jump 0', '/jump 1.252203352512', '/jump 7', '/speed 0', '/speed -0', '/speed default', '/devmode', '/devmode', 'plain chat', '/unknown',
];

export function commandRows() {
  const rows = [];
  const run = (prefix, ops) => {
    const ctx = makeCommandWorld();
    ops.forEach((op, step) => {
      const ret = applyOp(ctx, op);
      rows.push(`${prefix}\t${step}\t${cell(op)}\t${cell(ret)}\t${cell(ctx.delivered)}\t${cell(stateRow(ctx))}`);
    });
  };
  for (const seed of [12, 144, 1728]) { const rand = lcg(seed); run(String(seed), Array.from({ length: 300 }, () => ['submit', randomInput(rand)])); }
  run('directed', DIRECTED.map(text => ['submit', text]));
  run('limits', [...[
    '/speed 255', '/speed 255.0000001', '/reach 255', '/jump 255', '/falldamage 255', '/size 4', '/size 4.0000001', '/size 0.1', '/size 0.0999999', '/speed 0', '/reach 0', '/jump 0', '/falldamage 0', '/size 0',
    '/gamemode creative', '/reach 7', '/default', '/reach default', '/gamemode survival', '/default', '/reach 9', '/gamemode creative', '/gamemode survival', '/reach default',
    '/tp ~~~', '/tp 1~2~3', '/tp ~1~2~3', '/tp 1 2~3', '/tp ~ ~', '/tp 1 2 3 ', '/tp  ~1   ~2\t~3', '/tp 5., .5, 5.e1', '/tp 1e2 +1e+2 -1E-2', '/tp ~1e2 ~-1E-2 ~+.5e1',
    '/size 2', '/tp 0.5 6 0.5', '/size 0.5', '/size 4', '/size 1', '/devmode', '/size 1e300', '/default', '/tp 5.5 4 5.5', '/size 1', '/jump default', '/tp 5.5 1e308 5.5', '/jump 1e308', '/jump 1e307', '/speed 1e308', '/reach 1e308', '/size 1.5', '/jump default', '/tp 5.5 4 5.5', '/default',
  ].map(text => ['submit', text]),
    ...[['size', '0'], ['size', '-0'], ['size', '1e-320'], ['size', 'NaN'], ['size', 'Infinity'], ['size', '4'], ['speed', '-0'], ['speed', '-1'], ['speed', 'NaN'], ['speed', '1e308'], ['reach', 'Infinity'], ['jump', '1e308'],
      ['jump', '0'], ['falldamage', '-0'], ['falldamage', '-0.5'], ['nonsense', '1'], ['size', '1.000000001'], ['size', '1']].map(args => ['configure', args])]);
  run('completions', COMPLETION_INPUTS.map(text => ['completions', text]));
  run('delivery', [
    ['deliver', [{ senderId: 'p2', senderName: 'bob', text: 'hi', kind: 'chat', recipientId: null }, false]],
    ['deliver', [{ senderId: 'p2', senderName: 'bob', text: 'secret', kind: 'chat', recipientId: 'p9' }, true]],
    ['deliver', [{ senderId: 'p2', senderName: 'bob', text: 'for you', kind: 'chat', recipientId: 'p1' }, true]],
    ['deliver', [{ senderId: 'p2', senderName: 'bob', text: 'public', kind: 'chat', recipientId: null }, true]],
    ...Array.from({ length: 110 }, (_, i) => ['submit', `message ${i}`]),
    ['submit', '/help'], ['submit', '  trimmed  '], ['submit', '   '],
  ]);
  return rows;
}

export function generateCommands(outDir) {
  const dir = join(outDir, 'chat');
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'commands.tsv'), ['seed\tstep\top\tret\tdelivered\tstate', ...commandRows()].join('\n') + '\n');
}
