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
  controller.respawn({ x: 5.5, y: 0, z: .5 });
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

test('press places immediately but the near side stays three blocks away; holding uses fresh aim', () => {
  const f = fixture();
  assert.equal(f.placement.press(), true);
  assert.deepEqual(f.placed, [[1, 1, 0]]);
  assert.equal(f.controller.totalSteps, 0);
  assert.equal(f.placement.press(), false, 'Duplicate down does not place twice');
  f.controller.update(.1);
  assert.deepEqual(f.placed, [[1, 1, 0]]);
  assert.equal(f.attempts(), 3);
  assert.equal(f.swings(), 1);
  f.controller.update(.05);
  assert.equal(f.placed.length, 1, 'Next block would be less than three blocks from the eye');
  f.aim({ yaw: 0, pitch: -Math.atan2(1.62, 4) });
  f.controller.update(.05);
  assert.deepEqual(f.placed.at(-1), [5, 0, -4], 'Aim changes during the same hold');
  assert.equal(f.swings(), 2);
});

test('each attempt obeys live reach and the scaled crouching hitbox; failures make no edits or swings', () => {
  const f = fixture();
  f.controller.configure('reach', 4.49);
  assert.equal(f.placement.press(), false);
  assert.equal(f.placed.length, 0); assert.equal(f.swings(), 0);
  f.controller.configure('reach', 4.5);
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

test('retreating faster ramps up placement, catches up in one tick and preserves the three-block gap', () => {
  function run(fps, speed) {
    const f = fixture();
    f.controller.configure('reach', 10);
    f.controller.configure('speed', speed);
    let maximumPerTick = 0;
    f.controller.onTick = () => {
      const before = f.placed.length;
      f.placement.tick();
      maximumPerTick = Math.max(maximumPerTick, f.placed.length - before);
      for (const [x] of f.placed) assert.ok(f.controller.player.x - x - 1 >= 3 - 1e-7);
    };
    f.placement.press();
    for (let frame = 0; frame < fps; frame++) {
      f.controller.update(1 / fps, { forward: -1, yaw: Math.PI / 2, pitch: 0 });
    }
    assert.equal(f.swings(), f.placed.length);
    const nearest = f.controller.player.x - f.placed.at(-1)[0] - 1;
    assert.ok(nearest >= 3 && nearest < 4);
    return { placed: f.placed, maximumPerTick };
  }
  const slow = run(20, 6), fast = run(20, 40);
  assert.ok(fast.maximumPerTick > slow.maximumPerTick);
  assert.ok(fast.placed.length > slow.placed.length);
  assert.deepEqual(run(60, 40), fast);
  const f = fixture();
  f.controller.configure('reach', 10);
  f.placement.press();
  f.controller.player.x += 3;
  f.placement.tick();
  assert.deepEqual(f.placed, [[1, 1, 0], [2, 1, 0], [3, 1, 0], [4, 1, 0]]);
  for (const [x] of f.placed) {
    assert.ok(f.controller.player.x - x - 1 >= 3);
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
