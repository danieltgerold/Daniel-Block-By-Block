import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Window } from 'happy-dom';
import { BlockPlacement, bindPlacementInput } from '../src/block-placement.js';
import { MovementController } from '../src/movement.js';
import { VoxelWorld } from '../src/voxel-world.js';
import { ChatUI } from '../src/chat-ui.js';

function fixture() {
  const world = new VoxelWorld(), controller = new MovementController(world);
  world.setBlock(0, 1, 0, true);
  controller.respawn({ x: 4.5, y: 0, z: .5 });
  let playing = true, aim = { yaw: Math.PI / 2, pitch: 0 }, swings = 0, attempts = 0;
  const placed = [];
  const requestSwing = controller.requestSwing.bind(controller);
  controller.requestSwing = () => { swings++; requestSwing(); };
  const targetBlock = controller.targetBlock.bind(controller);
  controller.targetBlock = (...args) => { attempts++; return targetBlock(...args); };
  const placement = new BlockPlacement({ controller, world, getAim: () => aim,
    canInteract: () => playing, onPlace: (x, y, z) => placed.push([x, y, z]) });
  controller.onTick = () => placement.tick();
  return { world, controller, placement, placed, swings: () => swings, attempts: () => attempts,
    aim: value => { aim = value; }, playing: value => { playing = value; } };
}

test('press places immediately; each tick recasts against newly placed faces and current aim', () => {
  const f = fixture();
  assert.equal(f.placement.press(), true);
  assert.deepEqual(f.placed, [[1, 1, 0]]);
  assert.equal(f.controller.totalSteps, 0);
  assert.equal(f.placement.press(), false, 'Duplicate down does not place twice');
  f.controller.update(.1);
  assert.deepEqual(f.placed, [[1, 1, 0], [2, 1, 0], [3, 1, 0]]);
  assert.equal(f.attempts(), 3);
  assert.equal(f.swings(), 3);
  f.controller.update(.05);
  assert.equal(f.placed.length, 3, 'Next block would intersect the live player');
  f.aim({ yaw: 0, pitch: -Math.PI / 4 });
  f.controller.update(.05);
  assert.deepEqual(f.placed.at(-1), [4, 0, -2], 'Aim changes during the same hold');
  assert.equal(f.swings(), 4);
});

test('each attempt obeys live reach and the scaled crouching hitbox; failures make no edits or swings', () => {
  const f = fixture();
  f.controller.configure('reach', 3.49);
  assert.equal(f.placement.press(), false);
  assert.equal(f.placed.length, 0); assert.equal(f.swings(), 0);
  f.controller.configure('reach', 3.5);
  f.controller.update(.05);
  assert.equal(f.placed.length, 1, 'A failed press keeps trying with the updated reach');
  f.controller.configure('size', 2);
  f.controller.player.crouching = true;
  // Keep the eye aimed into the row while checking the larger collision box.
  f.controller.player.x = 3.5;
  f.controller.player.eyeOffset = 1.27 * 2;
  f.aim({ yaw: Math.PI / 2, pitch: Math.atan2(1.5 - 2.54, 1.5) });
  const before = [...f.world.edits()];
  assert.equal(f.placement.attempt(), false, 'Size-two body overlaps the next destination');
  assert.deepEqual([...f.world.edits()], before);
  assert.equal(f.swings(), 1);
  f.aim({ yaw: 0, pitch: Math.PI / 2 });
  assert.equal(f.placement.attempt(), false, 'No target leaves the world unchanged');
  assert.deepEqual([...f.world.edits()], before);
  assert.equal(f.swings(), 1);
});

test('walking and sprinting build continuous rows with identical tick attempts across render frame rates', () => {
  function run(fps, sprint) {
    const f = fixture();
    for (let z = -50; z < 1; z++) f.world.setBlock(0, 1, z, true);
    f.placement.press();
    for (let frame = 0; frame < 3 * fps; frame++) {
      f.controller.update(1 / fps, { right: 1, yaw: Math.PI / 2, pitch: 0,
        // Sprint diagonally into the wall while sliding along it. Aim and
        // movement share the same yaw, as they do during normal gameplay.
        ...(sprint ? { forward: 1, sprint: true } : {}) });
    }
    assert.equal(f.attempts(), 61, 'Immediate press plus one attempt per physics tick');
    assert.ok(f.placed.length > 20);
    assert.equal(f.swings(), f.placed.length);
    assert.ok(f.placed.some(([x, , z]) => x === 1 && z < -8));
    return f.placed;
  }
  for (const sprint of [false, true]) {
    const reference = run(20, sprint);
    for (const fps of [5, 60, 144]) assert.deepEqual(run(fps, sprint), reference);
  }
});

test('mouse release, chat, menu, blur and unlock cancel a hold and require a new press; context menu is suppressed during play', t => {
  const f = fixture();
  const window = new Window({ url: 'http://localhost:4173', settings: { disableJavaScriptEvaluation: true, disableJavaScriptFileLoading: true, disableCSSFileLoading: true } });
  const document = window.document;
  document.write(readFileSync(new URL('../index.html', import.meta.url), 'utf8'));
  const canvas = document.getElementById('world');
  const detach = bindPlacementInput(f.placement, canvas, document, window);
  const ui = new ChatUI({ document, window, controller: f.controller, storage: window.localStorage,
    clearInput: () => f.controller.pause(), requestCapture: () => {}, requestUnlock: () => {},
    onModeChange: mode => f.playing(mode === 'playing') });
  t.after(() => { detach(); ui.dispose(); window.happyDOM.abort(); window.close(); });
  const mouse = (target, name) => {
    const event = new window.MouseEvent(name, { button: 2, bubbles: true, cancelable: true });
    target.dispatchEvent(event); return event;
  };
  const stops = [
    () => mouse(document, 'mouseup'),
    () => ui.openChat(),
    () => ui.pause(),
    () => window.dispatchEvent(new window.Event('blur')),
    () => document.dispatchEvent(new window.Event('pointerlockchange')),
  ];
  for (const stop of stops) {
    ui.onPointerLockChange(true);
    mouse(canvas, 'mousedown');
    assert.equal(f.controller.placementHeld, true);
    stop();
    assert.equal(f.controller.placementHeld, false);
    ui.pause(); ui.onPointerLockChange(true);
    const count = f.attempts();
    f.controller.update(.15);
    assert.equal(f.attempts(), count, 'Returning alone never resumes the old hold');
  }
  ui.onPointerLockChange(true);
  assert.equal(mouse(canvas, 'contextmenu').defaultPrevented, true);
  ui.pause();
  assert.equal(mouse(canvas, 'contextmenu').defaultPrevented, false);
  mouse(canvas, 'mousedown');
  assert.equal(f.controller.placementHeld, false, 'Capturing or clicking a menu is not a placement');
});
