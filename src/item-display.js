import * as THREE from 'three';
const radians = Math.PI / 180;
const renderScale = .9375;
const mirror = new THREE.Matrix4().makeScale(-1, 1, 1);
const cache = new Map();

// Model-local display settings. Translations are in pixels (16 per block).
// The first-person renderer's .4 scale is separate from these model scales.
export const ITEM_DISPLAY = Object.freeze({
  handheld: {
    first: { rotation: [0, -135, 25], translation: [0, 4, 2], scale: 1.7 },
    third: { rotation: [0, 90, -35], translation: [0, 1.25, -3.5], scale: .85 },
  },
  item: {
    first: { rotation: [0, -45, 0], translation: [0, 3, 0], scale: 1.25 },
    third: { rotation: [0, 0, 0], translation: [0, 0, 0], scale: .55 },
  },
  door: {
    first: { rotation: [0, -25, 18], translation: [0, 0, 0], scale: .42 },
    third: { rotation: [0, 0, 8], translation: [0, 0, 0], scale: .55 },
  },
  block: {
    first: { rotation: [0, -45, 0], translation: [0, 0, 0], scale: .9375 },
  },
});
export const displayProfile = item => item?.model !== 'flat' ? 'block'
  : item.display === 'generated' ? 'door' : item.display === 'handheld' ? 'handheld' : 'item';

function rotation([x, y, z]) {
  return new THREE.Matrix4().makeRotationX(x * radians)
    .multiply(new THREE.Matrix4().makeRotationY(y * radians))
    .multiply(new THREE.Matrix4().makeRotationZ(z * radians));
}
function mirrored(matrix, sign) {
  // Mirror the COMPLETE attachment once. Three.js handles reversed winding for
  // negative determinants; source UVs/front/back geometry are never rewritten.
  return sign < 0 ? matrix.clone().premultiply(mirror) : matrix;
}
export function itemModelTransform(profile, view) {
  const key = `model:${profile}:${view}`;
  if (!cache.has(key)) {
    const p = ITEM_DISPLAY[profile][view];
    cache.set(key, new THREE.Matrix4().makeTranslation(...p.translation.map(n => n / 16))
      .multiply(rotation(p.rotation)).scale(new THREE.Vector3(p.scale, p.scale, p.scale)));
  }
  return cache.get(key);
}
export function itemGrip(profile) {
  // Unit sprite coordinates: X right, Y up, front +Z. Pick a real point on the
  // handle/bottom edge, not the image center or the arm's shoulder origin.
  return profile === 'handheld' ? new THREE.Vector3(-5 / 16, -5 / 16, 0)
    : profile === 'door' ? new THREE.Vector3(0, -6.5 / 16, 0)
    : profile === 'item' ? new THREE.Vector3(0, -5.5 / 16, 0) : new THREE.Vector3();
}
export function itemSourceTransform(profile, view) {
  const key = `source:${profile}:${view}`;
  if (!cache.has(key)) {
    const grip = itemGrip(profile);
    // First: straighten the diagonal handle to +Y, then present its picture at
    // 45 degrees to the model frame. Third: the arm frame has a different axis;
    // the source's working end must point along the hand's forward direction.
    const basis = profile === 'handheld' ? rotation(view === 'first' ? [0, 45, 45] : [0, -45, 90]) : new THREE.Matrix4();
    cache.set(key, basis.multiply(new THREE.Matrix4().makeTranslation(-grip.x, -grip.y, -grip.z)));
  }
  return cache.get(key);
}
export function firstPersonItemTransform(profile, sign = 1) {
  const key = `first:${profile}:${sign}`;
  if (!cache.has(key)) {
    // Camera -> animated renderer frame -> renderer scale -> model display ->
    // source orientation -> grip centering. No inverse model/translation fixup.
    const scale = profile === 'door' ? 1 : .4;
    const matrix = new THREE.Matrix4().makeScale(scale, scale, scale)
      .multiply(itemModelTransform(profile, 'first')).multiply(itemSourceTransform(profile, 'first'));
    cache.set(key, mirrored(matrix, sign));
  }
  return cache.get(key);
}
export function thirdPersonItemTransform(profile = 'block', sign = 1) {
  const key = `third:${profile}:${sign}`;
  if (!cache.has(key)) {
    let matrix = new THREE.Matrix4().makeScale(renderScale, renderScale, renderScale);
    if (profile === 'block') {
      // Preserve the established centered-cube display. The explicit Java
      // shoulder basis converts +Y-down/-X-right to this rig's Y-up/+X-right.
      matrix.multiply(new THREE.Matrix4().makeScale(-1, -1, 1))
        .multiply(rotation([-90, 180, 0])).multiply(new THREE.Matrix4().makeTranslation(1 / 16, 2 / 16, -10 / 16))
        .multiply(new THREE.Matrix4().makeTranslation(0, 2.5 / 16, 0))
        .multiply(rotation([75, 45, 0])).scale(new THREE.Vector3(.375, .375, .375));
    } else {
      if (profile === 'handheld') {
        // 1.8 hand-relative frame, adapted one pixel for this rig's shoulder.
        // Its -90 X basis maps the model's translation to a grip 9.5 pixels
        // below the shoulder, inside the last pixel of the actual arm mesh.
        matrix.multiply(new THREE.Matrix4().makeTranslation(1 / 16, -6 / 16, 1 / 16)).multiply(rotation([-90, 0, 0]));
      } else {
        // Flat pictures grip the bottom at the real palm, nine pixels below
        // the shoulder and at the front of the two-pixel-deep hand.
        matrix.multiply(new THREE.Matrix4().makeTranslation(1 / 16, -9 / 16, -2 / 16));
      }
      matrix.multiply(itemModelTransform(profile, 'third')).multiply(itemSourceTransform(profile, 'third'));
    }
    cache.set(key, mirrored(matrix, sign));
  }
  return cache.get(key);
}
