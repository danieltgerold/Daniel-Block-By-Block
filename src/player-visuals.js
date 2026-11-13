import * as THREE from 'three';
import { MOVEMENT } from './movement.js';
import { swingCurves } from './player-animation.js';
import { ITEMS, ARMOR } from './inventory.js';
import { createSharedBlock } from './block-assets.js';

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
  part('Chest', [8, 12, 4], [0, 18, 0], [0, 24, 0]);
  // With forward -Z and right +X, negative X is the player's left.
  part('Left Arm', [4, 12, 4], [-6, 18, 0], [-5, 22, 0]);
  part('Right Arm', [4, 12, 4], [6, 18, 0], [5, 22, 0]);
  part('Left Leg', [4, 12, 4], [-2, 6, 0], [-2, 12, 0]);
  part('Right Leg', [4, 12, 4], [2, 6, 0], [2, 12, 0]);
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
  const rightItem = createBlockItem(), leftItem = createBlockItem();
  rightItem.position.set(MODEL_SCALE, -10 * MODEL_SCALE - .15, -.15);
  leftItem.position.set(-MODEL_SCALE, -10 * MODEL_SCALE - .15, -.15);
  rightItem.visible = leftItem.visible = false;
  joints['Right Arm'].add(rightItem); joints['Left Arm'].add(leftItem);
  model.userData.equipment = { rightItem, leftItem, armor: new Map() };
  return model;
}

export function animatePlayerModel(model, feet, pose, cameraMode = 0) {
  model.scale.setScalar(feet.size ?? 1);
  model.position.set(feet.x, feet.y, feet.z);
  model.rotation.set(0, pose.torsoYaw, 0);
  model.visible = cameraMode !== 0;
  const j = model.userData.joints;
  j.Head.visible = cameraMode !== 0;
  j['Right Arm'].visible = cameraMode !== 0;
  const s = Math.cos(pose.phase * 0.6662) * pose.amount;
  const c = pose.crouch ?? 0;
  const p = pose.swingActive ? pose.swingProgress : 0;
  const t = pose.swingActive ? 0.20 * Math.sin(2 * Math.PI * Math.sqrt(p)) : 0;
  const headPitchMC = -pose.aimPitch;
  const u = 1 - (1 - p) ** 4;
  const attack = pose.swingActive ? 1.2 * Math.sin(Math.PI * u)
    + 0.75 * Math.sin(Math.PI * p) * (0.7 - headPitchMC) : 0;
  // Build in MC (+Y down, right shoulder -X), then convert X/Y rotations once.
  j.Chest.position.set(0, (24 - 3.2 * c) * MODEL_SCALE, 0);
  j.Chest.rotation.set(-0.5 * c, -t, 0);
  j.Head.position.set(0, (24 - 4.2 * c) * MODEL_SCALE, 0);
  j.Head.rotation.set(pose.aimPitch, pose.headYaw, 0);
  j['Right Arm'].position.set(5 * Math.cos(t) * MODEL_SCALE, (22 - 3.2 * c) * MODEL_SCALE, 5 * Math.sin(t) * MODEL_SCALE);
  j['Left Arm'].position.set(-5 * Math.cos(t) * MODEL_SCALE, (22 - 3.2 * c) * MODEL_SCALE, -5 * Math.sin(t) * MODEL_SCALE);
  j['Right Arm'].rotation.set(-(s + 0.4 * c - attack), -3 * t, -0.4 * Math.sin(Math.PI * p));
  j['Left Arm'].rotation.set(-(-s + 0.4 * c + t), -t, 0);
  j['Right Leg'].position.set(2 * MODEL_SCALE, 12 * MODEL_SCALE, 4 * c * MODEL_SCALE);
  j['Left Leg'].position.set(-2 * MODEL_SCALE, 12 * MODEL_SCALE, 4 * c * MODEL_SCALE);
  j['Right Leg'].rotation.set(1.4 * s, 0, 0);
  j['Left Leg'].rotation.set(-1.4 * s, 0, 0);
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
  headTarget.set(feet.x, feet.y + (feet.eyeHeight ?? feet.eyeOffset ?? MOVEMENT.eyeHeight * (feet.size ?? 1)), feet.z);
  camera.position.copy(headTarget);
  camera.rotation.order = 'YXZ';
  if (mode === 0) {
    camera.rotation.set(pitch, yaw, 0);
    return 0;
  }
  playerLookDirection(yaw, pitch, forward);
  const size = feet.size ?? 1;
  const distance = THIRD_PERSON_DISTANCE * size;
  path.copy(forward).multiplyScalar(mode === 1 ? -distance : distance);
  const fraction = world ? world.sweepBox(headTarget, path, 0.1 * size) : 1;
  camera.position.addScaledVector(path, fraction);
  camera.rotation.set(mode === 2 ? -pitch : pitch, mode === 2 ? yaw + Math.PI : yaw, 0);
  return distance * fraction;
}

export function createEmptyHand(aspect = 1) {
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(70, aspect, 0.01, 10);
  const rig = new THREE.Group();
  rig.name = 'First Person Right Arm';
  const arm = coloredBox([4, 12, 4].map(n => n * MODEL_SCALE), PLAYER_COLORS['Right Arm']);
  arm.name = 'Right Arm';
  arm.geometry.translate(0, 10 * MODEL_SCALE, 0);
  rig.add(arm);
  scene.add(rig);
  const hand = { scene, camera, rig, arm };
  hand.mainItem = createBlockItem(); hand.offhandItem = createBlockItem();
  hand.mainItem.visible = hand.offhandItem.visible = false;
  hand.equipHeight = 1;
  scene.add(hand.mainItem, hand.offhandItem);
  updateEmptyHand(hand, { swingActive: false, swingProgress: 0 });
  return hand;
}

const fixedArmAlignment = new THREE.Matrix4().makeTranslation(-1, 3.6, 3.5)
  .multiply(new THREE.Matrix4().makeRotationZ(120 * Math.PI / 180))
  .multiply(new THREE.Matrix4().makeRotationX(200 * Math.PI / 180))
  .multiply(new THREE.Matrix4().makeRotationY(-135 * Math.PI / 180))
  .multiply(new THREE.Matrix4().makeTranslation(5.6, 0, 0));
const handRotation = new THREE.Matrix4();
export function updateEmptyHand(hand, pose, inventory = null) {
  const p = pose.swingActive ? pose.swingProgress : 0;
  const { inward: q, vertical: r, reach: a } = swingCurves(p, pose.swingActive);
  const b = Math.sin(Math.PI * p * p);
  hand.rig.matrixAutoUpdate = false;
  // Written matrix order: T · Ry · Rz · fixed arm alignment. No walk/idle bob.
  hand.rig.matrix.makeTranslation(0.64 - 0.30 * q, -0.60 + 0.40 * r, -0.72 - 0.40 * a)
    .multiply(handRotation.makeRotationY((45 + 70 * q) * Math.PI / 180))
    .multiply(handRotation.makeRotationZ(-20 * b * Math.PI / 180))
    .multiply(fixedArmAlignment);
  hand.rig.matrixWorldNeedsUpdate = true;
  const main = inventory?.mainHand, offhand = inventory?.offhand;
  hand.rig.visible = !main;
  hand.mainItem.visible = Boolean(main); hand.offhandItem.visible = Boolean(offhand);
  if (main) {
    hand.mainItem.position.set(.56 - .4 * q, -.52 + .2 * r - .6 * (1 - hand.equipHeight), -.72 - .2 * a);
    hand.mainItem.matrixAutoUpdate = false;
    hand.mainItem.matrix.makeTranslation(...hand.mainItem.position.toArray())
      .multiply(handRotation.makeRotationY((45 - 20 * b) * Math.PI / 180))
      .multiply(handRotation.makeRotationZ(-20 * q * Math.PI / 180))
      .multiply(handRotation.makeRotationX(-80 * q * Math.PI / 180))
      .multiply(handRotation.makeRotationY(-45 * Math.PI / 180));
    hand.mainItem.matrixWorldNeedsUpdate = true;
  }
  if (offhand) { hand.offhandItem.position.set(-.56, -.52, -.72); hand.offhandItem.rotation.set(.12, -.35, 0); }
}

export const createBlockItem = (size = .375) => createSharedBlock(size);

export function syncEquipment(model, inventory) {
  const equipment = model.userData.equipment;
  equipment.rightItem.visible = Boolean(inventory.mainHand);
  equipment.leftItem.visible = Boolean(inventory.offhand);
  const groups = [['Head'], ['Chest', 'Left Arm', 'Right Arm'], ['Left Leg', 'Right Leg'], ['Left Leg', 'Right Leg']];
  for (let n = 0; n < ARMOR.length; n++) {
    const stack = inventory.slots[36 + n], item = ITEMS.get(stack?.id);
    for (const part of groups[n]) {
      const key = `${n}:${part}`;
      let overlay = equipment.armor.get(key);
      if (item && !overlay) {
        overlay = new THREE.Mesh(model.userData.parts[part].geometry.clone(), new THREE.MeshBasicMaterial({ color: item.color ?? '#aab6c0' }));
        overlay.scale.setScalar(1.04); model.userData.parts[part].add(overlay); equipment.armor.set(key, overlay);
      }
      if (overlay) { overlay.visible = Boolean(item); if (item) overlay.material.color.set(item.color ?? '#aab6c0'); }
    }
  }
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
