import * as THREE from 'three';
import { MovementController, MOVEMENT } from './movement.js';
import './style.css';

const canvas = document.querySelector('#world');
const intro = document.querySelector('#intro');
const startButton = document.querySelector('#start');
const startNote = document.querySelector('#start-note');
const crosshair = document.querySelector('#crosshair');
const playingHint = document.querySelector('#playing-hint');
const status = document.querySelector('#status');
const readouts = Object.fromEntries(['speed', 'height', 'apex', 'airtime'].map(id => [id, document.getElementById(id)]));
const controller = new MovementController();
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
scene.fog = new THREE.Fog('#c6dfe9', 35, 180);
const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.05, 500);
const baseFov = camera.fov;
camera.rotation.order = 'YXZ';

// One texture tile covers exactly 1 m². Mipmaps average subpixel lines instead
// of letting them flicker on/off; anisotropic filtering handles grazing angles.
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
gridTexture.repeat.set(512, 512);
gridTexture.minFilter = THREE.LinearMipmapLinearFilter;
gridTexture.magFilter = THREE.LinearFilter;
gridTexture.generateMipmaps = true;
gridTexture.anisotropy = renderer.capabilities.getMaxAnisotropy();
const material = new THREE.MeshBasicMaterial({ map: gridTexture, fog: true });
// Keep geometry and UV coordinates modest for precision. Shift only by whole
// meters, so the grid stays anchored in the world. Edges stay beyond the fog.
const floor = new THREE.Mesh(new THREE.PlaneGeometry(512, 512), material);
floor.rotation.x = -Math.PI / 2;
floor.updateMatrixWorld();
scene.add(floor);

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
  floor.position.set(Math.floor(position.x / 32) * 32, 0, Math.floor(position.z / 32) * 32);
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
