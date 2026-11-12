import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { MOVEMENT, MovementController } from '../src/movement.js';
import { VoxelWorld } from '../src/voxel-world.js';
import { createPlayerAnimation, tickPlayerAnimation, interpolatePlayerAnimation, angleDifference, swingCurves } from '../src/player-animation.js';
import { createPlayerModel, animatePlayerModel, nextCameraMode, playerLookDirection, updatePlayerCamera,
  MODEL_SCALE, PLAYER_COLORS, createEmptyHand, updateEmptyHand, renderPlayerScene } from '../src/player-visuals.js';
const near = (a, b, epsilon = 1e-8) => assert.ok(Math.abs(a - b) < epsilon, `Expected ${b}, measured ${a}`);
const degrees = n => n * Math.PI / 180;
const pose = (state = createPlayerAnimation()) => interpolatePlayerAnimation(state, state, 0);

function overlaps(world, center, half = 0.1) {
  for (let x = Math.floor(center.x - half); x <= Math.floor(center.x + half); x++)
    for (let y = Math.floor(center.y - half); y <= Math.floor(center.y + half); y++)
      for (let z = Math.floor(center.z - half); z <= Math.floor(center.z + half); z++) {
        if (world.hasBlock(x, y, z) && center.x + half > x + 1e-7 && center.x - half < x + 1 - 1e-7
          && center.y + half > y + 1e-7 && center.y - half < y + 1 - 1e-7
          && center.z + half > z + 1e-7 && center.z - half < z + 1 - 1e-7) return true;
      }
  return false;
}

test('classic rig has the exact six dimensions, centers, pivots, colors and 1.875m height', () => {
  const model = createPlayerModel();
  assert.ok(model.isGroup);
  assert.equal(model.children.length, 6);
  const definitions = [
    ['Head', [8, 8, 8], [0, 28, 0], [0, 24, 0]],
    ['Chest', [8, 12, 4], [0, 18, 0], [0, 24, 0]],
    ['Left Arm', [4, 12, 4], [-6, 18, 0], [-5, 22, 0]],
    ['Right Arm', [4, 12, 4], [6, 18, 0], [5, 22, 0]],
    ['Left Leg', [4, 12, 4], [-2, 6, 0], [-2, 12, 0]],
    ['Right Leg', [4, 12, 4], [2, 6, 0], [2, 12, 0]],
  ];
  for (const [name, size, center, pivot] of definitions) {
    const mesh = model.userData.parts[name], joint = model.userData.joints[name];
    assert.ok(mesh.isMesh && joint.isGroup);
    assert.equal(mesh.material.color.getHexString(), new THREE.Color(PLAYER_COLORS[name]).getHexString());
    const actualSize = mesh.geometry.boundingBox || (mesh.geometry.computeBoundingBox(), mesh.geometry.boundingBox);
    const dimensions = actualSize.getSize(new THREE.Vector3());
    const actualCenter = mesh.getWorldPosition(new THREE.Vector3());
    for (const [i, axis] of ['x', 'y', 'z'].entries()) {
      near(dimensions[axis], size[i] * MODEL_SCALE, 1e-7);
      near(actualCenter[axis], center[i] * MODEL_SCALE);
      near(joint.position[axis], pivot[i] * MODEL_SCALE);
    }
  }
  const bounds = new THREE.Box3().setFromObject(model);
  near(bounds.min.y, 0);
  near(bounds.max.y, 1.875);
  near(MOVEMENT.playerHeight, 1.8, 1e-10);
  assert.equal(model.userData.parts.Head.children.length, 5, 'Original face has eyes and mouth');
});

test('idle 35-degree head look leaves torso still; 70-degree look clamps to torso 20/head 50', () => {
  const state = createPlayerAnimation();
  tickPlayerAnimation(state, { aimYaw: degrees(35) });
  near(state.torsoYaw, 0);
  near(pose(state).headYaw, degrees(35));
  tickPlayerAnimation(state, { aimYaw: degrees(70) });
  near(state.torsoYaw, degrees(20));
  near(pose(state).headYaw, degrees(50));
  tickPlayerAnimation(state, { aimYaw: degrees(70), aimPitch: -0.8 });
  near(state.torsoYaw, degrees(20));
  const model = createPlayerModel();
  animatePlayerModel(model, { x: 0, y: 0, z: 0 }, pose(state), 2);
  near(model.rotation.y, degrees(20));
  near(model.userData.joints.Head.rotation.y, degrees(50));
  near(model.userData.joints.Head.rotation.x, -0.8);
});

test('travel steers torso, backing up flips it forward, and actions steer toward aim', () => {
  const state = createPlayerAnimation();
  tickPlayerAnimation(state, { dx: -0.2, aimYaw: 0 });
  near(state.torsoYaw, degrees(27)); // 30% of 90 degrees.
  const backing = createPlayerAnimation();
  tickPlayerAnimation(backing, { dz: 0.2, aimYaw: 0 });
  near(backing.torsoYaw, 0);
  const idle = createPlayerAnimation();
  tickPlayerAnimation(idle, { aimYaw: degrees(35), swing: true });
  near(idle.torsoYaw, degrees(10.5));
});

test('angle interpolation crosses +/-180 by the short path', () => {
  const previous = createPlayerAnimation(degrees(179));
  const current = createPlayerAnimation(degrees(-179));
  const middle = interpolatePlayerAnimation(previous, current, 0.5);
  near(Math.abs(middle.aimYaw), Math.PI);
  near(Math.abs(middle.torsoYaw), Math.PI);
  near(angleDifference(previous.aimYaw, middle.aimYaw), degrees(1));
});

test('holding W against a wall settles actual-displacement-driven limbs', () => {
  const world = new VoxelWorld();
  for (let y = 0; y < 3; y++) world.setBlock(0, y, -2, true);
  const controller = new MovementController(world);
  controller.respawn({ x: 0.5, y: 0, z: 0.5 });
  controller.keyDown('KeyW');
  let largest = 0;
  for (let i = 0; i < 100; i++) {
    controller.update(0.05);
    largest = Math.max(largest, controller.player.animation.amount);
  }
  assert.ok(largest > 0.1);
  near(controller.player.z, -0.7);
  near(controller.player.speed, 0);
  assert.ok(controller.player.animation.amount < 1e-8);
  const model = createPlayerModel();
  animatePlayerModel(model, controller.player, controller.renderState().animation, 1);
  for (const name of ['Left Arm', 'Right Arm', 'Left Leg', 'Right Leg']) near(model.userData.joints[name].rotation.x, 0);
});

test('walking pose is interpolated and agrees at different rendering frame rates', () => {
  const controllers = [30, 60, 144, 240].map(fps => {
    const controller = new MovementController(new VoxelWorld());
    controller.keyDown('KeyW');
    for (let i = 0; i < fps * 2; i++) controller.update(1 / fps, { yaw: degrees(179), pitch: 0.2 });
    return controller;
  });
  const first = controllers[0].renderState().animation;
  for (const controller of controllers) {
    const actual = controller.renderState().animation;
    near(actual.amount, first.amount);
    near(actual.phase, first.phase);
    near(angleDifference(actual.torsoYaw, first.torsoYaw), 0);
  }
});

test('first person hides the whole avatar by default and the menu option shows one body without head or duplicate right arm', () => {
  const model = createPlayerModel();
  const feet = { x: 0.5, y: 0, z: 0.5 };
  animatePlayerModel(model, feet, pose(), 0);
  assert.equal(model.visible, false);
  near(model.position.x, feet.x); near(model.position.z, feet.z);
  animatePlayerModel(model, feet, pose(), 0, true);
  assert.equal(model.visible, true);
  assert.equal(model.userData.joints.Head.visible, false);
  assert.equal(model.userData.joints['Right Arm'].visible, false);
  for (const mode of [1, 2]) {
    animatePlayerModel(model, feet, pose(), mode);
    assert.equal(model.visible, true);
    assert.equal(model.userData.joints.Head.visible, true);
    assert.equal(model.userData.joints['Right Arm'].visible, true);
  }
});
test('first-person eye and F5 modes preserve aim and cycle once per press', () => {
  let mode = 0;
  for (const expected of [1, 2, 0]) {
    mode = nextCameraMode(mode);
    assert.equal(mode, expected);
    assert.equal(nextCameraMode(mode, true), expected);
  }
  const camera = new THREE.PerspectiveCamera();
  const feet = { x: 0.5, y: 2, z: 0.5 };
  updatePlayerCamera(camera, 0, feet, 0.8, -0.4);
  near(camera.position.y, 3.62);
  near(camera.getWorldDirection(new THREE.Vector3()).dot(playerLookDirection(0.8, -0.4)), 1);
  for (const mode of [1, 2]) {
    near(updatePlayerCamera(camera, mode, feet, 0.8, -0.4), 4);
    const eye = new THREE.Vector3(feet.x, feet.y + MOVEMENT.eyeHeight, feet.z);
    near(camera.position.distanceTo(eye), 4);
    near(camera.getWorldDirection(new THREE.Vector3()).dot(eye.sub(camera.position).normalize()), 1);
  }
});

for (const mode of [1, 2]) {
  test(`camera mode ${mode} sweeps walls, offset corners, floors and ceilings, then restores 4m`, () => {
    const feet = { x: 0.5, y: 0, z: 0.5 };
    // For each mode choose aim so the tested camera path points toward the obstacle.
    const sign = mode === 1 ? -1 : 1;
    const cases = [
      { yaw: mode === 1 ? 0 : Math.PI, pitch: 0, block: [0, 1, 2] },
      // Center ray misses this voxel at x=1, but the camera box catches its corner.
      { yaw: mode === 1 ? 0.13 : Math.PI + 0.13, pitch: 0, block: [1, 1, 3] },
      { yaw: 0, pitch: -sign * 1.0, floor: true },
      { yaw: 0, pitch: sign * 1.0, block: [0, 3, mode === 1 ? 1 : -2] },
    ];
    for (const fixture of cases) {
      const world = new VoxelWorld({ depth: fixture.floor ? 3 : 0 });
      if (fixture.block) world.setBlock(...fixture.block, true);
      const camera = new THREE.PerspectiveCamera();
      const distance = updatePlayerCamera(camera, mode, feet, fixture.yaw, fixture.pitch, world);
      assert.ok(distance < 4, `Expected collision for ${JSON.stringify(fixture)}, got ${distance}`);
      assert.equal(overlaps(world, camera.position), false);
      if (fixture.block) {
        world.setBlock(...fixture.block, false);
        near(updatePlayerCamera(camera, mode, feet, fixture.yaw, fixture.pitch, world), 4);
      }
    }
  });
}

test('six-tick swing repeats during mining, stops on release and does not change walk phase', () => {
  const mining = new MovementController(new VoxelWorld());
  const walking = new MovementController(new VoxelWorld());
  mining.keyDown('KeyW'); walking.keyDown('KeyW');
  mining.setMining(true);
  const starts = [];
  mining.onTick = p => { if (p.animation.swingStartedThisTick) starts.push(mining.totalSteps); };
  for (let i = 0; i < 19; i++) { mining.update(0.05); walking.update(0.05); }
  assert.deepEqual(starts, [1, 4, 7, 10, 13, 16, 19]);
  near(mining.player.animation.phase, walking.player.animation.phase);
  near(mining.player.animation.amount, walking.player.animation.amount);
  mining.setMining(false);
  for (let i = 0; i < 6; i++) mining.update(0.05);
  assert.equal(mining.player.animation.swingAge, -1);
  assert.equal(mining.player.animation.swingSerial, 7);
  mining.requestSwing();
  mining.update(0.05);
  assert.equal(mining.player.animation.swingSerial, 8, 'Successful placement/use can request the same swing');
});

test('bare right arm returns to rest and renders after the world with a separate depth clear and 70 FOV', () => {
  const hand = createEmptyHand(16 / 9);
  const rest = hand.rig.matrix.clone();
  updateEmptyHand(hand, { swingActive: true, swingProgress: 0.25 });
  assert.notDeepEqual(hand.rig.matrix.elements, rest.elements);

  updateEmptyHand(hand, { swingActive: true, swingProgress: 1 });
  for (let i = 0; i < 16; i++) near(hand.rig.matrix.elements[i], rest.elements[i]);
  near(hand.camera.fov, 70);
  assert.equal(hand.arm.material.color.getHexString(), new THREE.Color(PLAYER_COLORS['Right Arm']).getHexString());
  const calls = [];
  const renderer = { autoClear: true, clear: () => calls.push('clear'), clearDepth: () => calls.push('depth'),
    render: scene => calls.push(scene === hand.scene ? 'hand' : 'world') };
  renderPlayerScene(renderer, {}, {}, hand, 0);
  assert.deepEqual(calls, ['clear', 'world', 'depth', 'hand']);
  assert.equal(renderer.autoClear, true);
  calls.length = 0;
  renderPlayerScene(renderer, {}, {}, hand, 1);
  assert.deepEqual(calls, ['clear', 'world']);
  const end = swingCurves(1);
  near(end.inward, 0); near(end.vertical, 0); near(end.reach, 0);
});
