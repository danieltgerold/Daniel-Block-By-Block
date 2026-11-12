import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Window } from 'happy-dom';
import { ChatUI } from '../src/chat-ui.js';
import { ChatService, PlayerDirectory, LocalPlayerProfile, PROFILE_STORAGE_KEY, SERVER_ID } from '../src/chat.js';
import { MovementController, DEFAULT_WALK_SPEED } from '../src/movement.js';
import { VoxelWorld } from '../src/voxel-world.js';

const near = (a, b, epsilon = 1e-8) => assert.ok(Math.abs(a - b) < epsilon, `Expected ${b}, got ${a}`);
const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
function memoryStorage() {
  const entries = new Map();
  return { getItem: key => entries.get(key) ?? null, setItem: (key, value) => entries.set(key, value) };
}
function fixture(t, { captureSucceeds = false } = {}) {
  const window = new Window({ url: 'http://localhost:4173', settings: {
    disableJavaScriptEvaluation: true, disableJavaScriptFileLoading: true, disableCSSFileLoading: true } });
  window.document.write(html);
  const document = window.document;
  const controller = new MovementController(new VoxelWorld());
  const calls = { capture: 0, unlock: 0, camera: 0, broadcast: [] };
  const ui = new ChatUI({ document, window, controller, storage: window.localStorage, createId: () => 'player-id-1',
    clearInput: () => controller.pause(), requestCapture: () => {
      calls.capture++;
      if (captureSucceeds) ui.onPointerLockChange(true);
    }, requestUnlock: () => { calls.unlock++; },
    onCameraCycle: () => { calls.camera++; },
    onModeChange: mode => { document.getElementById('intro').hidden = mode !== 'menu'; },
    broadcast: message => calls.broadcast.push(message),
  });
  function key(key, code, options = {}) {
    const event = new window.KeyboardEvent('keydown', { key, code, bubbles: true, cancelable: true, ...options });
    (document.activeElement || document.body).dispatchEvent(event);
    return event;
  }
  function frames(count = 10) { for (let i = 0; i < count; i++) if (ui.mode === 'playing') controller.update(0.05); }
  function submitName(value) {
    const field = document.getElementById('player-name');
    field.focus(); field.value = value;
    document.getElementById('name-form').dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }));
  }
  function play() { document.activeElement?.blur(); ui.onPointerLockChange(true); }
  function command(text) {
    play(); key('/', 'Slash');
    assert.equal(ui.elements['chat-input'].value, '/');
    ui.elements['chat-input'].value = text;
    key('Enter', 'Enter');
  }
  t.after(() => { ui.dispose(); window.happyDOM.abort(); window.close(); });
  return { window, document, ui, controller, calls, key, frames, submitName, play, command };
}

test('names trim, persist only accepted values, preserve stable identity and reserve server in any case', () => {
  const storage = memoryStorage();
  const profile = new LocalPlayerProfile(storage, () => 'stable-id');
  assert.equal(profile.player.displayName, 'player 1');
  assert.equal(profile.rename('  Alice  ').ok, true);
  assert.equal(profile.player.displayName, 'Alice');
  const saved = storage.getItem(PROFILE_STORAGE_KEY);
  for (const name of ['', ' \t ', 'server', 'SERVER', ' SeRvEr ']) {
    assert.equal(profile.rename(name).ok, false);
    assert.equal(profile.player.displayName, 'Alice');
    assert.equal(storage.getItem(PROFILE_STORAGE_KEY), saved);
  }
  const reload = new LocalPlayerProfile(storage, () => 'must-not-replace-id');
  assert.deepEqual(reload.player, { id: 'stable-id', displayName: 'Alice' });
});

test('directory enforces case-insensitive join and rename uniqueness and allocates numbered defaults', () => {
  const directory = new PlayerDirectory();
  assert.equal(directory.join('one').player.displayName, 'player 1');
  assert.equal(directory.join('two').player.displayName, 'player 2');
  assert.equal(directory.join('three', ' PLAYER 1 ').ok, false);
  assert.equal(directory.join('three', 'SERVER').ok, false);
  assert.equal(directory.join('three').player.displayName, 'player 3');
  assert.equal(directory.rename('two', 'Player 1').ok, false);
  assert.equal(directory.rename('one', 'PLAYER 1').ok, true, 'Owner can change display casing');
  assert.equal(directory.players.get('two').displayName, 'player 2');
  directory.rename('one', 'Alice');
  assert.equal(directory.join('four').player.displayName, 'player 1', 'First available numbered default is reused');
});

test('Escape menu name form validates beside the field and typing never reaches game keys', t => {
  const f = fixture(t);
  assert.equal(f.ui.elements['player-name'].value, 'player 1');
  f.submitName('  Local Player  ');
  assert.equal(f.ui.profile.player.displayName, 'Local Player');
  assert.equal(f.ui.elements['name-error'].textContent, '');
  for (const value of [' ', ' SERVER ']) {
    f.submitName(value);
    assert.ok(f.ui.elements['name-error'].textContent.length > 0);
    assert.equal(f.ui.elements['player-name'].getAttribute('aria-invalid'), 'true');
    assert.equal(f.ui.profile.player.displayName, 'Local Player');
  }
  for (const [key, code] of [['w', 'KeyW'], ['t', 'KeyT'], ['/', 'Slash'], [' ', 'Space'], ['F5', 'F5']]) {
    const event = f.key(key, code);
    if (code === 'F5') assert.equal(event.defaultPrevented, true);
  }
  assert.equal(f.ui.mode, 'menu');
  assert.equal(f.controller.heldKeys.size, 0);
  assert.equal(f.calls.camera, 0);
});

test('T opens focused empty chat, clears held movement/mining, and typing cannot move or change view', t => {
  const f = fixture(t);
  f.play(); f.key('w', 'KeyW'); f.key('Shift', 'ShiftLeft'); f.controller.setMining(true); f.frames();
  const before = { ...f.controller.player };
  assert.ok(before.speed > 0);
  const event = f.key('t', 'KeyT');
  assert.equal(event.defaultPrevented, true);
  assert.equal(f.ui.mode, 'chat');
  assert.equal(f.document.activeElement, f.ui.elements['chat-input']);
  assert.equal(f.ui.elements['chat-input'].value, '');
  assert.equal(f.controller.heldKeys.size, 0);
  assert.equal(f.controller.miningHeld, false);
  assert.equal(f.controller.player.sprinting, false);
  f.ui.onPointerLockChange(false); // Native unlock caused by opening chat.
  assert.equal(f.ui.mode, 'chat');
  for (const [key, code] of [['w', 'KeyW'], ['a', 'KeyA'], ['s', 'KeyS'], ['d', 'KeyD'], [' ', 'Space'], ['F5', 'F5']]) {
    const event = f.key(key, code);
    if (code === 'F5') assert.equal(event.defaultPrevented, true);
  }
  f.frames(20);
  assert.equal(f.controller.heldKeys.size, 0);
  near(f.controller.player.x, before.x); near(f.controller.player.z, before.z);
  assert.equal(f.calls.camera, 0);
  assert.equal(f.document.getElementById('intro').hidden, true);
});

test('slash opens with exactly one slash, and Enter submits a private command instead of chat', t => {
  const f = fixture(t);
  f.play();
  assert.equal(f.key('/', 'Slash').defaultPrevented, true);
  assert.equal(f.ui.elements['chat-input'].value, '/');
  f.ui.elements['chat-input'].value += 'help';
  f.key('Enter', 'Enter');
  assert.equal(f.ui.mode, 'ready');
  assert.equal(f.ui.elements['chat-input'].value, '');
  assert.equal(f.calls.capture, 1);
  assert.equal(f.ui.service.messages.length, 1);
  const reply = f.ui.service.messages[0];
  assert.equal(reply.senderId, SERVER_ID);
  assert.equal(reply.senderName, 'server');
  assert.equal(reply.recipientId, f.ui.profile.player.id);
  assert.match(reply.text, /\/speed.*default/);
  assert.equal(f.calls.broadcast.length, 0);
  assert.equal(f.ui.elements['chat-log'].querySelector('.chat-server').textContent, 'server');
});

test('Enter displays literal player text with a distinct sender and keeps recent messages after closing', t => {
  const f = fixture(t);
  f.play(); f.key('t', 'KeyT');
  f.ui.elements['chat-input'].value = 'hi';
  f.key('Enter', 'Enter');
  assert.equal(f.ui.elements['chat-log'].textContent, '<player 1>: hi');
  assert.equal(f.ui.elements['chat-log'].querySelector('.chat-sender').textContent, 'player 1');
  assert.equal(f.ui.elements['chat-form'].hidden, true);
  assert.equal(f.ui.elements['chat-panel'].hidden, false);
  assert.equal(f.calls.broadcast.length, 1);
  f.play(); f.key('t', 'KeyT');
  f.ui.elements['chat-input'].value = '<img src=x onerror=alert(1)><script>oops</script>';
  f.key('Enter', 'Enter');
  assert.match(f.ui.elements['chat-log'].textContent, /<img src=x/);
  assert.equal(f.ui.elements['chat-log'].querySelector('img,script'), null);
  assert.equal(f.ui.service.messages.length, 2);
  f.play(); f.key('Escape', 'Escape');
  assert.equal(f.ui.elements['chat-panel'].hidden, true, 'History must not cover pause-menu controls');
  f.play();
  assert.equal(f.ui.elements['chat-panel'].hidden, false, 'History returns when gameplay resumes');
});

test('Escape discards chat without opening pause, late unlock stays ready, and mouse look can resume', t => {
  const f = fixture(t);
  f.play(); f.key('t', 'KeyT');
  f.ui.elements['chat-input'].value = 'discard this';
  f.key('Escape', 'Escape');
  assert.equal(f.ui.mode, 'ready');
  assert.equal(f.ui.elements['chat-input'].value, '');
  assert.equal(f.ui.service.messages.length, 0);
  assert.equal(f.document.getElementById('intro').hidden, true);
  f.ui.onPointerLockChange(false); // Late native event must not open the menu.
  assert.equal(f.ui.mode, 'ready');
  assert.equal(f.ui.elements['resume-note'].hidden, false);
  f.ui.elements['resume-note'].click();
  assert.equal(f.calls.capture, 2);
  f.play(); f.key('w', 'KeyW'); f.frames();
  assert.ok(f.controller.player.z < 0);
  f.key('Escape', 'Escape');
  assert.equal(f.ui.mode, 'menu', 'Outside chat, Escape retains pause-menu behavior');
});

test('blank Enter closes without delivering anything, and repeat Enter cannot double submit', t => {
  const f = fixture(t, { captureSucceeds: true });
  f.play(); f.key('t', 'KeyT'); f.ui.elements['chat-input'].value = ' \t ';
  f.key('Enter', 'Enter');
  assert.equal(f.ui.service.messages.length, 0);
  assert.equal(f.ui.mode, 'playing');
  f.key('t', 'KeyT'); f.ui.elements['chat-input'].value = 'once'; f.key('Enter', 'Enter');
  f.key('Enter', 'Enter', { repeat: true });
  assert.equal(f.ui.service.messages.length, 1);
});

function measuredWalk(controller, { sprint = false } = {}) {
  controller.pause(); controller.keyDown('KeyW');
  if (sprint) controller.keyDown('ShiftLeft');
  for (let i = 0; i < 100; i++) controller.update(0.05);
  const start = controller.player.z;
  for (let i = 0; i < 100; i++) controller.update(0.05);
  return (start - controller.player.z) / 5;
}

test('/speed 6 changes actual walking to 6, sprint to 7.8, and /speed default restores normal movement', t => {
  const f = fixture(t);
  f.command('/speed 6');
  near(f.controller.walkSpeed, 6);
  near(measuredWalk(f.controller), 6);
  near(measuredWalk(f.controller, { sprint: true }), 7.8);
  f.command('/speed default');
  near(f.controller.walkSpeed, DEFAULT_WALK_SPEED);
  near(measuredWalk(f.controller), 4.317180616740089);
  assert.equal(f.calls.broadcast.length, 0);
  assert.ok(f.ui.service.messages.every(message => message.senderName === 'server' && message.recipientId === 'player-id-1'));
});

test('speed accepts positive decimals; invalid arguments and unknown commands explain /help without changing speed', t => {
  const f = fixture(t);
  for (const [text, value] of [['/speed 6.25', 6.25], ['/speed .5', 0.5], ['/speed +1.5', 1.5]]) {
    f.command(text); near(f.controller.walkSpeed, value);
  }
  for (const text of ['/speed', '/speed 256', '/speed -1', '/speed Infinity', '/speed NaN', '/speed 1e999', '/speed nope', '/speed 1 2', '/speed 0x10', '/unknown']) {
    f.command(text);
    near(f.controller.walkSpeed, 1.5);
    assert.match(f.ui.service.messages.at(-1).text, /\/help/);
  }
  assert.equal(f.calls.broadcast.length, 0);
});

test('single delivery path rejects another player’s private replies and broadcasts only outgoing public chat', () => {
  const profile = new LocalPlayerProfile(memoryStorage(), () => 'local');
  const broadcast = [];
  const service = new ChatService({ profile, controller: new MovementController(), broadcast: m => broadcast.push(m) });
  assert.equal(service.deliver({ senderId: SERVER_ID, senderName: 'server', text: 'not yours', recipientId: 'other' }), false);
  assert.equal(service.messages.length, 0);
  service.submit('hi');
  service.submit('/help');
  service.deliver({ senderId: 'other', senderName: 'player 2', text: 'hello', recipientId: null });
  assert.equal(service.messages.length, 3);
  assert.equal(broadcast.length, 1, 'Incoming messages and private command replies are never rebroadcast');
  assert.equal(broadcast[0].senderId, 'local');
});
