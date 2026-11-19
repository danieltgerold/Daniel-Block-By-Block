import test from 'node:test';
import assert from 'node:assert/strict';
import { currentFixtures, replayFixture } from '../tools/golden/current-fixtures.mjs';

test('current movement fixtures exercise supported terrain and their named modes', () => {
  const fixtures = currentFixtures();
  const replay = name => replayFixture(fixtures.find(fixture => fixture.name === name));
  const walk = replay('walk');
  assert.ok(walk.every(state => state.y === 4 && state.grounded));
  assert.ok(Math.abs(walk.at(-1).speed - 4.3171806167) < 1e-8);
  const jumps = replay('sprint-jump');
  assert.ok(jumps.some(state => state.y > 5 && !state.grounded));
  assert.ok(jumps.at(-1).jumpCount > 5);
  const crouch = replay('crouch');
  assert.ok(crouch.slice(0, 80).every(state => state.crouching));
  assert.ok(crouch.slice(80).every(state => !state.crouching));
  assert.ok(crouch[79].speed < walk[79].speed);
  const flight = replay('flight');
  assert.ok(flight.slice(0, 100).every(state => state.flying));
  assert.ok(flight.slice(100).every(state => !state.flying));
  assert.ok(flight.some(state => state.y > 6));
  const permission = replay('sprint-permission');
  assert.ok(permission.slice(0, 80).every(state => !state.sprinting));
  assert.ok(permission.slice(80).every(state => state.sprinting));
  assert.ok(replay('water').some(state => state.inWater));
});

test('fixture replay rejects empty, unsupported and obstructed starting states', () => {
  const fixture = currentFixtures()[0];
  assert.throws(() => replayFixture({ ...fixture, inputs: [] }), /contain inputs/);
  assert.throws(() => replayFixture({ ...fixture, initial: { ...fixture.initial, y: 5 } }), /unsupported spawn/);
  assert.throws(() => replayFixture({ ...fixture, edits: [{ x: 0, y: 4, z: 0, id: 'stone' }] }), /obstructed spawn/);
});
