import test from 'node:test';
import assert from 'node:assert/strict';
import { MovementController, MOVEMENT, createPlayer, stepPlayer } from '../src/movement.js';
import { VoxelWorld } from '../src/voxel-world.js';

function near(actual, expected, tolerance = 1e-9) {
  assert.ok(Math.abs(actual - expected) <= tolerance, `Expected ${expected}, measured ${actual}`);
}

function advance(controller, seconds, pattern = [1 / 60], input = {}) {
  let elapsed = 0;
  let frame = 0;
  while (elapsed < seconds) {
    const dt = Math.min(pattern[frame++ % pattern.length], seconds - elapsed);
    controller.update(dt, input);
    elapsed += dt;
  }
}
const tick = (controller, input = {}) => controller.update(MOVEMENT.fixedStep, input);

function movingController(mode) {
  const controller = new MovementController(new VoxelWorld());
  controller.keyDown('KeyW');
  if (mode !== 'walk') controller.keyDown('KeyR');
  if (mode === 'sprintJump') controller.keyDown('Space');
  return controller;
}

const framePatterns = [
  ...[5, 15, 30, 60, 120, 144, 240].map(fps => [`${fps} FPS`, [1 / fps]]),
  ['uneven frames', [1 / 24, 1 / 165, 1 / 42, 1 / 80, 1 / 200]],
];
const expectedSpeeds = { walk: 4.317180616740089, sprint: 5.612334801762115, sprintJump: 7.126765405142745 };
const measurements = [];
for (const [label, pattern] of framePatterns) {
  test(`actual controller measurements at ${label}`, () => {
    const result = { frames: label };
    for (const mode of ['walk', 'sprint', 'sprintJump']) {
      const controller = movingController(mode);
      advance(controller, 12, pattern); // Settle; 20 complete jump cycles.
      const start = { ...controller.player };
      advance(controller, 60, pattern); // Exactly 100 complete jump cycles.
      const p = controller.player;
      const speed = Math.hypot(p.x - start.x, p.z - start.z) / 60;
      near(speed, expectedSpeeds[mode]);
      assert.equal(controller.totalSteps, 1440);
      result[`${mode}_blocks_s`] = +speed.toFixed(6);
      if (mode === 'sprintJump') {
        near(p.lastJump.height, 1.252203352512);
        near(p.lastJump.airtime, 0.60);
        assert.equal(p.lastJump.ticks, 12);
        assert.equal(p.jumpCount - start.jumpCount, 100);
        assert.equal(p.sprintImpulseCount - start.sprintImpulseCount, 100);
        assert.equal(p.jumpCount, p.sprintImpulseCount);
        result.apex_blocks = +p.lastJump.height.toFixed(6);
        result.airtime_ticks = p.lastJump.ticks;
      }
    }
    measurements.push(result);
  });
}

test('tick order: sprint takeoff gets one yaw-only boost, ground acceleration and ground drag', () => {
  const player = createPlayer();
  player.vx = 0.1;
  player.vz = 0.3;
  stepPlayer(player, { forward: 1, sprint: true, jump: true, yaw: Math.PI / 2 });
  near(player.x, 0.1 - 0.20 - 0.1274);
  near(player.z, 0.3);
  near(player.vx, (0.1 - 0.20 - 0.1274) * 0.546);
  near(player.vz, 0.3 * 0.546);
  near(player.y, 0.42);
  near(player.vy, (0.42 - 0.08) * 0.98);
  assert.equal(player.grounded, false);
  assert.equal(player.sprintImpulseCount, 1);
  const before = { ...player };
  stepPlayer(player, { forward: 1, jump: true, yaw: Math.PI / 2 });
  near(player.x - before.x, before.vx - 0.02548);
  near(player.z - before.z, before.vz);
  near(player.vx, (before.vx - 0.02548) * 0.91);
  assert.equal(player.sprintImpulseCount, 1, 'No second boost in the air');
  assert.equal(player.sprinting, true, 'Sprint persists after R release');
});

test('diagonal sprint takeoff impulse follows yaw, not the diagonal movement direction', () => {
  const player = createPlayer();
  stepPlayer(player, { forward: 1, right: 1, sprint: true, jump: true, yaw: 0 });
  const component = 0.1274 / 0.98 / Math.sqrt(2);
  near(player.x, component);
  near(player.z, -component - 0.20);
  assert.equal(player.sprintImpulseCount, 1);
});

test('landing uses air acceleration and air drag; next grounded tick uses ground values', () => {
  const player = createPlayer();
  Object.assign(player, { y: 0.01, vy: -0.1, vx: 0.3, vz: 0.1, grounded: false });
  stepPlayer(player, { forward: 1, sprint: true });
  near(player.x, 0.3);
  near(player.z, 0.1 - 0.02548);
  near(player.vx, 0.3 * 0.91);
  near(player.vz, (0.1 - 0.02548) * 0.91);
  assert.equal(player.grounded, true);
  near(player.y, 0);
  near(player.vy, 0);
  const before = { ...player };
  stepPlayer(player, { forward: 1 });
  near(player.z - before.z, before.vz - 0.1274);
  near(player.vz, (before.vz - 0.1274) * 0.546);
});

test('walking and sprinting jumps peak near 1.25 blocks and land on tick 12', () => {
  for (const sprint of [false, true]) {
    const controller = new MovementController();
    controller.keyDown('Space');
    if (sprint) { controller.keyDown('KeyW'); controller.keyDown('KeyR'); }
    for (let i = 1; i <= 11; i++) {
      tick(controller);
      assert.equal(controller.player.grounded, false);
      assert.equal(controller.player.jumpCount, 1);
    }
    tick(controller);
    assert.equal(controller.player.grounded, true);
    assert.equal(controller.player.lastJump.ticks, 12);
    near(controller.player.lastJump.height, 1.252203352512);
    near(controller.player.lastJump.airtime, 0.60);
    tick(controller);
    assert.equal(controller.player.jumpCount, 2, 'Held Space repeats at the next grounded tick');
    assert.equal(controller.player.sprintImpulseCount, sprint ? 2 : 0);
  }
});

test('ten-tick held-jump cooldown prevents early retrigger even after an early landing', () => {
  const player = createPlayer();
  stepPlayer(player, { jump: true }); // Takeoff at tick 1.
  assert.equal(player.jumpCooldown, 10);
  Object.assign(player, { y: 0.01, vy: -1 }); // Force early floor contact.
  for (let i = 2; i <= 10; i++) stepPlayer(player, { jump: true });
  assert.equal(player.jumpCount, 1);
  assert.equal(player.jumpCooldown, 1);
  stepPlayer(player, { jump: true }); // Ten ticks since first takeoff.
  assert.equal(player.jumpCount, 2);
});

test('releasing Space resets Java repeat delay, and an airborne press cannot double jump', () => {
  const player = createPlayer();
  stepPlayer(player, { jump: true });
  stepPlayer(player, { jump: false });
  assert.equal(player.jumpCooldown, 0);
  const vy = player.vy;
  stepPlayer(player, { jump: true });
  near(player.vy, (vy - 0.08) * 0.98);
  assert.equal(player.jumpCount, 1);
});

test('turning changes new acceleration without rotating carried momentum', () => {
  const player = createPlayer();
  player.vz = -0.2;
  stepPlayer(player, { forward: 1, yaw: Math.PI / 2 });
  near(player.x, -0.098);
  near(player.z, -0.2);
  const before = { ...player };
  stepPlayer(player, { yaw: Math.PI }); // Looking around with no input.
  near(player.x - before.x, before.vx);
  near(player.z - before.z, before.vz);
});

test('WASD axes and yaw use the expected world directions', () => {
  for (const [yaw, forward, right, dx, dz] of [
    [0, 1, 0, 0, -0.098], [0, -1, 0, 0, 0.098],
    [0, 0, 1, 0.098, 0], [0, 0, -1, -0.098, 0],
    [Math.PI / 2, 1, 0, -0.098, 0], [Math.PI / 2, 0, 1, 0, -0.098],
  ]) {
    const player = createPlayer();
    stepPlayer(player, { yaw, forward, right });
    near(player.x, dx);
    near(player.z, dz);
  }
});

test('diagonals are normalized with the requested 1/0.98 adjustment on ground and in air', () => {
  for (const airborne of [false, true]) {
    for (const sprint of [false, true]) {
      const straight = createPlayer();
      const diagonal = createPlayer();
      if (airborne) {
        Object.assign(straight, { grounded: false, y: 10 });
        Object.assign(diagonal, { grounded: false, y: 10 });
      }
      stepPlayer(straight, { forward: 1, sprint });
      stepPlayer(diagonal, { forward: 1, right: 1, sprint });
      near(diagonal.speed, straight.speed / 0.98);
      near(diagonal.x, -diagonal.z);
    }
  }
});

test('R starts a forward sprint; release keeps it active through flight and landing', () => {
  const controller = new MovementController();
  controller.keyDown('KeyR');
  tick(controller);
  assert.equal(controller.player.sprinting, false, 'Shift alone cannot sprint');
  controller.keyDown('KeyW');
  tick(controller);
  assert.equal(controller.player.sprinting, true);
  controller.keyUp('KeyR');
  controller.keyDown('Space');
  for (let i = 0; i < 25; i++) {
    tick(controller);
    assert.equal(controller.player.sprinting, true);
  }
  controller.keyUp('KeyW');
  assert.equal(controller.player.sprinting, false);
  tick(controller);
  assert.equal(controller.player.sprinting, false);
});

test('R pressed after W starts sprint, Right Shift does not, and opposing input stops it', () => {
  const controller = new MovementController();
  controller.keyDown('KeyW');
  controller.keyDown('ShiftRight');
  tick(controller);
  assert.equal(controller.player.sprinting, false);
  controller.keyDown('KeyR');
  tick(controller);
  assert.equal(controller.player.sprinting, true);
  controller.keyDown('KeyS');
  assert.equal(controller.player.sprinting, false);
  tick(controller);
  assert.equal(controller.player.sprinting, false);
});

for (const gap of [0, 7, 8]) {
  test(`double W press with ${gap}-tick gap respects the seven-tick window`, () => {
    const controller = new MovementController();
    controller.keyDown('KeyW');
    controller.keyUp('KeyW');
    for (let i = 0; i < gap; i++) tick(controller);
    controller.keyDown('KeyW');
    tick(controller);
    assert.equal(controller.player.sprinting, gap <= 7);
    if (gap <= 7) {
      tick(controller);
      assert.equal(controller.player.sprinting, true);
    }
  });
}

test('auto-repeat and duplicate keydown cannot start sprint or refresh the double-tap timer', () => {
  const controller = new MovementController();
  controller.keyDown('KeyW');
  for (let i = 0; i < 8; i++) {
    controller.keyDown('KeyW', true);
    controller.keyDown('KeyW', false);
    tick(controller);
    assert.equal(controller.player.sprinting, false);
  }
  controller.keyUp('KeyW');
  controller.keyDown('KeyW');
  tick(controller);
  assert.equal(controller.player.sprinting, false);
});

test('pause clears held keys, sprint, tap history and FOV without moving the player', () => {
  const controller = movingController('sprintJump');
  tick(controller);
  const before = { ...controller.player };
  controller.pause();
  assert.equal(controller.heldKeys.size, 0);
  assert.equal(controller.player.sprinting, false);
  near(controller.player.fovMultiplier, 1);
  near(controller.player.speed, 0);
  near(controller.player.vx, 0);
  near(controller.player.vz, 0);
  near(controller.renderState().x, before.x);
  near(controller.renderState().y, before.y);
  near(controller.renderState().z, before.z);
  controller.keyDown('KeyW');
  tick(controller);
  assert.equal(controller.player.sprinting, false, 'Tap history did not leak through focus loss');
  assert.equal(controller.player.jumpCount, 1, 'Jump is no longer held');
});

test('FOV moves halfway per physics tick and interpolates between ticks', () => {
  const controller = movingController('sprint');
  tick(controller);
  near(controller.player.fovMultiplier, 1.075);
  near(controller.renderState().fovMultiplier, 1);
  controller.update(0.025);
  near(controller.renderState().fovMultiplier, 1.0375);
  controller.update(0.025);
  near(controller.player.fovMultiplier, 1.1125);
  near(controller.renderState().fovMultiplier, 1.075);
  controller.keyUp('KeyR');
  tick(controller);
  near(controller.player.fovMultiplier, 1.13125);
  controller.keyUp('KeyW');
  tick(controller);
  near(controller.player.fovMultiplier, (1.13125 + 1) / 2);
});

test('FOV target stays tied to sprint state through repeated jump impulses', () => {
  const controller = movingController('sprintJump');
  for (let i = 1; i <= 48; i++) {
    tick(controller);
    if (i === 1) controller.keyUp('KeyR');
    near(controller.player.fovMultiplier, 1.15 - 0.15 * (0.5 ** i));
  }
  assert.equal(controller.player.jumpCount, 4);
  assert.equal(controller.player.sprintImpulseCount, 4);
});

test('rendered walking stays smooth between 20 Hz ticks at high and uneven frame rates', () => {
  for (const pattern of [[1 / 144], [1 / 200, 1 / 45, 1 / 120]]) {
    const controller = movingController('walk');
    advance(controller, 6);
    let previous = controller.renderState();
    for (let i = 0; i < 200; i++) {
      const dt = pattern[i % pattern.length];
      controller.update(dt);
      const rendered = controller.renderState();
      near((previous.z - rendered.z) / dt, expectedSpeeds.walk, 1e-8);
      previous = rendered;
    }
  }
});

test('size-one player has a 1.8m hitbox and 1.62m eye level', () => {
  near(MOVEMENT.playerHeight, 1.8);
  near(MOVEMENT.eyeHeight, 1.62);
  near(MOVEMENT.fixedStep, 0.05);
});

test.after(() => {
  console.log('\nActual controller: 12s warm-up, then 60s distance / time; 100 sprint-jump cycles.');
  console.table(measurements);
});
