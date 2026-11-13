import * as THREE from 'three';
import { getParticleTexture } from './block-assets.js';
import { PARTICLE_LIMIT } from './block-particles.js';
const vertexShader = `
attribute vec3 particleCenter;
attribute float particleSize;
attribute vec2 particleCrop;
attribute vec3 particleTint;
varying vec2 vParticleUv;
varying vec3 vParticleTint;
void main() {
  vParticleUv = uv * 0.25 + particleCrop;
  vParticleTint = particleTint;
  vec4 mv = modelViewMatrix * vec4(particleCenter, 1.0);
  mv.xy += position.xy * particleSize;
  gl_Position = projectionMatrix * mv;
}`;
const fragmentShader = `
uniform sampler2D particleMap;
varying vec2 vParticleUv;
varying vec3 vParticleTint;
void main() {
  vec4 texel = texture2D(particleMap, vParticleUv);
  if (texel.a < 0.1) discard;
  gl_FragColor = vec4(texel.rgb * vParticleTint, texel.a);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;
export class BlockParticleRenderer {
  constructor(scene, { resolveTexture = getParticleTexture } = {}) {
    Object.assign(this, { scene, resolveTexture }); this.quad = new THREE.PlaneGeometry(2, 2); this.batches = new Map();
    this.frustum = new THREE.Frustum(); this.projectionView = new THREE.Matrix4(); this.sphere = new THREE.Sphere();
    this.positions = new Float64Array(PARTICLE_LIMIT * 3); this.distances = new Float64Array(PARTICLE_LIMIT); this.indices = [];
    this.view = { position: new THREE.Vector3(), visible: (at, radius) => {
      this.sphere.center.set(at.x, at.y, at.z); this.sphere.radius = radius; return this.frustum.intersectsSphere(this.sphere);
    } };
  }
  batch(textureId) {
    if (!this.batches.has(textureId)) {
      const texture = this.resolveTexture(textureId); if (!texture) return null;
      const geometry = new THREE.InstancedBufferGeometry();
      geometry.setIndex(this.quad.index); geometry.setAttribute('position', this.quad.getAttribute('position')); geometry.setAttribute('uv', this.quad.getAttribute('uv'));
      const attributes = {};
      for (const [name, size] of [['particleCenter', 3], ['particleSize', 1], ['particleCrop', 2], ['particleTint', 3]]) {
        attributes[name] = new THREE.InstancedBufferAttribute(new Float32Array(PARTICLE_LIMIT * size), size).setUsage(THREE.DynamicDrawUsage);
        geometry.setAttribute(name, attributes[name]);
      }
      geometry.instanceCount = 0;
      const material = new THREE.ShaderMaterial({ vertexShader, fragmentShader, uniforms: { particleMap: { value: texture } }, side: THREE.DoubleSide, depthTest: true, depthWrite: true });
      const mesh = new THREE.Mesh(geometry, material); mesh.frustumCulled = false; mesh.visible = false; this.scene.add(mesh);
      this.batches.set(textureId, { mesh, geometry, material, attributes, count: 0 });
    }
    return this.batches.get(textureId);
  }
  update(system, alpha, camera) {
    for (const batch of this.batches.values()) batch.count = 0;
    this.indices.length = 0;
    if (camera) {
      camera.updateWorldMatrix(true, false); camera.getWorldPosition(this.view.position);
      this.projectionView.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse); this.frustum.setFromProjectionMatrix(this.projectionView);
      system.setView(this.view);
      const settings = system.settings;
      for (const id of system.active) {
        const p = system.pool[id], x = p.px + (p.x - p.px) * alpha, y = p.py + (p.y - p.py) * alpha, z = p.pz + (p.z - p.pz) * alpha;
        this.positions.set([x, y, z], id * 3);
        this.distances[id] = (x - this.view.position.x) ** 2 + (y - this.view.position.y) ** 2 + (z - this.view.position.z) ** 2;
        this.sphere.center.set(x, y, z); this.sphere.radius = Math.SQRT2 * p.halfSize;
        if (this.distances[id] <= settings.particleDistance ** 2 && this.frustum.intersectsSphere(this.sphere)) this.indices.push(id);
      }
      if (this.indices.length > settings.particleCap) {
        this.indices.sort((a, b) => this.distances[a] - this.distances[b]); this.indices.length = settings.particleCap;
      }
      for (const id of this.indices) {
        const p = system.pool[id], batch = this.batch(p.texture); if (!batch) continue;
        const n = batch.count++, a = batch.attributes;
        a.particleCenter.setXYZ(n, this.positions[id * 3] - this.view.position.x, this.positions[id * 3 + 1] - this.view.position.y, this.positions[id * 3 + 2] - this.view.position.z);
        a.particleSize.setX(n, p.halfSize); a.particleCrop.setXY(n, p.u, p.v); a.particleTint.setXYZ(n, ...p.tint);
      }
    } else system.setView(null);
    for (const batch of this.batches.values()) {
      batch.geometry.instanceCount = batch.count; batch.mesh.visible = batch.count > 0;
      batch.mesh.position.copy(this.view.position);
      if (batch.count) for (const attribute of Object.values(batch.attributes)) attribute.needsUpdate = true;
    }
  }
  dispose() {
    for (const batch of this.batches.values()) { this.scene.remove(batch.mesh); batch.geometry.dispose(); batch.material.dispose(); }
    this.quad.dispose(); this.batches.clear();
  }
}
