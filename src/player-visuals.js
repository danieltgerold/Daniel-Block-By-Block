import * as THREE from 'three';
import { MOVEMENT } from './movement.js';

export const THIRD_PERSON_DISTANCE = 4;
const WALK_SPEED = MOVEMENT.groundWalkAcceleration / (1 - MOVEMENT.groundDrag) * MOVEMENT.ticksPerSecond;

export function createPlayerModel() {
  const model = new THREE.Group();
  model.name = 'Player';
  const parts = {};
  function part(name, color, size, position, joint = false) {
    const geometry = new THREE.BoxGeometry(...size);
    if (joint) geometry.translate(0, -size[1] / 2, 0);
    // Face shading keeps the brightly colored boxes readable without lighting.
    const colors = [];
    const normals = geometry.getAttribute('normal');
    for (let i = 0; i < normals.count; i++) {
      const shade = normals.getY(i) > 0 ? 1 : normals.getY(i) < 0 ? 0.6 : normals.getX(i) ? 0.85 : 0.72;
      colors.push(shade, shade, shade);
    }
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    const mesh = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({ color, vertexColors: true }));
    mesh.name = name;
    mesh.position.set(...position);
    parts[name] = mesh;
    model.add(mesh);
  }
  // 0.75m legs + 0.75m chest + 0.5m head = the existing 2m player height.
  part('Head', '#32f45d', [0.5, 0.5, 0.5], [0, 1.75, 0]);
  part('Chest', '#ffe529', [0.5, 0.75, 0.25], [0, 1.125, 0]);
  part('Left Arm', '#ff3434', [0.25, 0.75, 0.25], [-0.375, 1.5, 0], true);
  part('Right Arm', '#ff35da', [0.25, 0.75, 0.25], [0.375, 1.5, 0], true);
  part('Left Leg', '#285cff', [0.25, 0.75, 0.25], [-0.125, 0.75, 0], true);
  part('Right Leg', '#16deff', [0.25, 0.75, 0.25], [0.125, 0.75, 0], true);
  model.userData.parts = parts;
  model.userData.limbSwingTime = 0;
  model.userData.speedAmount = 0;
  model.visible = false;
  return model;
}

export function animatePlayerModel(model, movementSpeed, frameSeconds) {
  const dt = Math.max(0, Math.min(frameSeconds, 0.25));
  const speed = Math.max(0, movementSpeed);
  const animation = model.userData;
  // Accumulating distance makes cadence scale with movement speed and remain
  // independent of render FPS. Exponential easing also returns stopped limbs to 0.
  animation.limbSwingTime += speed * dt * 4;
  const targetAmount = speed / WALK_SPEED;
  animation.speedAmount += (targetAmount - animation.speedAmount) * (1 - Math.exp(-12 * dt));
  if (speed === 0 && animation.speedAmount < 1e-5) animation.speedAmount = 0;
  const phase = animation.limbSwingTime * 0.6662;
  const swing = Math.cos(phase) * 1.4 * animation.speedAmount;
  const oppositeSwing = Math.cos(phase + Math.PI) * 1.4 * animation.speedAmount;
  const parts = animation.parts;
  parts['Left Arm'].rotation.x = parts['Right Leg'].rotation.x = swing;
  parts['Right Arm'].rotation.x = parts['Left Leg'].rotation.x = oppositeSwing;
}

export function nextCameraMode(mode, repeat = false) {
  return repeat ? mode : (mode + 1) % 3;
}

export function playerLookDirection(yaw, pitch, result = new THREE.Vector3()) {
  return result.set(-Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), -Math.cos(yaw) * Math.cos(pitch));
}

const headTarget = new THREE.Vector3();
const forward = new THREE.Vector3();
export function updatePlayerCamera(camera, mode, feet, yaw, pitch) {
  headTarget.set(feet.x, feet.y + MOVEMENT.eyeHeight, feet.z);
  camera.position.copy(headTarget);
  if (mode === 0) {
    // First-person looks out from the head; looking at this same point is undefined.
    camera.rotation.order = 'YXZ';
    camera.rotation.set(pitch, yaw, 0);
  } else {
    playerLookDirection(yaw, pitch, forward);
    camera.position.addScaledVector(forward, mode === 1 ? -THIRD_PERSON_DISTANCE : THIRD_PERSON_DISTANCE);
    camera.lookAt(headTarget);
  }
}
