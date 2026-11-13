import * as THREE from 'three';
import { MovementController } from './movement.js';
import { VoxelWorld } from './voxel-world.js';
import { ChunkRenderer } from './chunk-renderer.js';
import { EntityHitboxes } from './entity-hitboxes.js';
import { GameplayHUD } from './gameplay-hud.js';
import { BlockPlacement, bindPlacementInput } from './block-placement.js';
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
const world = new VoxelWorld();
const controller = new MovementController(world);
controller.respawn(world.findSpawn());
let yaw = 0;
let pitch = -0.12;
let active = false;
let previousTime = null;
let cameraMode = 0;
let hitboxesVisible = false;
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
const hitboxes = new EntityHitboxes(scene);
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

function breakBlock(feet = controller.renderState()) {
  const hit = targetBlock(feet);
  if (!hit) return false;
  const { x, y, z } = hit;
  const changed = world.setBlock(x, y, z, false);
  if (changed) chunks.invalidateBlock(x, z);
  return changed;
}
const placement = new BlockPlacement({ controller, world, getAim: () => ({ yaw, pitch }),
  canInteract: () => active && document.pointerLockElement === canvas && document.hasFocus() && !document.hidden,
  onPlace: (x, y, z) => chunks.invalidateBlock(x, z) });
bindPlacementInput(placement, canvas, document, window);
controller.onTick = player => {
  if (player.animation.swingStartedThisTick && (controller.miningHeld || primaryClickQueued)) {
    breakBlock(player);
  }
  primaryClickQueued = false;
  placement.tick();
};
canvas.addEventListener('mousedown', event => {
  // The click that captures the mouse does not also break a block.
  if (!active || event.button !== 0) return;
  event.preventDefault();
  if (event.button === 0) {
    primaryClickQueued = true;
    controller.setMining(true);
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
  document.body.classList.toggle('world-view', mode !== 'menu');
  hud.root.hidden = mode === 'menu';
  previousTime = null;
}

let profileStorage = null;
try { profileStorage = window.localStorage; } catch { /* Session identity still works without browser storage. */ }
const hud = new GameplayHUD(document, profileStorage);
const chatUI = new ChatUI({ document, window, controller, clearInput, requestCapture: captureMouse,
  requestUnlock: () => { if (document.pointerLockElement === canvas) document.exitPointerLock(); },
  onModeChange: renderInputMode,
  onCameraCycle: () => { cameraMode = nextCameraMode(cameraMode); },
  onHitboxToggle: () => { hitboxesVisible = !hitboxesVisible; }, storage: profileStorage });
controller.onTeleport = () => {
  primaryClickQueued = false;
  previousTime = null;
  refreshWorldView();
};

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
    const previousY = controller.player.y;
    controller.update(dt, { yaw, pitch });
    // Keep explicit teleports below the void boundary; respawn ordinary falls
    // when they cross that boundary from above.
    if (previousY >= -32 && controller.player.y < -32) controller.respawn(world.findSpawn(controller.size));
  }
  const position = refreshWorldView();
  chatUI.updateVisibility();
  renderPlayerScene(renderer, scene, camera, emptyHand, cameraMode);
  hud.renderedFrame(time, position);
}

function refreshWorldView() {
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
  hitboxes.update([{ id: chatUI.profile.player.id, ...position, local: true }], cameraMode, hitboxesVisible);
  hud.updatePosition(position);
  return position;
}
renderer.setAnimationLoop(animate);
