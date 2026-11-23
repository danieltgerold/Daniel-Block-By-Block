// Records the player-name rules and the player directory on the JS: which names are accepted and why the others are
// not, and how joining and renaming stay unique case-insensitively. Cells are JSON-encoded so any character survives.
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { PlayerDirectory, validateName } from '../../src/chat.js';

const lcg = seed => () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
export const cell = value => JSON.stringify(value ?? null);
const resultText = r => r.ok ? `ok:${r.name ?? r.player?.displayName ?? ''}` : `err:${r.error}`;

const NAMES = ['', ' ', 'a', 'Steve', 'steve', 'STEVE', 'Alex1', 'player1', 'Player1', 'PLAYER1', 'player2', '1234567890123456', '12345678901234567', 'abcdefghijklmnop', 'abcdefghijklmnopq',
  'two words', ' lead', 'trail ', 'tab\there', 'new\nline', 'nb sp', ' em', 'zero​width', 'café', 'naïve', 'Über', 'under_score', 'dash-ed', 'dot.ted', 'emoji😀', 'server', 'Server', 'SERVER',
  'sErVeR', 'server1', 'Servers', ' server ', 'ser ver', 'ſandy', 'KKKK', 'x'.repeat(16), 'x'.repeat(17), 'x'.repeat(100), '﻿bom', 'a b', 'a\u0085b', 'a᠎b', 'ABC123xyz', '0', 'O0o0', null, undefined, 42, {}, []];

// One name per JS whitespace character, plus look-alikes that are not whitespace, built from character codes.
const ch = code => String.fromCharCode(code);
const SPACE_CODES = [0x09, 0x0A, 0x0B, 0x0C, 0x0D, 0x20, 0xA0, 0x1680, 0x2000, 0x2001, 0x2002, 0x2003, 0x2004, 0x2005, 0x2006, 0x2007, 0x2008, 0x2009, 0x200A, 0x2028, 0x2029, 0x202F, 0x205F, 0x3000, 0xFEFF];
const NOT_SPACE_CODES = [0x00, 0x08, 0x0E, 0x1F, 0x85, 0x180E, 0x200B, 0x200C, 0x200D, 0x2060, 0x3001, 0xFFFE];
for (const code of SPACE_CODES) NAMES.push(`mid${ch(code)}dle`, `${ch(code)}lead`, `trail${ch(code)}`, ch(code));
for (const code of NOT_SPACE_CODES) NAMES.push(`mid${ch(code)}dle`, `${ch(code)}lead`, `trail${ch(code)}`);

export function nameRows() {
  return NAMES.map(value => `${cell(value === undefined ? '__undefined__' : value)}\t${resultText(validateName(value))}`);
}

function directoryOps(rand) {
  const pick = list => list[Math.floor(rand() * list.length)];
  const ids = ['p1', 'p2', 'p3', 'p4', 'p5', '', 'system:server'];
  const names = ['Steve', 'steve', 'Alex', 'alex', 'player1', 'player2', 'Player3', 'server', 'Server', 'bad name', '', 'x'.repeat(17), 'Ünï', 'Zed'];
  const ops = [];
  for (let i = 0; i < 250; i++) {
    const r = rand();
    if (r < 0.40) ops.push(['join', pick(ids), rand() < 0.35 ? null : pick(names)]);
    else if (r < 0.70) ops.push(['rename', pick(ids), pick(names)]);
    else if (r < 0.85) ops.push(['available', pick(names), rand() < 0.5 ? null : pick(ids)]);
    else ops.push(['next']);
  }
  return ops;
}

export function directoryRows() {
  const rows = [];
  for (const seed of [4, 40, 404]) {
    const dir = new PlayerDirectory();
    directoryOps(lcg(seed)).forEach((op, step) => {
      const [name, a, b] = op;
      let ret;
      if (name === 'join') ret = resultText(dir.join(a, b));
      else if (name === 'rename') ret = resultText(dir.rename(a, b));
      else if (name === 'available') ret = String(dir.available(a, b));
      else ret = dir.nextDefaultName();
      const players = [...dir.players.values()].map(p => `${p.id}=${p.displayName}`);
      rows.push(`${seed}\t${step}\t${cell(op)}\t${cell(ret)}\t${cell(players)}`);
    });
  }
  return rows;
}

export function generateChatNames(outDir) {
  const dir = join(outDir, 'chat');
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'names.tsv'), ['input\tresult', ...nameRows()].join('\n') + '\n');
  writeFileSync(join(dir, 'directory.tsv'), ['seed\tstep\top\tret\tplayers', ...directoryRows()].join('\n') + '\n');
}
