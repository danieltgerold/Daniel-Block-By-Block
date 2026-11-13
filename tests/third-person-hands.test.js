import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { PlayerInventory } from '../src/inventory.js';
import { createPlayerModel, animatePlayerModel, syncEquipment, createEmptyHand, updateEmptyHand } from '../src/player-visuals.js';
const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-8, `${a} != ${b}`);
const stack = () => ({ id: 'test.block', count: 1 });
const base = { torsoYaw: .2, headYaw: .1, aimPitch: -.4, phase: 2, amount: .8, crouch: 0, swingActive: false, swingProgress: 0 };
// Independent point-transform oracle: apply the written MC operations from
// right to left, converting both the source and destination coordinate bases.
function expected(point, sign) {
  const x = new THREE.Vector3(1, 0, 0), y = new THREE.Vector3(0, 1, 0);
  return point.clone().multiply(new THREE.Vector3(-1, -1, 1)).multiplyScalar(.375)
    .applyAxisAngle(y, sign * Math.PI / 4).applyAxisAngle(x, 75 * Math.PI / 180)
    .add(new THREE.Vector3(0, 2.5 / 16, 0)).add(new THREE.Vector3(sign / 16, 2 / 16, -10 / 16))
    .applyAxisAngle(y, Math.PI).applyAxisAngle(x, -Math.PI / 2)
    .multiply(new THREE.Vector3(-1, -1, 1)).multiplyScalar(.9375);
}
test('both third-person hands preserve the exact Java matrix, follow animated shoulders, and scale the complete attachment once', () => {
  const inventory = new PlayerInventory(); inventory.slots[0] = stack(); inventory.slots[40] = stack();
  const model = createPlayerModel();
  for (const size of [1, 2]) for (const pose of [base, { ...base, crouch: 1 }, { ...base, crouch: 1, swingActive: true, swingProgress: .35 }]) {
    let rear;
    for (const view of [1, 2]) {
      animatePlayerModel(model, { x: 3, y: 4, z: -5, size }, pose, view, inventory); syncEquipment(model, inventory); model.updateMatrixWorld(true);
      const matrices = [];
      for (const [key, arm, sign] of [['rightItem', 'Right Arm', 1], ['leftItem', 'Left Arm', -1]]) {
        const item = model.userData.equipment[key], joint = model.userData.joints[arm];
        assert.equal(item.parent, joint); assert.equal(item.visible, true);
        for (const point of [new THREE.Vector3(), new THREE.Vector3(.5, .5, .5), new THREE.Vector3(-.5, .5, -.5)]) {
          const actual = point.clone().applyMatrix4(item.matrix), target = expected(point, sign);
          near(actual.distanceTo(target), 0);
          near(point.clone().applyMatrix4(item.matrixWorld).distanceTo(target.applyMatrix4(joint.matrixWorld)), 0);
        }
        const a = new THREE.Vector3(-.5, -.5, -.5).applyMatrix4(item.matrixWorld);
        const b = new THREE.Vector3(.5, -.5, -.5).applyMatrix4(item.matrixWorld);
        near(a.distanceTo(b), .3515625 * size);
        matrices.push([...item.matrixWorld.elements]);
      }
      if (view === 1) rear = matrices; else assert.deepEqual(matrices, rear, 'Front view does not mirror or alter the avatar attachment');
    }
  }
});
test('held-arm half-walk pose precedes crouch/action, empty arms retain normal walk, and first-person item matrices stay separate', () => {
  const inventory = new PlayerInventory(), model = createPlayerModel(), hand = createEmptyHand();
  inventory.slots[0] = stack(); inventory.slots[40] = stack();
  updateEmptyHand(hand, base, inventory); const firstPerson = [...hand.mainItem.matrix.elements];
  for (const held of [[true, true], [true, false], [false, true], [false, false]]) {
    inventory.slots[0] = held[0] ? stack() : null; inventory.slots[40] = held[1] ? stack() : null;
    for (const pose of [base, { ...base, crouch: 1, swingActive: true, swingProgress: .35 }]) {
      animatePlayerModel(model, { x: 0, y: 0, z: 0 }, pose, 1, inventory);
      const s = Math.cos(pose.phase * .6662) * pose.amount, p = pose.swingActive ? pose.swingProgress : 0;
      const t = pose.swingActive ? .2 * Math.sin(2 * Math.PI * Math.sqrt(p)) : 0;
      const attack = pose.swingActive ? 1.2 * Math.sin(Math.PI * (1 - (1 - p) ** 4)) + .75 * Math.sin(Math.PI * p) * (.7 + pose.aimPitch) : 0;
      near(model.userData.joints['Right Arm'].rotation.x, -((held[0] ? s * .5 - Math.PI / 10 : s) + .4 * pose.crouch - attack));
      near(model.userData.joints['Left Arm'].rotation.x, -((held[1] ? -s * .5 - Math.PI / 10 : -s) + .4 * pose.crouch + t));
      near(model.userData.joints['Right Arm'].rotation.y, -3 * t); near(model.userData.joints['Left Arm'].rotation.y, -t);
      assert.deepEqual(hand.mainItem.matrix.elements, firstPerson);
    }
  }
});
