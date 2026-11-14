import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { BLOCK_TYPES, blockDrops } from '../src/block-types.js';
import { texturePixels } from '../src/block-textures.js';
import { blockIcon } from '../src/block-icons.js';
import { getFaceTexture, getFaceMaterial, getBlockMaterials, getParticleTexture } from '../src/block-assets.js';
import { MovementController } from '../src/movement.js';
import { VoxelWorld } from '../src/voxel-world.js';
import { BlockPlacement, breakTargetBlock } from '../src/block-placement.js';
import { BlockParticles } from '../src/block-particles.js';
import { buildChunkMesh } from '../src/voxel-mesh.js';
import { createPlayerModel, animatePlayerModel, syncEquipment, createEmptyHand, updateEmptyHand } from '../src/player-visuals.js';
import { ChatService, LocalPlayerProfile } from '../src/chat.js';
import { commandCompletions } from '../src/chat-commands.js';
import { DroppedItemRenderer } from '../src/dropped-item-renderer.js';
const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-8, `${a} != ${b}`);
const stack = id => ({ id, count: 3 });
const rest = { phase: 0, amount: 0, crouch: 0, torsoYaw: 0, aimPitch: 0, headYaw: 0, swingActive: false, swingProgress: 0 };
const facesAt = (data, x, sign) => {
  let count = 0;
  for (let vertex = 0; vertex < data.positions.length / 3; vertex += 4) {
    if (data.normals[vertex * 3] !== sign) continue;
    if ([0, 1, 2, 3].every(i => Math.abs(data.positions[(vertex + i) * 3] - x) < 1e-8)) count++;
  }
  return count;
};

test('held grass top/side UVs stay upright in both hands and all F5 views without moving or resizing the attachment', () => {
  const c = new MovementController(new VoxelWorld()), model = createPlayerModel(), hand = createEmptyHand();
  c.inventory.slots[0] = stack('grass.block'); c.inventory.slots[40] = stack('grass.block');
  for (const size of [1, 2]) for (const view of [1, 2]) {
    animatePlayerModel(model, { x: 0, y: 0, z: 0, size }, rest, view, c.inventory); syncEquipment(model, c.inventory); model.updateMatrixWorld(true);
    for (const [name, sign] of [['rightItem', 1], ['leftItem', -1]]) {
      const item = model.userData.equipment[name];
      assert.ok(new THREE.Vector3(0, 1, 0).transformDirection(item.matrixWorld).y > .98, 'Grass top points up at rest, rather than down');
      assert.ok(new THREE.Vector3(0, 1, 0).transformDirection(item.matrix).y > .96);
      const center = new THREE.Vector3().setFromMatrixPosition(item.matrix);
      near(center.x, sign * .9375 / 16); near(center.y, -10 * .9375 / 16);
      near(item.matrix.getMaxScaleOnAxis(), .3515625);
      assert.equal(item.material[2].map, getFaceTexture('grass.top'));
      assert.equal(item.material[3].map, getFaceTexture('dirt'));
      const g = item.geometry, uv = g.getAttribute('uv'), p = g.getAttribute('position');
      for (const side of [0, 1, 4, 5]) for (let i = 0; i < 6; i++) {
        const index = g.index.getX(g.groups[side].start + i);
        if (p.getY(index) > 0) near(uv.getY(index), 1);
      }
    }
  }
  updateEmptyHand(hand, rest, c.inventory);
  for (const item of [hand.mainItem, hand.offhandItem]) {
    item.updateMatrixWorld(true);
    assert.ok(new THREE.Vector3(0, 1, 0).transformDirection(item.matrixWorld).y > .98);
    assert.equal(item.material[2].map, getFaceTexture('grass.top'));
  }
  c.inventory.slots[0] = c.inventory.slots[40] = stack('oak.log');
  syncEquipment(model, c.inventory); updateEmptyHand(hand, rest, c.inventory);
  for (const item of [model.userData.equipment.rightItem, model.userData.equipment.leftItem, hand.mainItem, hand.offhandItem]) {
    assert.equal(item.material[2].map, getFaceTexture('oak.end')); assert.equal(item.material[3].map, getFaceTexture('oak.end'));
    assert.equal(item.material[0].map, getFaceTexture('oak.bark'));
  }
});

test('glass and leaves have real binary alpha in shared textures, static icons, held/drop materials and particle samplers', () => {
  for (const id of ['glass', 'oak.leaves']) {
    const pixels = texturePixels(id), alpha = [...pixels].filter((_, i) => i % 4 === 3);
    assert.ok(alpha.includes(0) && alpha.includes(255)); assert.ok(alpha.every(a => a === 0 || a === 255));
    if (id === 'glass') assert.ok(alpha.filter(a => !a).length > 170, 'Glass is mostly clear');
    const texture = getFaceTexture(id), material = getFaceMaterial(id);
    assert.equal(texture.image.width, 16); assert.equal(texture.magFilter, THREE.NearestFilter);
    assert.equal(material.map, texture); assert.equal(material.alphaTest, .5);
    assert.equal(material.transparent, false); assert.equal(material.depthTest, true); assert.equal(material.depthWrite, true);
    assert.equal(material.side, THREE.FrontSide); assert.equal(getBlockMaterials(id), material);
    assert.equal(getParticleTexture(id).image, texture.image);
    const c = new MovementController(new VoxelWorld()), drops = new DroppedItemRenderer(new THREE.Scene());
    const pile = c.drops.spawn(id, 3, { x: 10, y: 1, z: 10 }); drops.update(c.drops);
    assert.equal(drops.meshes.get(pile.id).children[0].material, material);
    const svg = decodeURIComponent(blockIcon(id).split(',')[1]);
    assert.equal(svg.includes('#000000'), false, 'Clear icon pixels are omitted, not drawn black');
    const area = [...svg.matchAll(/M\d+ \d+h(\d+)v1/g)].reduce((n, m) => n + Number(m[1]), 0);
    assert.equal(area, alpha.filter(a => a === 255).length * 3);
  }
});

test('opaque faces remain behind cutouts, same glass faces disappear, and fancy leaf interfaces survive all LODs/chunk boundaries', () => {
  const cases = [
    ['stone', 'glass', 1, 0], ['glass', 'stone', 0, 1], ['stone', 'oak.leaves', 1, 0],
    ['glass', 'glass', 0, 0], ['oak.leaves', 'oak.leaves', 1, 1], ['glass', 'oak.leaves', 1, 1],
  ];
  for (const [a, b, plus, minus] of cases) {
    const w = new VoxelWorld({ depth: 0 }); w.setBlock(0, 0, 0, a); w.setBlock(1, 0, 0, b);
    const data = buildChunkMesh(w, 0, 0); assert.equal(facesAt(data, 1, 1), plus); assert.equal(facesAt(data, 1, -1), minus);
    const tiled = new VoxelWorld({ depth: 0 });
    for (let x = 0; x < 32; x++) for (let z = 0; z < 16; z++) tiled.setBlock(x, 0, z, x < 16 ? a : b);
    for (const level of [1, 2, 4]) {
      const left = buildChunkMesh(tiled, 0, 0, level), right = buildChunkMesh(tiled, 1, 0, level);
      assert.equal(facesAt(left, 16, 1), plus); assert.equal(facesAt(right, 0, -1), minus);
      for (const mesh of [left, right]) for (const group of mesh.groups) {
        const material = getFaceMaterial(group.texture);
        assert.equal(material.alphaTest > 0, ['glass', 'oak.leaves'].includes(group.texture));
      }
    }
  }
});

test('new IDs give/autocomplete/place normally, target through clear pixels, collide as full cubes and preserve leaf state', () => {
  for (const id of ['glass', 'oak.leaves']) {
    assert.ok(commandCompletions('/give ').includes(`/give ${id} `));
    const w = new VoxelWorld(), c = new MovementController(w);
    const service = new ChatService({ controller: c, profile: new LocalPlayerProfile(null, () => 'cutouts') });
    service.submit(`/give ${id} 130`); assert.deepEqual(c.inventory.slots.slice(0, 3).map(s => s.count), [64, 64, 2]);
    w.setBlock(0, 1, 0, 'test.block'); c.teleport({ x: 3.5, y: 0, z: .5 });
    const placement = new BlockPlacement({ controller: c, world: w, getAim: () => ({ yaw: Math.PI / 2, pitch: 0 }), canInteract: () => true });
    assert.equal(placement.attempt(), true); assert.equal(w.blockIdAt(1, 1, 0), id); assert.equal(c.inventory.mainHand.count, 63);
    const hit = w.raycast({ x: 4, y: 1.5, z: .5 }, { x: -1, y: 0, z: 0 }); assert.equal(hit.x, 1);
    for (const half of [.3, .125]) {
      const landing = w.movePlayer({ x: 1.5, y: 5, z: .5 }, { x: 0, y: -100, z: 0 }, half, half === .3 ? 1.8 : .25);
      near(landing.y, 2); assert.equal(landing.grounded, true);
      const wall = w.movePlayer({ x: 4, y: 1, z: .5 }, { x: -100, y: 0, z: 0 }, half, 1);
      near(wall.x, 2 + half);
    }
    if (id === 'oak.leaves') {
      assert.equal(w.blockAt(1, 1, 0).state.persistent, true); w.step(300); assert.equal(w.blockIdAt(1, 1, 0), id);
      w.setBlock(1, 1, 0, id, { persistent: false, distance: 6 });
      const restored = new VoxelWorld(); restored.loadEdits([...w.edits()]);
      assert.deepEqual(restored.blockAt(1, 1, 0).state, { persistent: false, distance: 6 });
      assert.equal(restored.blockAt(0, 1, 0).id, 'test.block');
    }
  }
});

test('placed/grown grass drops dirt, glass/leaves drop no blocks, and Creative never drops any of them', () => {
  for (const mode of ['survival', 'creative']) for (const id of ['grass.block', 'glass', 'oak.leaves']) {
    const w = new VoxelWorld(), c = new MovementController(w); c.setGameMode(mode); c.teleport({ x: 3.5, y: 0, z: .5 });
    w.setBlock(0, 1, 0, id); c.particles = new BlockParticles(w, { random: () => .5 });
    assert.equal(breakTargetBlock({ controller: c, world: w, yaw: Math.PI / 2, pitch: 0 }), true);
    assert.equal(c.particles.active.length, 64); assert.ok(c.particles.pool.every(p => p.texture === BLOCK_TYPES.get(id).particleTexture));
    assert.equal(c.drops.total(), mode === 'survival' && id === 'grass.block' ? 1n : 0n);
    if (c.drops.piles.length) assert.equal(c.drops.piles[0].item, 'dirt');
  }
  const w = new VoxelWorld({ random: () => .99 }), c = new MovementController(w); c.teleport({ x: 3.5, y: 0, z: .5 });
  w.setBlock(-1, 0, -1, 'grass.block'); w.setBlock(0, 1, 0, 'dirt'); w.step(1);
  assert.equal(w.blockIdAt(0, 1, 0), 'grass.block');
  c.drops.spawn('dirt', 2, { x: .5, y: 1.25, z: .5 });
  assert.equal(breakTargetBlock({ controller: c, world: w, yaw: Math.PI / 2, pitch: 0 }), true);
  assert.equal(c.drops.piles.length, 1); assert.equal(c.drops.piles[0].item, 'dirt'); assert.equal(c.drops.total(), 3n);
  const custom = { definition: { drops: ({ tool }) => tool ? [{ id: 'stone', count: 1 }] : [] } };
  assert.deepEqual(blockDrops(custom, { tool: null }), []); assert.deepEqual(blockDrops(custom, { tool: stack('stone') }), [{ id: 'stone', count: 1 }]);
});

test('solid nonopaque glass/leaves allow the simplified grass cover/spread rule, while Stone still converts grass to dirt', () => {
  for (const cover of ['glass', 'oak.leaves']) {
    const w = new VoxelWorld({ depth: 0, random: () => .99 });
    w.setBlock(0, 0, 0, 'grass.block'); w.setBlock(0, 1, 0, cover);
    w.setBlock(1, 1, 1, 'dirt'); w.setBlock(1, 2, 1, cover); w.step(1);
    assert.equal(w.blockIdAt(0, 0, 0), 'grass.block'); assert.equal(w.blockIdAt(1, 1, 1), 'grass.block');
    assert.equal(w.isOpaqueSolid(0, 1, 0), false);
    w.setBlock(0, 1, 0, 'stone'); assert.equal(w.blockIdAt(0, 0, 0), 'dirt');
  }
});
