import * as THREE from 'three';
const radians = Math.PI / 180;
export const ITEM_DISPLAY = Object.freeze({
  handheld: {
    third: { right: { rotation: [0, -90, 55], translation: [0, 4, .5], scale: .85 }, left: { rotation: [0, 90, -55], translation: [0, 4, .5], scale: .85 } },
    first: { right: { rotation: [0, -90, 25], translation: [1.13, 3.2, 1.13], scale: .68 }, left: { rotation: [0, 90, -25], translation: [1.13, 3.2, 1.13], scale: .68 } },
  },
  generated: {
    third: { right: { rotation: [0, 0, 0], translation: [0, 3, 1], scale: .55 }, left: { rotation: [0, 0, 0], translation: [0, 3, 1], scale: .55 } },
    first: { right: { rotation: [0, -90, 25], translation: [1.13, 3.2, 1.13], scale: .68 }, left: { rotation: [0, 90, -25], translation: [1.13, 3.2, 1.13], scale: .68 } },
  },
});
const models = new Map(), third = new Map(), alignments = new Map();
const doorFirst = new Map();
export function firstPersonDoorAttachment(sign = 1) {
  if (!doorFirst.has(sign)) {
    // Flat source picture, held at a lower grip. The complete local pose is
    // mirrored for the offhand; the shared wrist supplies equip/action motion.
    const pose = new THREE.Matrix4().makeRotationY(-25 * radians)
      .multiply(new THREE.Matrix4().makeRotationZ(18 * radians))
      .scale(new THREE.Vector3(.42, .42, .42)).multiply(new THREE.Matrix4().makeTranslation(0, .18, 0));
    if (sign < 0) pose.premultiply(new THREE.Matrix4().makeScale(-1, 1, 1));
    doorFirst.set(sign, pose);
  }
  return doorFirst.get(sign);
}
export const displayProfile = item => item?.model === 'flat' ? item.display ?? 'generated' : 'block';
export function itemModelTransform(profile, view, sign = 1) {
  const key = `${profile}:${view}:${sign}`; if (models.has(key)) return models.get(key);
  const p = ITEM_DISPLAY[profile][view][sign > 0 ? 'right' : 'left'], [x, y, z] = p.rotation;
  const matrix = new THREE.Matrix4().makeTranslation(sign * p.translation[0] / 16, p.translation[1] / 16, p.translation[2] / 16)
    .multiply(new THREE.Matrix4().makeRotationX(x * radians)).multiply(new THREE.Matrix4().makeRotationY(y * radians))
    .multiply(new THREE.Matrix4().makeRotationZ(z * radians)).scale(new THREE.Vector3(p.scale, p.scale, p.scale));
  models.set(key, matrix); return matrix;
}
export function thirdPersonItemTransform(profile = 'block', sign = 1) {
  const key = `${profile}:${sign}`; if (third.has(key)) return third.get(key);
  if (profile === 'generated') {
    // Our arm mesh center is one pixel out from its shoulder, with its hand
    // nine pixels below the joint. Put the picture's bottom grip on the front
    // of that actual palm (two pixels deep), not in a second model-origin frame.
    // The unit plane is Y-up already; only the left-side picture is mirrored.
    const pixel = .9375 / 16, scale = .9375 * ITEM_DISPLAY.generated.third.right.scale;
    const matrix = new THREE.Matrix4().makeTranslation(sign * pixel, -9 * pixel, -2 * pixel - .001)
      .multiply(new THREE.Matrix4().makeRotationY(sign < 0 ? Math.PI : 0))
      .multiply(new THREE.Matrix4().makeRotationZ(8 * radians))
      .scale(new THREE.Vector3(scale, scale, scale)).multiply(new THREE.Matrix4().makeTranslation(0, .40625, 0));
    third.set(key, matrix); return matrix;
  }
  const matrix = new THREE.Matrix4().makeScale(.9375, .9375, .9375)
    .multiply(new THREE.Matrix4().makeScale(-1, -1, 1)) // MC shoulder/output basis only.
    .multiply(new THREE.Matrix4().makeRotationX(-Math.PI / 2)).multiply(new THREE.Matrix4().makeRotationY(Math.PI))
    .multiply(new THREE.Matrix4().makeTranslation(sign / 16, 2 / 16, -10 / 16));
  if (profile === 'block') matrix.multiply(new THREE.Matrix4().makeTranslation(0, 2.5 / 16, 0))
    .multiply(new THREE.Matrix4().makeRotationX(75 * radians)).multiply(new THREE.Matrix4().makeRotationY(sign * 45 * radians))
    .scale(new THREE.Vector3(.375, .375, .375));
  else matrix.multiply(itemModelTransform(profile, 'third', sign)).multiply(itemSourceAlignment(profile, 'third', sign));
  third.set(key, matrix); return matrix;
}
export function itemSourceAlignment(profile, view, sign = 1) {
  const key = `${profile}:${view}:${sign}`; if (alignments.has(key)) return alignments.get(key);
  // Adapt the source sprite to this renderer's grip/camera axes, independently
  // of Java's item display TRS. Grip the Stick near its lower endpoint and the
  // complete Door at its bottom frame, not through the middle of the picture.
  const basis = view === 'third' ? new THREE.Matrix4().makeRotationX(Math.PI / 2).scale(new THREE.Vector3(sign, 1, 1))
    : new THREE.Matrix4().makeRotationY(-Math.PI / 2);
  const anchor = profile === 'handheld' ? new THREE.Vector3(-.3125, -.3125, 0) : new THREE.Vector3(0, -.40625, 0);
  const desired = new THREE.Vector3().applyMatrix4(itemModelTransform(profile, view, sign).clone().invert());
  const offset = desired.sub(anchor.applyMatrix4(basis));
  const matrix = new THREE.Matrix4().makeTranslation(offset.x, offset.y, offset.z).multiply(basis);
  alignments.set(key, matrix); return matrix;
}
