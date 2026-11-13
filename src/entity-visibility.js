import * as THREE from 'three';

// Renderer-only policy shared by entity types. Bounds are a conservative sphere
// plus a world-axis offset, authored once to include all poses and animation.
// Keep one small state object per entity for distance-detail hysteresis.
export class EntityVisibility {
  constructor() {
    this.frustum = new THREE.Frustum(); this.projectionView = new THREE.Matrix4();
    this.cameraPosition = new THREE.Vector3(); this.sphere = new THREE.Sphere(); this.hasCamera = false;
  }
  beginFrame(camera) {
    this.hasCamera = Boolean(camera);
    if (!camera) return;
    camera.updateWorldMatrix(true, false);
    this.projectionView.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    this.frustum.setFromProjectionMatrix(this.projectionView);
    camera.getWorldPosition(this.cameraPosition);
  }
  evaluate(position, settings, state, scale = 1) {
    if (!this.hasCamera) { state.visible = true; state.simplified = false; return state; }
    const { radius, offset = {} } = settings.bounds;
    this.sphere.center.set(position.x + (offset.x ?? 0) * scale, position.y + (offset.y ?? 0) * scale, position.z + (offset.z ?? 0) * scale);
    this.sphere.radius = radius * scale;
    state.visible = this.frustum.intersectsSphere(this.sphere);
    if (!settings.detail) { state.simplified = false; return state; }
    const distance = this.sphere.center.distanceTo(this.cameraPosition);
    const { distance: threshold, hysteresis = .5 } = settings.detail;
    if (state.simplified === undefined) state.simplified = distance > threshold;
    else if (state.simplified && distance < threshold - hysteresis) state.simplified = false;
    else if (!state.simplified && distance > threshold + hysteresis) state.simplified = true;
    return state;
  }
}
