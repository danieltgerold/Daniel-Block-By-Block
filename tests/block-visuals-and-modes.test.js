import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { Window } from 'happy-dom';
import { MovementController } from '../src/movement.js';
import { VoxelWorld } from '../src/voxel-world.js';
import { BlockPlacement, breakTargetBlock } from '../src/block-placement.js';
import { ChatService, LocalPlayerProfile } from '../src/chat.js';
import { ChunkRenderer } from '../src/chunk-renderer.js';
import { createPlayerModel, animatePlayerModel, syncEquipment, createEmptyHand, updateEmptyHand, createBlockItem, MODEL_SCALE } from '../src/player-visuals.js';
import { getBlockAssets } from '../src/block-assets.js';
import { TEST_BLOCK_ICON } from '../src/block-appearance.js';
import { drawStack } from '../src/inventory-ui.js';
import { DroppedItemRenderer, droppedCubeCount, PILE_OFFSETS } from '../src/dropped-item-renderer.js';
const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-8, `${a} != ${b}`);
const block = count => ({ id: 'test.block', count });
function setup() {
  const world = new VoxelWorld({ depth: 0 }), controller = new MovementController(world);
  controller.inventory.insert('test.block', 10);
  let aim = { yaw: Math.PI / 2, pitch: 0 }, swings = 0;
  const swing = controller.requestSwing.bind(controller);
  controller.requestSwing = () => { swings++; swing(); };
  const placement = new BlockPlacement({ controller, world, getAim: () => aim, canInteract: () => true });
  return { world, controller, placement, aim: value => { aim = value; }, swings: () => swings };
}

test('eye ray places on all six entered faces, including negative coordinates and chunk boundaries', () => {
  for (const cell of [[0, 0, 0], [-17, -3, 15]]) for (const normal of [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]]) {
    const f = setup(); f.world.setBlock(...cell, true);
    const eye = cell.map((c, i) => c + .5 + normal[i] * 3.7);
    f.controller.teleport({ x: eye[0], y: eye[1] - 1.62, z: eye[2] });
    f.aim({ yaw: Math.atan2(normal[0], normal[2]), pitch: Math.asin(-normal[1]) });
    assert.equal(f.placement.attempt(), true);
    assert.equal(f.world.hasBlock(...cell.map((c, i) => c + normal[i])), true);
    assert.equal(f.controller.inventory.mainHand.count, 9); assert.equal(f.swings(), 1);
  }
});

test('close placement works, overlap fails, exact hitbox touching succeeds, and reach/mining/empty main hand block attempts', () => {
  const f = setup(); f.world.setBlock(0, 1, 0, true); f.controller.teleport({ x: 3.5, y: 0, z: .5 });
  f.controller.setMining(true); assert.equal(f.placement.attempt(), false);
  assert.equal(f.world.hasBlock(1, 1, 0), false); assert.equal(f.swings(), 0); f.controller.setMining(false);
  assert.equal(f.placement.attempt(), true, 'New cube is only 1.5 blocks from the eye');
  f.controller.teleport({ x: 3.3, y: 0, z: .5 });
  assert.equal(f.placement.attempt(), true, 'Cube [2,3] touches player minX=3 without overlapping');
  const count = f.controller.inventory.mainHand.count;
  assert.equal(f.placement.attempt(), false, 'Cube [3,4] would overlap the current hitbox');
  assert.equal(f.controller.inventory.mainHand.count, count);
  f.controller.configure('reach', .01); assert.equal(f.placement.attempt(), false);
  f.controller.inventory.slots[40] = block(5); f.controller.inventory.slots[0] = null;
  f.controller.configure('reach', 4.5); f.controller.teleport({ x: 5.5, y: 0, z: .5 }); f.controller.setGameMode('creative');
  assert.equal(f.placement.attempt(), false); assert.equal(f.controller.inventory.offhand.count, 5);
  const sized = setup(); sized.controller.configure('size', 2);
  sized.controller.player.crouching = true; sized.controller.player.eyeOffset = 2.54;
  sized.controller.player.x = .5; sized.controller.player.y = 0; sized.controller.player.z = .5;
  sized.world.setBlock(0, 3, 0, true); sized.aim({ yaw: 0, pitch: Math.PI / 2 });
  assert.equal(sized.placement.attempt(), false, 'Crouching size-two hitbox still overlaps the cube below the ceiling');
  assert.equal(sized.controller.inventory.mainHand.count, 10);
});

test('gamemode command/autocomplete preserve inventory and terrain, change only consumption/drops, and start fresh in Survival', () => {
  const f = setup(), service = new ChatService({ controller: f.controller, profile: new LocalPlayerProfile(null, () => 'modes') });
  assert.equal(f.controller.gameMode, 'survival');
  assert.deepEqual(service.completions('/gamemode '), ['/gamemode survival', '/gamemode creative']);
  assert.deepEqual(service.completions('/gamemode c'), ['/gamemode creative']);
  f.world.setBlock(0, 1, 0, true); f.controller.teleport({ x: 3.5, y: 0, z: .5 });
  service.submit('/gamemode creative'); assert.equal(f.controller.gameMode, 'creative');
  assert.equal(f.placement.attempt(), true); assert.equal(f.controller.inventory.mainHand.count, 10);
  assert.equal(breakTargetBlock({ ...f, yaw: Math.PI / 2, pitch: 0 }), true); assert.equal(f.controller.drops.total(), 0n);
  const before = [...f.world.edits()]; service.submit('/gamemode invalid');
  assert.equal(f.controller.gameMode, 'creative'); assert.deepEqual([...f.world.edits()], before);
  assert.match(service.messages.at(-1).text, /survival.*creative/);
  service.submit('/gamemode survival'); assert.equal(f.controller.inventory.mainHand.count, 10);
  assert.equal(f.placement.attempt(), true); assert.equal(f.controller.inventory.mainHand.count, 9);
  assert.equal(breakTargetBlock({ ...f, yaw: Math.PI / 2, pitch: 0 }), true); assert.equal(f.controller.drops.total(), 1n);
  f.controller.respawn({ x: 3.5, y: 0, z: .5 }); assert.equal(f.controller.gameMode, 'survival');
  assert.equal(new MovementController().gameMode, 'survival');
});

test('one cached three-face icon and shared textured block resources serve inventory and both animated hands', t => {
  const window = new Window(), document = window.document;
  t.after(() => { window.happyDOM.abort(); window.close(); });
  const a = document.createElement('button'), b = document.createElement('button');
  drawStack(document, a, block(1)); drawStack(document, b, block(64));
  assert.equal(a.querySelector('img').getAttribute('src'), TEST_BLOCK_ICON);
  assert.equal(b.querySelector('img').getAttribute('src'), TEST_BLOCK_ICON);
  assert.equal(a.querySelector('.stack-count').textContent, ''); assert.equal(b.querySelector('.stack-count').textContent, '64');
  assert.equal((decodeURIComponent(TEST_BLOCK_ICON).match(/<polygon/g) ?? []).length, 3);
  const f = setup(), model = createPlayerModel(), hand = createEmptyHand();
  f.controller.inventory.slots[40] = block(2);
  const pose = { torsoYaw: .3, aimPitch: -.4, headYaw: .1, phase: 2, amount: .7, crouch: 1, swingActive: true, swingProgress: .35 };
  animatePlayerModel(model, { x: 0, y: 0, z: 0, size: 1 }, pose, 1); syncEquipment(model, f.controller.inventory);
  const { rightItem, leftItem } = model.userData.equipment;
  assert.equal(rightItem.parent, model.userData.joints['Right Arm']); assert.equal(leftItem.parent, model.userData.joints['Left Arm']);
  near(rightItem.position.x, MODEL_SCALE); near(leftItem.position.x, -MODEL_SCALE);
  near(rightItem.position.y, -10 * MODEL_SCALE - .15); near(leftItem.position.y, rightItem.position.y);
  near(rightItem.geometry.parameters.width, .375);
  assert.equal(rightItem.geometry, leftItem.geometry); assert.equal(rightItem.material, getBlockAssets().material);
  assert.equal(hand.mainItem.geometry, rightItem.geometry); assert.equal(hand.offhandItem.material.map, getBlockAssets().texture);
  updateEmptyHand(hand, pose, f.controller.inventory); assert.equal(hand.mainItem.visible, true); assert.equal(hand.offhandItem.visible, true); assert.equal(hand.rig.visible, false);
  f.controller.inventory.slots[0] = f.controller.inventory.slots[40] = null;
  syncEquipment(model, f.controller.inventory); updateEmptyHand(hand, pose, f.controller.inventory);
  assert.equal(rightItem.visible, false); assert.equal(leftItem.visible, false); assert.equal(hand.rig.visible, true);
  assert.equal(createBlockItem(.25).material, rightItem.material);
});

test('pile cube counts, stable offsets, exact bob/rotation and shared geometry never alter physics or lot expiry', () => {
  const f = setup(), renderer = new DroppedItemRenderer(new THREE.Scene());
  const pile = f.controller.drops.spawn('test.block', 1, { x: 10, y: 0, z: 10 });
  const expiry = pile.lots[0].expires;
  for (const [count, cubes] of [[1n, 1], [2n, 2], [16n, 2], [17n, 3], [32n, 3], [33n, 4], [48n, 4], [49n, 5], [1000000000000n, 5]]) {
    pile.count = count; pile.lots[0].count = count; renderer.update(f.controller.drops, .5);
    const group = renderer.meshes.get(pile.id); assert.equal(group.children.length, cubes); assert.equal(droppedCubeCount(count), cubes);
    group.children.forEach((mesh, i) => { assert.deepEqual(mesh.position.toArray(), PILE_OFFSETS[i]); assert.equal(mesh.geometry, renderer.prototype.geometry); });
    const children = [...group.children]; renderer.update(f.controller.drops, .5); assert.deepEqual(group.children, children);
    near(group.position.y, .2 + Math.sin(.5 / 10 + pile.phase) * .1 + .1); near(group.rotation.y, .5 / 20 + pile.phase);
    assert.deepEqual([pile.x, pile.y, pile.z], [10, 0, 10]); assert.equal(pile.lots[0].expires, expiry);
  }
});

test('successful edits immediately rebuild loaded chunk meshes on both sides of a boundary', () => {
  const world = new VoxelWorld(), chunks = new ChunkRenderer(world, new THREE.Scene(), new THREE.MeshBasicMaterial());
  const a = chunks.rebuild(-1, 0, 1), b = chunks.rebuild(0, 0, 1);
  world.setBlock(-1, 0, 0, true); chunks.invalidateBlock(-1, 0, true);
  assert.notEqual(chunks.chunks.get('-1,0').mesh, a.mesh); assert.notEqual(chunks.chunks.get('0,0').mesh, b.mesh);
  assert.equal(chunks.chunks.get('-1,0').dirty, false); chunks.dispose();
});
