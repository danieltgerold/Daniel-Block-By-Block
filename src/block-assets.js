import * as THREE from 'three';
import { BLOCK_COLOR, BLOCK_GRID_COLOR, blockShade } from './block-appearance.js';
import { BLOCK_TYPES, blockFaceTexture } from './block-types.js';
import { texturePixels, textureHasAlpha } from './block-textures.js';
import { itemBlock } from './block-shapes.js';
import { faceUv, shapeQuads } from './shape-mesh.js';
let assets;
export function getBlockAssets(anisotropy = 1) {
  if (!assets) {
    const size = 128, pixels = new Uint8Array(size * size * 4);
    const rgb = hex => hex.slice(1).match(/../g).map(c => parseInt(c, 16));
    const fill = rgb(BLOCK_COLOR), line = rgb(BLOCK_GRID_COLOR);
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
      pixels.set([...(x === 0 || y === 0 || x === size - 1 || y === size - 1 ? line : fill), 255], (y * size + x) * 4);
    }
    const texture = new THREE.DataTexture(pixels, size, size);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
    texture.minFilter = THREE.LinearMipmapLinearFilter; texture.magFilter = THREE.LinearFilter;
    texture.generateMipmaps = true; texture.needsUpdate = true;
    assets = { texture, material: new THREE.MeshBasicMaterial({ map: texture, vertexColors: true, depthTest: true, depthWrite: true }), geometries: new Map() };
  }
  if (anisotropy > assets.texture.anisotropy) { assets.texture.anisotropy = anisotropy; assets.texture.needsUpdate = true; }
  return assets;
}
const faceTextures = new Map(), faceMaterials = new Map(), blockMaterials = new Map();
const partialGeometries = new Map();
export function getItemGeometry(size, id) {
  const block = itemBlock(id); if (!block.definition || block.definition.collisionShape === 'cube') return getBlockGeometry(size);
  const key = `${id}:${size}`; if (partialGeometries.has(key)) return partialGeometries.get(key);
  const parts = block.definition.collisionShape === 'door' ? [block, { ...block, state: { ...block.state, half: 'upper' } }] : [block];
  const positions = [], normals = [], uv = [], colors = [], indices = [], groups = [];
  for (const [n, part] of parts.entries()) for (const q of shapeQuads(part)) {
    const first = positions.length / 3, normal = [0, 0, 0]; normal[q.axis] = q.sign;
    for (const p of q.corners) {
      const at = parts.length === 2 ? [p[0] * .5 + .25, (p[1] + n) * .5, p[2] * .5 + .25] : p;
      positions.push(...at.map(v => (v - .5) * size)); normals.push(...normal); uv.push(...faceUv(p, q.axis, part)); colors.push(q.shade, q.shade, q.shade);
    }
    const order = q.sign > 0 ? [0, 1, 2, 0, 2, 3] : [0, 2, 1, 0, 3, 2];
    groups.push({ start: indices.length, count: 6, materialIndex: q.axis * 2 + (q.sign < 0 ? 1 : 0), texture: q.texture });
    indices.push(...order.map(i => first + i));
  }
  const geometry = new THREE.BufferGeometry(); geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3)); geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3)); geometry.setIndex(indices);
  // Doors need separate upper/lower textures; other partials share one material.
  if (parts.length === 2) groups.forEach((g, i) => geometry.addGroup(g.start, g.count, i));
  geometry.userData.textures = groups.map(g => g.texture); partialGeometries.set(key, geometry); return geometry;
}
export function getItemMaterials(id, geometry) {
  return BLOCK_TYPES.get(id)?.collisionShape === 'door' ? geometry.userData.textures.map(getFaceMaterial) : getBlockMaterials(id);
}
export function getFaceTexture(id) {
  if (id === 'test.block') return getBlockAssets().texture; // Preserve the legacy fine grid exactly.
  if (!faceTextures.has(id)) {
    const pixels = texturePixels(id); if (!pixels) return null;
    const flipped = new Uint8Array(pixels.length);
    for (let y = 0; y < 16; y++) flipped.set(pixels.subarray(y * 64, (y + 1) * 64), (15 - y) * 64);
    const texture = new THREE.DataTexture(flipped, 16, 16);
    texture.name = id; texture.colorSpace = THREE.SRGBColorSpace;
    texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
    texture.minFilter = THREE.NearestMipmapNearestFilter; texture.magFilter = THREE.NearestFilter;
    texture.generateMipmaps = true; texture.needsUpdate = true;
    faceTextures.set(id, texture);
  }
  return faceTextures.get(id);
}
export function getFaceMaterial(id) {
  if (id === 'test.block') return getBlockAssets().material;
  if (!faceMaterials.has(id)) faceMaterials.set(id, new THREE.MeshBasicMaterial({
    map: getFaceTexture(id), vertexColors: true, depthTest: true, depthWrite: true, fog: true,
    // Binary cutouts discard clear pixels before depth writes. Front-side
    // culling avoids coplanar opposing leaf/mixed-block faces fighting.
    alphaTest: textureHasAlpha(id) ? .5 : 0, transparent: false, side: THREE.FrontSide,
    ...(id === 'water' ? { transparent: true, opacity: .52, depthWrite: false, side: THREE.DoubleSide } : {}),
  }));
  return faceMaterials.get(id);
}
export function getBlockMaterials(id = 'test.block') {
  if (!BLOCK_TYPES.has(id)) id = 'test.block';
  if (!blockMaterials.has(id)) {
    // BoxGeometry groups: +X, -X, +Y, -Y, +Z, -Z.
    const materials = [[0, 1], [0, -1], [1, 1], [1, -1], [2, 1], [2, -1]]
      .map(([axis, sign]) => getFaceMaterial(blockFaceTexture(id, axis, sign, BLOCK_TYPES.get(id).itemState)));
    blockMaterials.set(id, materials.every(m => m === materials[0]) ? materials[0] : materials);
  }
  return blockMaterials.get(id);
}
export function setBlockAppearance(mesh, id = 'test.block') {
  if (mesh.userData.blockId === id) return;
  mesh.material = getBlockMaterials(id); mesh.userData.blockId = id;
}
export function getBlockGeometry(size = .375) {
  const { geometries } = getBlockAssets();
  if (!geometries.has(size)) {
    const geometry = new THREE.BoxGeometry(size, size, size), normals = geometry.getAttribute('normal'), colors = [];
    for (let i = 0; i < normals.count; i++) {
      const axis = normals.getY(i) ? 1 : normals.getX(i) ? 0 : 2;
      const shade = blockShade(axis, axis === 1 ? normals.getY(i) : 1);
      colors.push(shade, shade, shade);
    }
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    geometries.set(size, geometry);
  }
  return geometries.get(size);
}
export function createSharedBlock(size = .375, id = 'test.block') {
  const mesh = new THREE.Mesh(getBlockGeometry(size), getBlockMaterials(id));
  mesh.userData.blockId = id; mesh.userData.itemSize = size; return mesh;
}
const particleSources = new Map(), particleTextures = new WeakMap();
export function registerParticleTexture(id, texture) { particleSources.set(id, texture); }
export function getParticleTexture(id = 'test.block') {
  const source = particleSources.get(id) ?? getFaceTexture(id);
  if (!source) return null;
  if (!particleTextures.has(source)) {
    const texture = source.clone(); // Reuse source pixels; only the sampler differs.
    texture.minFilter = texture.magFilter = THREE.NearestFilter; texture.generateMipmaps = false;
    texture.wrapS = texture.wrapT = THREE.ClampToEdgeWrapping; texture.needsUpdate = true;
    particleTextures.set(source, texture);
  }
  return particleTextures.get(source);
}
