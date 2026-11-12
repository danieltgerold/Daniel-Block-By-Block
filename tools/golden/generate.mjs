// Records bit-exact reference traces from the JS rule code (src/movement.js,
// src/voxel-world.js). The Java core must reproduce every value in them, on
// the JVM and as TeaVM-compiled JavaScript. Regenerate after merging main:
//   npm run golden            (writes tests/golden, leaves tests/golden/trig alone)
//   node tools/golden/generate.mjs <dir>
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createPlayer, stepPlayer, DEFAULT_WALK_SPEED } from '../../src/movement.js';
import { BLOCK_REACH, VoxelWorld } from '../../src/voxel-world.js';
import { jumpVelocityForHeight } from '../../src/player-settings.js';
import { formatBool, formatNumber } from './format.mjs';

const DEFAULT_OUT = new URL('../../tests/golden/', import.meta.url).pathname;

const EXPECTED_HEADER = 'x,y,z,vx,vy,vz,fovMultiplier,speed,grounded,sprinting,jumpCount,jumpCooldown';
const INPUT_HEADER = 'forward,right,jump,sprint,yaw,walkSpeedScale,jumpVelocity,size';

// Same LCG as the TeaVM spike, so traces stay comparable across regenerations.
function lcg(seed) {
  return () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
}

function courseEdits() {
  const edits = [];
  for (let x = -3; x <= 3; x++) for (let y = 0; y <= 1; y++) edits.push([x, y, -30, true]); // wall
  edits.push([2, 0, -10, true], [2, 1, -10, true], [0, 2, -40, true]); // pillar + low ceiling block
  for (let x = -1; x <= 1; x++) for (let y = -3; y <= -1; y++) edits.push([x, y, -50, false]); // pit through all layers
  for (let x = 5; x <= 7; x++) edits.push([x, 0, -20, true]); // step to jump onto
  return edits;
}

const input = (forward, right, jump, sprint, yaw, walkSpeedScale = 1, jumpVelocity, size = 1) =>
  ({ forward, right, jump, sprint, yaw, walkSpeedScale, jumpVelocity, size });

function obstacleCourseInputs() {
  const rand = lcg(12345);
  const inputs = [];
  let yaw = 0;
  for (let t = 0; t < 3000; t++) {
    let row;
    if (t < 400) row = input(1, 0, false, false, 0); // walk straight into the wall
    else if (t < 700) row = input(1, 0, true, true, 0.3); // sprint-jump at an angle
    else if (t === 2000) { yaw = 1234.5678 + rand(); row = input(1, 1, true, true, yaw); } // huge accumulated yaw
    else {
      yaw += (rand() - 0.5) * 0.4;
      if (t > 2000) yaw += 37.1; // keep yaw large and growing
      row = input(Math.floor(rand() * 3) - 1, Math.floor(rand() * 3) - 1, rand() < 0.3, rand() < 0.5, yaw);
    }
    // Ruling R1: scaled walk speed (developer /speed setting).
    if (t >= 1500 && t < 1800) row.walkSpeedScale = 10 / DEFAULT_WALK_SPEED;
    else if (t >= 1800 && t < 1900) row.walkSpeedScale = 0.25;
    // Ruling R12: scaled player size and custom jump settings.
    if (t >= 2400 && t < 2600) { row.size = 0.5; row.jumpVelocity = jumpVelocityForHeight(2) * 0.5; }
    else if (t >= 2600 && t < 2800) row.size = 1.75;
    else if (t >= 2800) row.jumpVelocity = 0;
    inputs.push(row);
  }
  return inputs;
}

// The controller always passes walkSpeedScale and jumpVelocity; at default settings they are 1 and 0.42.
const steadyInputs = (sprint, jump) =>
  Array.from({ length: 1440 }, () => input(1, 0, jump, sprint, 0, 1, 0.42));

function farFlightInputs() {
  const rand = lcg(777);
  const inputs = [];
  let yaw = 0.7;
  for (let t = 0; t < 620; t++) {
    yaw += (rand() - 0.5) * 0.2;
    const scale = t < 600 ? 1000 ** Math.floor(t / 100) : 1e308; // 1 … 1e15, then overflow into the ±MAX_VALUE clamp
    inputs.push(input(1, Math.floor(rand() * 3) - 1, t % 40 === 0, true, yaw, scale));
  }
  return inputs;
}

function runMovement(edits, inputs) {
  const world = new VoxelWorld();
  for (const [x, y, z, solid] of edits) world.setBlock(x, y, z, solid);
  const player = { ...createPlayer(), x: 0.5, y: 0, z: 0.5 };
  const rows = [];
  for (const row of inputs) {
    // Mirrors MovementController.set: a resize that would intersect blocks is refused.
    if (row.size !== player.size && world.intersectsPlayer(player, row.size)) row.size = player.size;
    player.size = row.size;
    const step = { forward: row.forward, right: row.right, jump: row.jump, sprint: row.sprint,
      yaw: row.yaw, walkSpeedScale: row.walkSpeedScale };
    if (row.jumpVelocity !== undefined) step.jumpVelocity = row.jumpVelocity;
    stepPlayer(player, step, world);
    rows.push([player.x, player.y, player.z, player.vx, player.vy, player.vz, player.fovMultiplier, player.speed]
      .map(formatNumber)
      .concat(formatBool(player.grounded), formatBool(player.sprinting), String(player.jumpCount), String(player.jumpCooldown))
      .join(','));
  }
  return rows;
}

const formatInput = r => [formatNumber(r.forward), formatNumber(r.right), formatBool(r.jump), formatBool(r.sprint),
  formatNumber(r.yaw), formatNumber(r.walkSpeedScale), r.jumpVelocity === undefined ? '' : formatNumber(r.jumpVelocity),
  formatNumber(r.size)].join(',');
const formatEdit = ([x, y, z, solid]) => `${x},${y},${z},${formatBool(solid)}`;

function raycastCases() {
  const rand = lcg(99);
  const cases = [];
  for (let i = 0; i < 2000; i++) {
    const o = [rand() * 40 - 20, rand() * 40 - 20, rand() * 40 - 20];
    const d = [rand() * 2 - 1, rand() * 2 - 1, rand() * 2 - 1];
    cases.push([...o, ...d, rand() < 0.5 ? BLOCK_REACH : rand() * 48]);
  }
  for (const axis of [0, 1, 2]) for (const sign of [1, -1]) {
    const d = [0, 0, 0];
    d[axis] = sign;
    cases.push([0.5, 0.5, 0.5, ...d, 48]);
  }
  cases.push([0.5, 0.5, 0.5, 0, 0, 0, BLOCK_REACH]); // zero direction
  cases.push([0.5, 0.5, -28.5, 0, 0, -1, 0]); // reach 0
  cases.push([0.5, 0.5, -28.5, 0, 0, -1, -1]); // negative reach
  cases.push([0.5, 0.5, -24.5, 0, 0, -1, BLOCK_REACH]); // wall face exactly 4.5 away
  cases.push([1e15, -1.5, 0.5, 1, 0, 0, BLOCK_REACH]); // huge origin inside base terrain
  cases.push([0.5, 0, 0.5, 0, -1, 0, BLOCK_REACH]); // origin exactly on the surface, looking down
  cases.push([0.5, -1.5, 0.5, 0.3, 0.2, -0.9, BLOCK_REACH]); // origin inside base terrain
  cases.push([0.2, -2, -49.5, 0, -1, 0, 48]); // down through the removed pit
  return cases;
}

function runRaycast(edits, cases) {
  const world = new VoxelWorld();
  for (const [x, y, z, solid] of edits) world.setBlock(x, y, z, solid);
  return cases.map(([ox, oy, oz, dx, dy, dz, reach]) => {
    const hit = world.raycast({ x: ox, y: oy, z: oz }, { x: dx, y: dy, z: dz }, reach);
    if (!hit) return '0,0,0,0,0,0,0,0';
    return ['1', formatNumber(hit.x), formatNumber(hit.y), formatNumber(hit.z),
      formatNumber(hit.normal.x), formatNumber(hit.normal.y), formatNumber(hit.normal.z), formatNumber(hit.distance)].join(',');
  });
}

function writeCsv(dir, name, header, rows) {
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, name), [header, ...rows].join('\n') + '\n');
}

export function generate(outDir = DEFAULT_OUT) {
  const course = courseEdits();
  const scenarios = {
    'obstacle-course': [course, obstacleCourseInputs()],
    walk: [[], steadyInputs(false, false)],
    sprint: [[], steadyInputs(true, false)],
    'sprint-jump': [[], steadyInputs(true, true)],
    'far-flight': [course, farFlightInputs()],
  };
  for (const [name, [edits, inputs]] of Object.entries(scenarios)) {
    const dir = join(outDir, 'movement', name);
    const expected = runMovement(edits, inputs); // may refuse resizes, so run before writing inputs
    writeCsv(dir, 'edits.csv', 'x,y,z,solid', edits.map(formatEdit));
    writeCsv(dir, 'inputs.csv', INPUT_HEADER, inputs.map(formatInput));
    writeCsv(dir, 'expected.csv', EXPECTED_HEADER, expected);
  }
  const rayEdits = [...course];
  for (let x = -5; x <= -3; x++) for (let y = -6; y <= -4; y++) for (let z = 2; z <= 4; z++) rayEdits.push([x, y, z, true]);
  const cases = raycastCases();
  const dir = join(outDir, 'raycast');
  writeCsv(dir, 'edits.csv', 'x,y,z,solid', rayEdits.map(formatEdit));
  writeCsv(dir, 'cases.csv', 'ox,oy,oz,dx,dy,dz,reach', cases.map(c => c.map(formatNumber).join(',')));
  writeCsv(dir, 'expected.csv', 'hit,x,y,z,nx,ny,nz,distance', runRaycast(rayEdits, cases));
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) generate(process.argv[2] ?? DEFAULT_OUT);
