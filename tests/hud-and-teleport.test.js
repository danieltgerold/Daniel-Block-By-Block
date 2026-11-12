import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Window } from 'happy-dom';
import * as THREE from 'three';
import { GameplayHUD, coordinateText, roundCoordinate } from '../src/gameplay-hud.js';
import { ChatUI } from '../src/chat-ui.js';
import { MovementController } from '../src/movement.js';
import { VoxelWorld, playerBounds } from '../src/voxel-world.js';
import { updatePlayerCamera } from '../src/player-visuals.js';
import { EntityHitboxes } from '../src/entity-hitboxes.js';
import { ChunkRenderer } from '../src/chunk-renderer.js';

function fixture(t) {
  const window = new Window({ url: 'http://localhost:4173', settings: { disableJavaScriptEvaluation: true, disableJavaScriptFileLoading: true, disableCSSFileLoading: true } });
  window.document.write(readFileSync(new URL('../index.html', import.meta.url), 'utf8'));
  const document = window.document, storage = window.localStorage;
  storage.setItem('block-by-block.first-person-body', 'true');
  const controller = new MovementController(new VoxelWorld());
  const ui = new ChatUI({ document, window, controller, clearInput: () => controller.pause(), requestCapture: () => {}, requestUnlock: () => {}, storage });
  const hud = new GameplayHUD(document, storage);
  t.after(() => { hud.dispose(); ui.dispose(); window.happyDOM.abort(); window.close(); });
  return { window, document, storage, controller, ui, hud };
}
const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-8, `${a} != ${b}`);

test('coordinates and FPS default on, toggle independently and survive reload; old body preference is removed', t => {
  const f = fixture(t);
  assert.equal(f.document.getElementById('show-first-person-body'), null);
  assert.equal(f.storage.getItem('block-by-block.first-person-body'), null);
  const coordinates = f.document.getElementById('show-coordinates');
  const fps = f.document.getElementById('show-fps');
  assert.equal(coordinates.checked, true); assert.equal(fps.checked, true);
  const change = (input, checked) => { input.checked = checked; input.dispatchEvent(new f.window.Event('change')); };
  change(coordinates, false);
  assert.equal(f.hud.coordinates.hidden, true); assert.equal(f.hud.fps.hidden, false);
  f.hud.dispose();
  let reloaded = new GameplayHUD(f.document, f.storage);
  assert.equal(coordinates.checked, false); assert.equal(fps.checked, true);
  change(coordinates, true); change(fps, false);
  assert.equal(reloaded.coordinates.hidden, false); assert.equal(reloaded.fps.hidden, true);
  reloaded.dispose(); reloaded = new GameplayHUD(f.document, f.storage);
  assert.equal(coordinates.checked, true); assert.equal(fps.checked, false);
  reloaded.dispose();
});

test('feet coordinates round symmetrically across zero without changing precision; FPS averages real frame intervals', t => {
  const { hud } = fixture(t);
  for (const [input, expected] of [[-1.51, -2], [-1.5, -2], [-0.51, -1], [-0.5, -1], [-0.49, 0], [0, 0], [0.49, 0], [0.5, 1], [1.51, 2]]) {
    assert.equal(roundCoordinate(input), expected);
  }
  const feet = { x: -12.56789, y: 64.23456, z: 0.51 };
  hud.updatePosition(feet);
  assert.equal(coordinateText(feet), 'X: -13  Y: 64  Z: 1');
  assert.equal(feet.x, -12.56789); assert.equal(feet.y, 64.23456);
  for (let frame = 0; frame <= 31; frame++) hud.renderedFrame(frame * 1000 / 60, feet);
  assert.equal(hud.fps.textContent, 'FPS: 60');
  const last = 31 * 1000 / 60;
  for (let frame = 1; frame <= 10; frame++) hud.renderedFrame(last + frame * 1000 / 30, feet);
  assert.equal(hud.fps.textContent, 'FPS: 60'); // No instantaneous flicker.
  for (let frame = 11; frame <= 31; frame++) hud.renderedFrame(last + frame * 1000 / 30, feet);
  assert.equal(hud.fps.textContent, 'FPS: 30');
  hud.renderedFrame(100000, feet);
  assert.equal(hud.fps.textContent, 'FPS: 30'); // Suspended tabs excluded.
});

test('/tp accepts both formats and decimals, completes in chat, rejects bad input and clears motion/interpolation', t => {
  const { ui, controller } = fixture(t);
  ui.onPointerLockChange(true); ui.openChat('/');
  const input = ui.elements['chat-input'];
  input.value = '/t'; input.setSelectionRange(2, 2); ui.complete();
  assert.equal(input.value, '/tp ');
  ui.service.submit('/help');
  assert.match(ui.service.messages.at(-1).text, /\/tp <x> <y> <z> — Teleport feet/);
  controller.update(0.125, { forward: 1, sprint: true, jump: true });
  controller.setMining(true); controller.requestSwing(); controller.keyDown('KeyW');
  let teleports = 0;
  controller.onTeleport = () => teleports++;
  for (const [command, expected] of [['/tp -10.125 64.5 20.75', [-10.125, 64.5, 20.75]], ['/tp 10, 64, -20', [10, 64, -20]], ['/tp .5, -1, +.5', [0.5, -1, 0.5]], ['/tp 0 -64 0', [0, -64, 0]]]) {
    ui.service.submit(command);
    const p = controller.player, r = controller.renderState();
    assert.deepEqual([p.x, p.y, p.z], expected);
    assert.deepEqual([r.x, r.y, r.z], expected);
    assert.deepEqual([p.vx, p.vy, p.vz, controller.accumulator, p.fovMultiplier], [0, 0, 0, 0, 1]);
    assert.equal(controller.heldKeys.size, 0); assert.equal(controller.miningHeld, false);
    assert.equal(p.animation.swingAge, -1); assert.equal(p.jumpInProgress, false);
    assert.equal(ui.service.messages.at(-1).senderName, 'server');
    assert.match(ui.service.messages.at(-1).text, /^Teleported to /);
    if (p.y === -1) assert.equal(controller.world.intersectsPlayer(p), true);
  }
  assert.equal(teleports, 4);
  const before = controller.renderState();
  for (const command of ['/tp', '/tp 1 2', '/tp 1 2 3 4', '/tp NaN 2 3', '/tp Infinity 0 0', '/tp 1e309 0 0', '/tp 1,,2,3', '/tp 1,2,', '/tp a 0 0']) {
    ui.service.submit(command);
    assert.equal(ui.service.messages.at(-1).text, 'Usage: /tp <x> <y> <z>');
    assert.deepEqual(controller.renderState(), before);
  }
  assert.equal(teleports, 4);
});

test('teleport immediately supplies destination camera, collision outline and chunk loading in all views', t => {
  const { controller } = fixture(t);
  const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera(75, 1, .05, 500);
  const hitboxes = new EntityHitboxes(scene);
  const material = new THREE.MeshBasicMaterial();
  const chunks = new ChunkRenderer(controller.world, scene, material);
  t.after(() => { hitboxes.dispose(); chunks.dispose(); material.dispose(); });
  controller.configure('size', 2);
  let mode = 0, refreshes = 0;
  controller.onTeleport = () => {
    const feet = controller.renderState();
    updatePlayerCamera(camera, mode, feet, 0, -.2, controller.world);
    hitboxes.update([{ id: 'local', ...feet, local: true }], mode, true);
    chunks.update(camera); refreshes++;
  };
  for (mode = 0; mode < 3; mode++) {
    controller.update(.075, { forward: 1 });
    const position = { x: 2048.125 + mode * 1024, y: 3.25, z: -3072.5 };
    assert.equal(controller.teleport(position), true);
    const anchor = new THREE.Vector3(position.x, position.y + 3.24, position.z);
    near(camera.position.distanceTo(anchor), mode === 0 ? 0 : 8);
    assert.equal(controller.previous.x, position.x);
    if (mode !== 0) {
      const line = hitboxes.lines.get('local'), bounds = playerBounds(controller.player);
      assert.equal(line.visible, true);
      near(line.position.y, (bounds.min.y + bounds.max.y) / 2);
      near(line.position.x, position.x); near(line.position.z, position.z);
      near(line.scale.y, 3.6); near(line.scale.x, 1.2);
    }
    assert.ok(chunks.stats.loadedChunks > 0);
    for (const chunk of chunks.chunks.values()) assert.ok(Math.abs(chunk.mesh.position.x - position.x) < 208);
  }
  assert.equal(refreshes, 3);
});
