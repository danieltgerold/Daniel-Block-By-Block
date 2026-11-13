import test from 'node:test';
import assert from 'node:assert/strict';
import { Window } from 'happy-dom';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { ChatUI } from '../src/chat-ui.js';
import { ChatService, LocalPlayerProfile, validateName } from '../src/chat.js';
import { COMMANDS } from '../src/chat-commands.js';
import { DeveloperSequence } from '../src/developer-sequence.js';
import { MovementController } from '../src/movement.js';
import { DEFAULT_SETTINGS } from '../src/player-settings.js';
import { VoxelWorld } from '../src/voxel-world.js';
import { updatePlayerCamera, createPlayerModel, animatePlayerModel } from '../src/player-visuals.js';
import { createPlayerAnimation, interpolatePlayerAnimation } from '../src/player-animation.js';
const near = (a, b, eps = 1e-8) => assert.ok(Math.abs(a - b) < eps, `Expected ${b}, got ${a}`);
function service(world = new VoxelWorld()) {
  const controller = new MovementController(world);
  controller.respawn({ x: 0.5, y: 0, z: 0.5 });
  const profile = new LocalPlayerProfile(null, () => 'test-player');
  const chat = new ChatService({ profile, controller });
  return { controller, chat, world };
}
function dom(t) {
  const window = new Window({ url: 'http://localhost:4173', settings: { disableJavaScriptEvaluation: true, disableJavaScriptFileLoading: true, disableCSSFileLoading: true } });
  const document = window.document;
  document.write(readFileSync(new URL('../index.html', import.meta.url), 'utf8'));
  const { controller } = service();
  const ui = new ChatUI({ document, window, controller, clearInput: () => controller.pause(),
    requestCapture: () => {}, requestUnlock: () => {}, storage: window.localStorage });
  const key = (key, repeat = false) => {
    const event = new window.KeyboardEvent('keydown', { key, code: key === 'Tab' ? 'Tab' : '', repeat, bubbles: true, cancelable: true });
    (document.activeElement || document.body).dispatchEvent(event);
    return event;
  };
  const input = value => {
    const field = ui.elements['chat-input'];
    field.value = value; field.setSelectionRange(value.length, value.length);
    field.dispatchEvent(new window.Event('input', { bubbles: true }));
  };
  t.after(() => { ui.dispose(); window.happyDOM.abort(); window.close(); });
  return { ui, controller, key, input, document };
}

test('Tab completes prefixes and default arguments, shows/cycles multiple matches, and Enter submits', t => {
  const f = dom(t);
  f.ui.onPointerLockChange(true); f.ui.openChat('/');
  f.input('/rea'); f.key('Tab');
  assert.equal(f.ui.elements['chat-input'].value, '/reach ');
  f.key('Tab'); assert.equal(f.ui.elements['chat-input'].value, '/reach default');
  f.input('/reach d'); f.key('Tab');
  assert.equal(f.ui.elements['chat-input'].value, '/reach default');
  f.key('Enter');
  assert.equal(f.ui.mode, 'ready');
  f.ui.openChat('/'); f.input('/s'); f.key('Tab');
  assert.equal(f.ui.elements['chat-input'].value, '/speed ');
  assert.match(f.ui.elements['chat-completions'].textContent, /\/speed.*\/size/);
  f.key('Tab'); assert.equal(f.ui.elements['chat-input'].value, '/size ');
  f.key('Tab'); assert.equal(f.ui.elements['chat-input'].value, '/speed ');
  f.ui.service.submit('/help');
  for (const command of COMMANDS) assert.ok(f.ui.service.messages.at(-1).text.includes(command.name));
});

test('settings are independent, size two doubles effective values, and every default resets only its setting', () => {
  const { controller, chat } = service();
  for (const command of ['/speed 6', '/reach 8', '/jump 3', '/size 2']) chat.submit(command);
  assert.deepEqual(controller.settings, { speed: 6, reach: 8, jump: 3, size: 2 });
  assert.deepEqual(controller.effective, { speed: 12, reach: 16, jump: 6, size: 2 });
  assert.match(chat.messages.at(-1).text, /12.*16.*6/);
  controller.keyDown('KeyW');
  for (let i = 0; i < 100; i++) controller.update(0.05);
  const startZ = controller.player.z;
  for (let i = 0; i < 100; i++) controller.update(0.05);
  near((startZ - controller.player.z) / 5, 12);
  controller.pause();
  chat.submit('/speed default');
  assert.equal(controller.settings.speed, DEFAULT_SETTINGS.speed); assert.equal(controller.settings.reach, 8);
  chat.submit('/reach default'); assert.equal(controller.settings.reach, DEFAULT_SETTINGS.reach); assert.equal(controller.settings.jump, 3);
  chat.submit('/jump default'); assert.equal(controller.settings.jump, DEFAULT_SETTINGS.jump); assert.equal(controller.size, 2);
  chat.submit('/size default'); assert.deepEqual(controller.settings, DEFAULT_SETTINGS);
  for (const [command, setting, minimum, maximum] of [['/speed 256', 'speed', 0, 255], ['/reach -1', 'reach', 0, 255], ['/jump 256', 'jump', 0, 255], ['/size 5', 'size', 0.1, 4]]) {
    const before = { ...controller.settings };
    chat.submit(command);
    assert.deepEqual(controller.settings, before);
    assert.ok(chat.messages.at(-1).text.includes(`between ${minimum} and ${maximum}`));
  }
  for (const key of ['speed', 'reach', 'jump']) chat.submit(`/${key} 0`);
  controller.keyDown('KeyW'); controller.keyDown('Space'); controller.update(0.1);
  near(controller.player.speed, 0); assert.equal(controller.player.jumpCount, 0);
  assert.equal(controller.targetBlock(controller.player, 0, -1), null);
});

test('scaled hitbox rejects low-ceiling growth and prevents placing inside the larger player', () => {
  const { controller, chat, world } = service();
  world.setBlock(0, 2, 0, true);
  chat.submit('/size 2');
  assert.equal(controller.size, 1); assert.match(chat.messages.at(-1).text, /intersect/);
  chat.submit('/size .5'); assert.equal(controller.size, 0.5);
  near(world.movePlayer(controller.player, { x: 0, y: 2, z: 0 }).y, 1.1);
  world.setBlock(0, 2, 0, false);
  chat.submit('/size 2'); assert.equal(controller.size, 2);
  assert.equal(world.canPlaceBlock(1, 0, 0, [controller.player]), false);
  world.setBlock(2, 0, 0, true);
  near(world.movePlayer(controller.player, { x: 20, y: 0, z: 0 }).x, 1.4);
  const model = createPlayerModel();
  const animation = createPlayerAnimation();
  animatePlayerModel(model, controller.renderState(), interpolatePlayerAnimation(animation, animation, 0), 1);
  near(model.scale.x, 2); near(model.scale.y, 2); near(model.scale.z, 2);
});

test('size scales the eye and reach in every F5 mode and targeting stays eye-based', () => {
  const { controller, chat, world } = service();
  chat.submit('/size 2');
  world.setBlock(0, 3, -8, true);
  const ray = controller.interactionRay(controller.player, 0, 0);
  near(ray.origin.y, 3.24); near(ray.reach, 9);
  for (const mode of [0, 1, 2]) {
    const camera = new THREE.PerspectiveCamera();
    updatePlayerCamera(camera, mode, controller.renderState(), 0, 0, world);
    near(camera.position.y, 3.24);
    assert.equal(controller.targetBlock(controller.renderState(), 0, 0).z, -8);
  }
});

test('jump command matches actual tick apex and size doubles height without changing flight duration', () => {
  const results = [];
  for (const size of [1, 2]) {
    const { controller, chat } = service();
    chat.submit('/jump 3'); chat.submit(`/size ${size}`);
    controller.keyDown('Space'); controller.update(0.05); controller.keyUp('Space');
    for (let i = 0; i < 100 && !controller.player.lastJump; i++) controller.update(0.05);
    assert.ok(controller.player.lastJump);
    near(controller.player.lastJump.height, 3 * size);
    results.push(controller.player.lastJump);
  }
  assert.equal(results[0].ticks, results[1].ticks);
});

test('developer sequence works in a text field, consumes final Enter, bypasses caps and rejects overflow', t => {
  const f = dom(t);
  f.ui.service.submit('/speed 300');
  near(f.controller.walkSpeed, DEFAULT_SETTINGS.speed);
  assert.match(f.ui.service.messages.at(-1).text, /0 and 255/);
  f.ui.elements['player-name'].focus();
  const keys = ['ArrowUp', 'ArrowUp', 'ArrowDown', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'ArrowLeft', 'ArrowRight', 'B', 'A', 'Enter'];
  let final;
  for (const key of keys) final = f.key(key);
  assert.equal(final.defaultPrevented, true);
  assert.equal(f.controller.developerMode, true);
  assert.equal(f.ui.profile.player.displayName, 'player1');
  assert.equal(f.ui.service.messages.at(-1).text, 'You have entered developer mode.');
  assert.equal(f.document.getElementById('start-note').textContent, '<server>: You have entered developer mode.');
  for (const command of ['/speed 300', '/reach 300', '/jump 300', '/size 5']) f.ui.service.submit(command);
  assert.deepEqual(f.controller.settings, { speed: 300, reach: 300, jump: 300, size: 5 });
  const before = { ...f.controller.settings };
  f.ui.service.submit('/size 1e308');
  assert.match(f.ui.service.messages.at(-1).text, /overflow/);
  assert.deepEqual(f.controller.settings, before);
  assert.equal(new MovementController().developerMode, false);
});

test('developer sequence ignores repeat but resets on wrong keys and the 60-second timeout', () => {
  let time = 0;
  const detector = new DeveloperSequence({ now: () => time });
  detector.feed({ key: 'ArrowUp' }); detector.feed({ key: 'ArrowUp', repeat: true });
  assert.equal(detector.index, 1);
  detector.feed({ key: 'x' }); assert.equal(detector.index, 0);
  detector.feed({ key: 'ArrowUp' }); time = 60_001;
  detector.feed({ key: 'ArrowDown' }); assert.equal(detector.index, 0);
});

test('fast movement still hits a one-block wall and long reach queries stay sparse', () => {
  const { controller, world } = service();
  controller.enableDeveloperMode(); controller.configure('speed', 1000);
  for (let y = 0; y < 2; y++) world.setBlock(5, y, 0, true);
  controller.keyDown('KeyD'); controller.update(0.1);
  near(controller.player.x, 4.7);
  assert.equal(world.raycast({ x: 0.5, y: 1.6, z: 0.5 }, { x: 0, y: 1, z: 0 }, 1e6), null);
});

test('names allow at most 16 letters/numbers and reject spaces and reserved names', () => {
  assert.equal(validateName('A'.repeat(16)).ok, true);
  assert.equal(validateName('A'.repeat(17)).ok, false);
  assert.equal(validateName('Abc 123').ok, false);
  assert.equal(validateName('player_name').ok, false);
  assert.equal(validateName(' SERVER ').ok, false);
});
