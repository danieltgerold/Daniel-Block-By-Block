import * as THREE from 'three';
import { MOVEMENT } from './movement.js';
import { angleDifference, swingCurves } from './player-animation.js';

export const MODEL_SCALE = 0.9375 / 16;
export const THIRD_PERSON_DISTANCE = 4;
export const PLAYER_COLORS = Object.freeze({ Head: '#32f45d', Chest: '#ffe529',
  'Left Arm': '#ff3434', 'Right Arm': '#ff35da', 'Left Leg': '#285cff', 'Right Leg': '#16deff' });

function coloredBox(size, color) {
  const geometry = new THREE.BoxGeometry(...size);
  const normals = geometry.getAttribute('normal');
  const colors = [];
  for (let i = 0; i < normals.count; i++) {
    const shade = normals.getY(i) > 0 ? 1 : normals.getY(i) < 0 ? 0.6 : normals.getX(i) ? 0.85 : 0.72;
    colors.push(shade, shade, shade);
  }
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  return new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({ color, vertexColors: true, depthTest: true, depthWrite: true }));
}

export function createPlayerModel() {
  const model = new THREE.Group();
  model.name = 'Player';
  const parts = {}, joints = {};
  function part(name, dimensions, center, pivot = center) {
    const joint = new THREE.Group();
    joint.name = `${name} Joint`;
    joint.position.fromArray(pivot).multiplyScalar(MODEL_SCALE);
    joint.rotation.order = 'YXZ';
    const mesh = coloredBox(dimensions.map(n => n * MODEL_SCALE), PLAYER_COLORS[name]);
    mesh.name = name;
    mesh.position.set(...center.map((n, i) => (n - pivot[i]) * MODEL_SCALE));
    joint.add(mesh);
    model.add(joint);
    parts[name] = mesh;
    joints[name] = joint;
  }
  part('Head', [8, 8, 8], [0, 28, 0], [0, 24, 0]);
  part('Chest', [8, 12, 4], [0, 18, 0]);
  // With forward -Z and right +X, negative X is the player's left.
  part('Left Arm', [4, 12, 4], [-6, 18, 0], [-5, 22, 0]);
  part('Right Arm', [4, 12, 4], [6, 18, 0], [5, 22, 0]);
  part('Left Leg', [4, 12, 4], [-1.9, 6, 0], [-1.9, 12, 0]);
  part('Right Leg', [4, 12, 4], [1.9, 6, 0], [1.9, 12, 0]);
  // An original five-rectangle face on -Z, using no imported skins or artwork.
  function faceRect(w, h, x, y, color, layer = 0) {
    const rect = new THREE.Mesh(new THREE.PlaneGeometry(w * MODEL_SCALE, h * MODEL_SCALE), new THREE.MeshBasicMaterial({ color }));
    rect.rotation.y = Math.PI;
    rect.position.set(x * MODEL_SCALE, y * MODEL_SCALE, -4 * MODEL_SCALE - 0.001 - layer * 0.001);
    parts.Head.add(rect);
  }
  for (const x of [-1.8, 1.8]) {
    faceRect(1.8, 1.3, x, 1, '#fffdf0');
    faceRect(0.7, 0.9, x + 0.2, 0.9, '#203346', 1);
  }
  faceRect(2.6, 0.4, 0, -1.5, '#264b38');
  model.userData.parts = parts;
  model.userData.joints = joints;
  return model;
}

export function animatePlayerModel(model, feet, pose, cameraMode = 0) {
  const size = feet.size ?? 1;
  model.scale.setScalar(size);
  model.position.set(feet.x, feet.y, feet.z);
  model.rotation.y = pose.torsoYaw;
  const joints = model.userData.joints;
  joints.Head.visible = cameraMode !== 0;
  joints['Right Arm'].visible = cameraMode !== 0;
  if (cameraMode === 0) {
    // Move only the visual rig behind the eye. The front of the chest stays
    // behind the eye ray even when the torso and head point different ways.
    const relative = angleDifference(pose.aimYaw, pose.torsoYaw);
    const back = Math.abs(Math.cos(relative)) * 2 * MODEL_SCALE
      + Math.abs(Math.sin(relative)) * 4 * MODEL_SCALE + 0.2;
    model.position.x += Math.sin(pose.aimYaw) * back * size;
    model.position.z += Math.cos(pose.aimYaw) * back * size;
  }
  joints.Head.rotation.set(pose.aimPitch, pose.headYaw, 0);
  const s = Math.cos(pose.phase * 0.6662) * pose.amount;
  joints['Left Arm'].rotation.x = s;
  joints['Right Arm'].rotation.x = -s;
  joints['Right Leg'].rotation.x = 1.4 * s;
  joints['Left Leg'].rotation.x = -1.4 * s;
  const action = swingCurves(pose.swingProgress, pose.swingActive);
  joints['Right Arm'].rotation.x -= action.reach * 1.0;
  joints['Right Arm'].rotation.y = -action.inward * 0.5;
}

export function nextCameraMode(mode, repeat = false) {
  return repeat ? mode : (mode + 1) % 3;
}

export function playerLookDirection(yaw, pitch, result = new THREE.Vector3()) {
  return result.set(-Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), -Math.cos(yaw) * Math.cos(pitch));
}

const headTarget = new THREE.Vector3();
const forward = new THREE.Vector3();
const path = new THREE.Vector3();
export function updatePlayerCamera(camera, mode, feet, yaw, pitch, world = null) {
  headTarget.set(feet.x, feet.y + MOVEMENT.eyeHeight * (feet.size ?? 1), feet.z);
  camera.position.copy(headTarget);
  camera.rotation.order = 'YXZ';
  if (mode === 0) {
    camera.rotation.set(pitch, yaw, 0);
    return 0;
  }
  playerLookDirection(yaw, pitch, forward);
  path.copy(forward).multiplyScalar(mode === 1 ? -THIRD_PERSON_DISTANCE : THIRD_PERSON_DISTANCE);
  const fraction = world ? world.sweepBox(headTarget, path, 0.1) : 1;
  camera.position.addScaledVector(path, fraction);
  camera.rotation.set(mode === 2 ? -pitch : pitch, mode === 2 ? yaw + Math.PI : yaw, 0);
  return THIRD_PERSON_DISTANCE * fraction;
}

export function createEmptyHand(aspect = 1) {
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(70, aspect, 0.01, 10);
  const rig = new THREE.Group();
  rig.name = 'First Person Right Arm';
  const arm = coloredBox([4, 12, 4].map(n => n * MODEL_SCALE), PLAYER_COLORS['Right Arm']);
  arm.name = 'Right Arm';
  arm.geometry.translate(0, 6 * MODEL_SCALE, 0);
  rig.add(arm);
  scene.add(rig);
  const hand = { scene, camera, rig, arm };
  updateEmptyHand(hand, { swingActive: false, swingProgress: 0 });
  return hand;
}

export function updateEmptyHand(hand, pose) {
  const { inward, vertical, reach } = swingCurves(pose.swingProgress, pose.swingActive);
  hand.rig.position.set(0.5 - 0.32 * inward, -0.8 + 0.12 * vertical, -0.65 - 0.22 * reach);
  hand.rig.rotation.set(-0.6 - 0.4 * inward, -0.15 - 0.8 * inward, 0.2 - 0.25 * reach);
}

export function renderPlayerScene(renderer, scene, camera, hand, mode) {
  const autoClear = renderer.autoClear;
  renderer.autoClear = false;
  renderer.clear();
  renderer.render(scene, camera);
  if (mode === 0) {
    renderer.clearDepth();
    renderer.render(hand.scene, hand.camera);
  }
  renderer.autoClear = autoClear;
}
