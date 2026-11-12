import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { MOVEMENT } from '../src/movement.js';
import { VoxelWorld } from '../src/voxel-world.js';
import { createPlayerModel, animatePlayerModel, nextCameraMode, playerLookDirection, updatePlayerCamera } from '../src/player-visuals.js';

const near = (actual, expected, tolerance = 1e-9) => assert.ok(Math.abs(actual - expected) < tolerance, `Expected ${expected}, measured ${actual}`);
const limbs = ['Left Arm', 'Right Arm', 'Left Leg', 'Right Leg'];

test('player group has six separate colored meshes and stands two meters tall', () => {
  const model = createPlayerModel();
  assert.ok(model.isGroup);
  assert.equal(model.children.length, 6);
  assert.deepEqual(model.children.map(part => part.name), ['Head', 'Chest', ...limbs]);
  assert.ok(model.children.every(part => part.isMesh));
  assert.equal(new Set(model.children.map(part => part.material.color.getHex())).size, 6);
  const bounds = new THREE.Box3().setFromObject(model);
  near(bounds.min.y, 0);
  near(bounds.max.y, 2);
  for (const name of limbs) {
    const limb = model.userData.parts[name];
    limb.geometry.computeBoundingBox();
    near(limb.geometry.boundingBox.max.y, 0, 1e-7); // Mesh origin is at shoulder/hip.
    assert.ok(limb.geometry.boundingBox.min.y < 0);
  }
});

test('first-person camera is at 1.6m eye level and retains free mouse-look', () => {
  const camera = new THREE.PerspectiveCamera();
  const feet = { x: 12, y: -2, z: 7 };
  updatePlayerCamera(camera, 0, feet, 1.3, -0.4);
  near(camera.position.x, feet.x);
  near(camera.position.y, feet.y + 1.6);
  near(camera.position.z, feet.z);
  const direction = camera.getWorldDirection(new THREE.Vector3());
  near(direction.dot(playerLookDirection(1.3, -0.4)), 1);
});

test('third-person cameras stay exactly four blocks from the head and aim at it', () => {
  const feet = { x: -13, y: 4, z: 21 };
  const head = new THREE.Vector3(feet.x, feet.y + MOVEMENT.eyeHeight, feet.z);
  const camera = new THREE.PerspectiveCamera();
  for (const yaw of [0, Math.PI / 2, -2.2]) {
    for (const pitch of [-1.2, 0, 0.7]) {
      for (const mode of [1, 2]) {
        updatePlayerCamera(camera, mode, feet, yaw, pitch);
        const offset = camera.position.clone().sub(head);
        near(offset.length(), 4);
        near(offset.dot(playerLookDirection(yaw, pitch)), mode === 1 ? -4 : 4);
        near(camera.getWorldDirection(new THREE.Vector3()).dot(head.clone().sub(camera.position).normalize()), 1);
      }
    }
  }
});

test('F5 cycles first / rear / front / first and ignores held-key repeat', () => {
  let mode = 0;
  for (const expected of [1, 2, 0, 1]) {
    mode = nextCameraMode(mode);
    assert.equal(mode, expected);
    assert.equal(nextCameraMode(mode, true), expected);
  }
});

test('arms are paired with opposite legs and smoothly settle after stopping', () => {
  const model = createPlayerModel();
  animatePlayerModel(model, 4.317, 0.25);
  const parts = model.userData.parts;
  near(parts['Left Arm'].rotation.x, parts['Right Leg'].rotation.x);
  near(parts['Right Arm'].rotation.x, parts['Left Leg'].rotation.x);
  near(parts['Left Arm'].rotation.x, -parts['Right Arm'].rotation.x);
  const moving = Math.abs(parts['Left Arm'].rotation.x);
  assert.ok(moving > 0.1);
  animatePlayerModel(model, 0, 1 / 60);
  const slowing = Math.abs(parts['Left Arm'].rotation.x);
  assert.ok(slowing > 0 && slowing < moving, 'Stopping eases instead of snapping');
  for (let i = 0; i < 90; i++) animatePlayerModel(model, 0, 1 / 60);
  for (const name of limbs) near(parts[name].rotation.x, 0);
});

test('animation cadence and amplitude scale with movement speed and agree across FPS', () => {
  const walk = createPlayerModel();
  const sprint = createPlayerModel();
  for (let i = 0; i < 60; i++) {
    animatePlayerModel(walk, 4.317, 1 / 60);
    animatePlayerModel(sprint, 5.6121, 1 / 60);
  }
  near(sprint.userData.limbSwingTime / walk.userData.limbSwingTime, 1.3);
  near(sprint.userData.speedAmount / walk.userData.speedAmount, 1.3);
  const models = [createPlayerModel(), createPlayerModel()];
  for (const [index, fps] of [30, 144].entries()) {
    for (let i = 0; i < fps * 2; i++) animatePlayerModel(models[index], 5.6121, 1 / fps);
  }
  for (const name of limbs) near(models[0].userData.parts[name].rotation.x, models[1].userData.parts[name].rotation.x);
});

test('player-eye targeting accepts 4.5 blocks and rejects farther blocks in every camera mode', () => {
  const world = new VoxelWorld();
  const feet = { x: 0.5, y: 0, z: 0.5 };
  const eye = { x: feet.x, y: feet.y + MOVEMENT.eyeHeight, z: feet.z };
  const forward = playerLookDirection(0, 0);
  world.setBlock(0, 1, -6, true); // Front face is 5.5m from the eye.
  for (const mode of [0, 1, 2]) {
    const camera = new THREE.PerspectiveCamera();
    updatePlayerCamera(camera, mode, feet, 0, 0);
    assert.equal(world.raycast(eye, forward), null);
  }
  world.setBlock(0, 1, -5, true); // Front face is exactly 4.5m from the eye.
  const hit = world.raycast(eye, forward);
  near(hit.distance, 4.5);
  assert.equal(hit.z, -5);
});
