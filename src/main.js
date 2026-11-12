import * as THREE from 'three';
import { MovementController, MOVEMENT } from './movement.js';
import { VoxelWorld } from './voxel-world.js';
import { ChunkRenderer } from './chunk-renderer.js';
import { ChatUI, isTextEntry } from './chat-ui.js';
import { createPlayerModel, animatePlayerModel, nextCameraMode, updatePlayerCamera,
  createEmptyHand, updateEmptyHand, renderPlayerScene } from './player-visuals.js';
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
let cameraMode = 0;
let primaryClickQueued = false;

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;

const scene = new THREE.Scene();
scene.background = new THREE.Color('#c6dfe9');
scene.fog = new THREE.Fog('#c6dfe9', 55, 140);
const playerModel = createPlayerModel();
scene.add(playerModel);
const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.05, 500);
const baseFov = camera.fov;
camera.rotation.order = 'YXZ';
const emptyHand = createEmptyHand(camera.aspect);

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

function targetBlock(feet = controller.renderState()) {
  return controller.targetBlock(feet, yaw, pitch);
}

canvas.addEventListener('contextmenu', event => event.preventDefault());
function editBlock(place, feet = controller.renderState()) {
  const hit = targetBlock(feet);
  if (!hit) return false;
  let { x, y, z } = hit;
  if (place) {
    if (!Math.hypot(hit.normal.x, hit.normal.y, hit.normal.z)) return false;
    x += hit.normal.x; y += hit.normal.y; z += hit.normal.z;
    if (!world.canPlaceBlock(x, y, z, [controller.player, controller.renderState()])) return false;
  }
  const changed = world.setBlock(x, y, z, place);
  if (changed) chunks.invalidateBlock(x, z);
  return changed;
}
controller.onTick = player => {
  if (player.animation.swingStartedThisTick && (controller.miningHeld || primaryClickQueued)) {
    editBlock(false, player);
    primaryClickQueued = false;
  }
};
canvas.addEventListener('mousedown', event => {
  // The click that captures the mouse does not also break a block.
  if (!active || (event.button !== 0 && event.button !== 2)) return;
  event.preventDefault();
  if (event.button === 0) {
    primaryClickQueued = true;
    controller.setMining(true);
    controller.requestSwing();
  } else if (editBlock(true)) {
    controller.requestSwing();
  }
});
document.addEventListener('mouseup', event => { if (event.button === 0) controller.setMining(false); });

function clearInput() { primaryClickQueued = false; controller.pause(); }
function renderInputMode(mode) {
  active = mode === 'playing';
  intro.hidden = mode !== 'menu';
  crosshair.hidden = !active;
  playingHint.hidden = !active;
  document.body.classList.toggle('is-playing', active);
  previousTime = null;
  status.textContent = active ? 'ON THE GROUND' : (mode === 'chat' ? 'CHATTING' : 'PAUSED');
}

let profileStorage = null;
try { profileStorage = window.localStorage; } catch { /* Session identity still works without browser storage. */ }
const chatUI = new ChatUI({ document, window, controller, clearInput, requestCapture: captureMouse,
  requestUnlock: () => { if (document.pointerLockElement === canvas) document.exitPointerLock(); },
  onModeChange: renderInputMode,
  onCameraCycle: () => { cameraMode = nextCameraMode(cameraMode); }, storage: profileStorage });

async function captureMouse() {
  if (chatUI.mode === 'chat') return false;
  if (isTextEntry(document.activeElement)) document.activeElement.blur();
  try {
    if (!canvas.requestPointerLock) throw new Error('Pointer lock unavailable');
    await canvas.requestPointerLock();
    if (document.pointerLockElement === canvas) chatUI.onPointerLockChange(true);
    return true;
  } catch {
    startNote.textContent = 'Mouse capture was blocked. Click again, or open this page directly in a desktop browser.';
    if (chatUI.mode === 'ready') document.getElementById('resume-note').hidden = false;
    return false;
  }
}
startButton.addEventListener('click', captureMouse);
canvas.addEventListener('click', () => { if (!active && chatUI.mode !== 'chat') captureMouse(); });
document.addEventListener('pointerlockchange', () => chatUI.onPointerLockChange(document.pointerLockElement === canvas));
document.addEventListener('pointerlockerror', () => {
  startNote.textContent = 'Mouse capture was blocked. Click again, or open this page directly in a desktop browser.';
});
document.addEventListener('mousemove', event => {
  if (!active) return;
  yaw -= event.movementX * 0.002;
  pitch = THREE.MathUtils.clamp(pitch - event.movementY * 0.002, -Math.PI / 2 + 0.01, Math.PI / 2 - 0.01);
});
function releaseMouse() {
  chatUI.pause();
}
window.addEventListener('blur', releaseMouse);
document.addEventListener('visibilitychange', () => { if (document.hidden) releaseMouse(); });
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  emptyHand.camera.aspect = camera.aspect;
  emptyHand.camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
});

function animate(time) {
  const dt = previousTime === null ? 0 : (time - previousTime) / 1000;
  previousTime = time;
  if (active) {
    controller.update(dt, { yaw, pitch });
    if (controller.player.y < -32) controller.respawn(world.findSpawn(controller.size));
  }
  const p = controller.player;
  const position = controller.renderState();
  animatePlayerModel(playerModel, position, position.animation, cameraMode);
  updateEmptyHand(emptyHand, position.animation);
  updatePlayerCamera(camera, cameraMode, position, yaw, pitch, world);
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
  document.getElementById('speed-target').textContent = `Walk ${controller.effective.speed.toFixed(3)} / sprint ${(controller.effective.speed * 1.3).toFixed(3)}`;
  document.getElementById('player-dimensions').textContent = `Height ${(MOVEMENT.playerHeight * controller.size).toFixed(2)} m / size ${controller.size}`;
  document.getElementById('jump-target').textContent = `Target ${controller.effective.jump.toFixed(3)} m`;
  readouts.height.textContent = p.y.toFixed(3);
  if (p.lastJump) {
    readouts.apex.textContent = p.lastJump.height.toFixed(3);
    readouts.airtime.textContent = p.lastJump.airtime.toFixed(3);
  }
  if (active) status.textContent = p.grounded
    ? (p.sprinting ? 'SPRINTING' : (p.speed > 0.01 ? 'WALKING' : 'ON THE GROUND'))
    : (p.sprinting ? 'SPRINTING / AIRBORNE' : 'AIRBORNE');
  renderPlayerScene(renderer, scene, camera, emptyHand, cameraMode);
}
renderer.setAnimationLoop(animate);
