import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { VoxelWorld } from '../../src/voxel-world.js';
import { createPlayer, stepPlayer } from '../../src/movement.js';
import { formatNumber } from './format.mjs';

// These contracts describe the current game, independently of the historical
// three-layer suites. Optional input values are materialized for Java replay.
export const INPUT_FIELDS = ['forward', 'right', 'jump', 'sprint', 'yaw', 'walkSpeedScale',
  'jumpVelocity', 'size', 'crouch', 'canFly', 'toggleFlight', 'canSprint'];
export const STATE_FIELDS = ['x', 'y', 'z', 'vx', 'vy', 'vz', 'fovMultiplier', 'speed',
  'grounded', 'sprinting', 'jumpCount', 'jumpCooldown', 'size', 'crouching', 'eyeOffset',
  'flying', 'inWater', 'fallDistance', 'landingFallDistance', 'damageFallDistance', 'landingDamageDistance'];
const options = { baseY: 0, layers: ['bedrock', 'dirt', 'dirt', 'grass.block'] };
const initial = { x: .5, y: 4, z: .5 };
const input = changes => ({ forward: 1, right: 0, jump: false, sprint: false,
  yaw: 0, walkSpeedScale: 1, jumpVelocity: .42, size: 1, crouch: false,
  canFly: false, toggleFlight: false, canSprint: true, ...changes });

export function currentFixtures() {
  const fixture = (name, change, edits = []) => ({ name, world: options,
    initial, edits, inputs: Array.from({ length: 160 }, (_, tick) => input(change(tick))) });
  return [
    fixture('walk', () => ({})),
    fixture('sprint-jump', () => ({ sprint: true, jump: true })),
    fixture('crouch', tick => ({ crouch: tick < 80 })),
    fixture('flight', tick => ({ canFly: true, toggleFlight: tick === 0 || tick === 100,
      jump: tick < 40, crouch: tick >= 40 && tick < 60 })),
    fixture('sprint-permission', tick => ({ sprint: true, canSprint: tick >= 80 })),
    fixture('water', () => ({ forward: 0, jump: true }), [
      { x: 0, y: 4, z: 0, id: 'water', state: { level: 0, falling: false } },
      { x: 0, y: 5, z: 0, id: 'water', state: { level: 0, falling: false } },
    ]),
    fixture('flowing-water', () => ({ forward: 0, right: 1 }), [
      { x: 0, y: 4, z: 0, id: 'water', state: { level: 0, falling: false } },
      { x: 1, y: 4, z: 0, id: 'water', state: { level: 3, falling: false } },
    ]),
    fixture('falling-water', () => ({ forward: 0, right: 1 }), [
      { x: 0, y: 4, z: 0, id: 'water', state: { level: 0, falling: true } },
      { x: 0, y: 5, z: 0, id: 'water', state: { level: 0, falling: true } },
      ...Array.from({ length: 6 }, (_, y) => ({ x: 1, y, z: 0, id: 'water', state: { level: 0, falling: true } })),
    ]),
    fixture('step-slab', () => ({}), [
      { x: 0, y: 4, z: -2, id: 'oak.slab', state: { type: 'bottom' } },
    ]),
    fixture('crouch-ledge', () => ({ crouch: true }),
      Array.from({ length: 56 }, (_, i) => ({ x: i % 7 - 3, y: Math.floor(i / 14),
        z: -3 - Math.floor(i % 14 / 7), id: null, state: {} }))),
  ];
}

export function replayFixture(fixture) {
  assert.ok(fixture.inputs.length > 0, 'fixture must contain inputs');
  const world = new VoxelWorld(fixture.world);
  for (const edit of fixture.edits) world.setBlock(edit.x, edit.y, edit.z, edit.id, edit.state);
  const player = { ...createPlayer(), ...fixture.initial };
  assert.ok(!world.intersectsPlayer(player), `${fixture.name}: obstructed spawn`);
  assert.ok(world.isSupported(player), `${fixture.name}: unsupported spawn`);
  const states = [];
  for (const row of fixture.inputs) {
    assert.ok(row.size > 0 && Number.isFinite(row.size), 'invalid player size');
    if (row.size !== player.size) {
      assert.ok(!world.intersectsPlayer(player, row.size), 'invalid resize');
      player.size = row.size;
    }
    stepPlayer(player, row, world);
    states.push(Object.fromEntries(STATE_FIELDS.map(field => [field, player[field]])));
  }
  return states;
}

const csvValue = value => typeof value === 'boolean' ? Number(value) : formatNumber(value);
function writeTable(dir, name, fields, rows) {
  assert.ok(rows.length > 0, `${name}: empty trace`);
  for (const row of rows) for (const field of fields)
    assert.ok(typeof row[field] === 'boolean' || typeof row[field] === 'number', `${name}: missing ${field}`);
  writeFileSync(join(dir, name), [fields.join(','),
    ...rows.map(row => fields.map(field => csvValue(row[field])).join(','))].join('\n') + '\n');
}

export function generateCurrent(outDir) {
  for (const fixture of currentFixtures()) {
    const dir = join(outDir, 'current', 'movement', fixture.name);
    const states = replayFixture(fixture);
    mkdirSync(dir, { recursive: true });
    const { name, world, initial, edits } = fixture;
    writeFileSync(join(dir, 'fixture.json'), JSON.stringify({ formatVersion: 1, name,
      world, initial, edits, ticks: states.length,
      schedule: 'stepPlayer only; world simulation does not tick' }, null, 2) + '\n');
    writeFileSync(join(dir, 'fixture.csv'), 'baseY,layers,x,y,z,ticks\n' +
      [world.baseY, world.layers.join('|'), initial.x, initial.y, initial.z, states.length].join(',') + '\n');
    writeFileSync(join(dir, 'edits.csv'), 'x,y,z,id,type,facing,half,stairShape,hinge,open,level,falling\n' +
      edits.map(e => [e.x, e.y, e.z, e.id ?? '', e.state.type ?? '', e.state.facing ?? '',
        e.state.half ?? '', e.state.shape ?? '', e.state.hinge ?? '', Number(e.state.open ?? false),
        e.state.level ?? 0, Number(e.state.falling ?? false)].join(',')).join('\n') + (edits.length ? '\n' : ''));
    writeTable(dir, 'inputs.csv', INPUT_FIELDS, fixture.inputs);
    writeTable(dir, 'expected.csv', STATE_FIELDS, states);
  }
}
