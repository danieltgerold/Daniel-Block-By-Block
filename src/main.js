import * as THREE from 'three';
import { MovementController, MOVEMENT } from './movement.js';
import { VoxelWorld } from './voxel-world.js';
import { ChunkRenderer } from './chunk-renderer.js';
import './style.css';

const canvas = document.querySelector('#world');
const intro = document.querySelector('#intro');
const startButton = document.querySelector('#start');
const startNote = document.querySelector('#start-note');
const crosshair = document.querySelector('#crosshair');
const playingHint = document.querySelector('#playing-hint');
const status = document.querySelector('#status');
const readouts = Object.fromEntries(['speed', 'height', 'apex', 'airtime'].map(id => [id, document.getElementById(id)]));
const world = new VoxelWorld();
const controller = new MovementController(world);
controller.respawn(world.findSpawn());
let yaw = 0;
let pitch = -0.12;
let active = false;
let previousTime = null;

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;

const scene = new THREE.Scene();
scene.background = new THREE.Color('#c6dfe9');
scene.fog = new THREE.Fog('#c6dfe9', 55, 140);
const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.05, 500);
const baseFov = camera.fov;
camera.rotation.order = 'YXZ';

// One texture tile covers one block face; retain filtered lines without shimmer.
const gridCanvas = document.createElement('canvas');
gridCanvas.width = gridCanvas.height = 128;
const gridContext = gridCanvas.getContext('2d');
gridContext.fillStyle = '#d9dfcd';
gridContext.fillRect(0, 0, 128, 128);
gridContext.strokeStyle = '#bac4ae';
gridContext.lineWidth = 2;
gridContext.beginPath();
// Draw both sides so filtering wraps seamlessly at the tile boundary.
gridContext.rect(0, 0, 128, 128);
gridContext.stroke();
const gridTexture = new THREE.CanvasTexture(gridCanvas);
gridTexture.colorSpace = THREE.SRGBColorSpace;
gridTexture.wrapS = gridTexture.wrapT = THREE.RepeatWrapping;
gridTexture.minFilter = THREE.LinearMipmapLinearFilter;
gridTexture.magFilter = THREE.LinearFilter;
gridTexture.generateMipmaps = true;
gridTexture.anisotropy = renderer.capabilities.getMaxAnisotropy();
const material = new THREE.MeshBasicMaterial({ map: gridTexture, vertexColors: true, fog: true });
const chunks = new ChunkRenderer(world, scene, material);
const selection = new THREE.LineSegments(
  new THREE.EdgesGeometry(new THREE.BoxGeometry(1.004, 1.004, 1.004)),
  new THREE.LineBasicMaterial({ color: '#fff4ad' }),
);
selection.visible = false;
scene.add(selection);
const lookDirection = new THREE.Vector3();

function targetBlock() {
  camera.rotation.set(pitch, yaw, 0);
  camera.updateMatrixWorld();
  camera.getWorldDirection(lookDirection);
  return world.raycast(camera.position, lookDirection, 6);
}

canvas.addEventListener('contextmenu', event => event.preventDefault());
canvas.addEventListener('mousedown', event => {
  // The click that captures the mouse does not also break a block.
  if (!active || (event.button !== 0 && event.button !== 2)) return;
  event.preventDefault();
  const hit = targetBlock();
  if (!hit) return;
  let { x, y, z } = hit;
  if (event.button === 2) {
    if (!Math.hypot(hit.normal.x, hit.normal.y, hit.normal.z)) return;
    x += hit.normal.x; y += hit.normal.y; z += hit.normal.z;
    // Include the interpolated body, so a placed cube cannot intersect the view.
    if (!world.canPlaceBlock(x, y, z, [controller.player, controller.renderState()])) return;
  }
  if (world.setBlock(x, y, z, event.button === 2)) chunks.invalidateBlock(x, z);
});

function clearInput() { controller.pause(); }
function setActive(value) {
  active = value;
  intro.hidden = value;
  crosshair.hidden = !value;
  playingHint.hidden = !value;
  document.body.classList.toggle('is-playing', value);
  clearInput();
  previousTime = null;
  status.textContent = value ? 'ON THE GROUND' : 'READY TO EXPLORE';
}

async function captureMouse() {
  try {
    if (!canvas.requestPointerLock) throw new Error('Pointer lock unavailable');
    await canvas.requestPointerLock();
  } catch {
    startNote.textContent = 'Mouse capture was blocked. Click again, or open this page directly in a desktop browser.';
  }
}
startButton.addEventListener('click', captureMouse);
canvas.addEventListener('click', () => { if (!active) captureMouse(); });
document.addEventListener('pointerlockchange', () => setActive(document.pointerLockElement === canvas));
document.addEventListener('pointerlockerror', () => {
  startNote.textContent = 'Mouse capture was blocked. Click again, or open this page directly in a desktop browser.';
});
document.addEventListener('mousemove', event => {
  if (!active) return;
  yaw -= event.movementX * 0.002;
  pitch = THREE.MathUtils.clamp(pitch - event.movementY * 0.002, -Math.PI / 2 + 0.01, Math.PI / 2 - 0.01);
});
document.addEventListener('keydown', event => {
  if (!active) return;
  if (['KeyW', 'KeyA', 'KeyS', 'KeyD', 'Space', 'ShiftLeft'].includes(event.code)) event.preventDefault();
  controller.keyDown(event.code, event.repeat);
});
document.addEventListener('keyup', event => controller.keyUp(event.code));
function releaseMouse() {
  if (document.pointerLockElement === canvas) document.exitPointerLock();
  setActive(false);
}
window.addEventListener('blur', releaseMouse);
document.addEventListener('visibilitychange', () => { if (document.hidden) releaseMouse(); });
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
});

function animate(time) {
  const dt = previousTime === null ? 0 : (time - previousTime) / 1000;
  previousTime = time;
  if (active) {
    controller.update(dt, { yaw });
    if (controller.player.y < -32) controller.respawn(world.findSpawn());
  }
  const p = controller.player;
  const position = controller.renderState();
  camera.position.set(position.x, position.y + MOVEMENT.eyeHeight, position.z);
  camera.rotation.set(pitch, yaw, 0);
  const fov = baseFov * position.fovMultiplier;
  if (Math.abs(camera.fov - fov) > 1e-8) {
    camera.fov = fov;
    camera.updateProjectionMatrix();
  }
  chunks.update(camera);
  const target = active ? targetBlock() : null;
  selection.visible = Boolean(target);
  if (target) selection.position.set(target.x + 0.5, target.y + 0.5, target.z + 0.5);
  readouts.speed.textContent = p.speed.toFixed(3);
  readouts.height.textContent = p.y.toFixed(3);
  if (p.lastJump) {
    readouts.apex.textContent = p.lastJump.height.toFixed(3);
    readouts.airtime.textContent = p.lastJump.airtime.toFixed(3);
  }
  if (active) status.textContent = p.grounded
    ? (p.sprinting ? 'SPRINTING' : (p.speed > 0.01 ? 'WALKING' : 'ON THE GROUND'))
    : (p.sprinting ? 'SPRINTING / AIRBORNE' : 'AIRBORNE');
  renderer.render(scene, camera);
}
renderer.setAnimationLoop(animate);
