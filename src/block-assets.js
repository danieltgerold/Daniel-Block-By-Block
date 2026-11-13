import * as THREE from 'three';
import { BLOCK_COLOR, BLOCK_GRID_COLOR, blockShade } from './block-appearance.js';
import { BLOCK_TYPES, blockFaceTexture } from './block-types.js';
import { texturePixels } from './block-textures.js';
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
  }));
  return faceMaterials.get(id);
}
export function getBlockMaterials(id = 'test.block') {
  if (!BLOCK_TYPES.has(id)) id = 'test.block';
  if (!blockMaterials.has(id)) {
    // BoxGeometry groups: +X, -X, +Y, -Y, +Z, -Z.
    const materials = [[0, 1], [0, -1], [1, 1], [1, -1], [2, 1], [2, -1]]
      .map(([axis, sign]) => getFaceMaterial(blockFaceTexture(id, axis, sign)));
    blockMaterials.set(id, materials.every(m => m === materials[0]) ? materials[0] : materials);
  }
  return blockMaterials.get(id);
}
export function setBlockAppearance(mesh, id = 'test.block') {
  if (mesh.userData.blockId === id) return;
  mesh.material = getBlockMaterials(id); mesh.userData.blockId = id;
}
export function createSharedBlock(size = .375, id = 'test.block') {
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
  const mesh = new THREE.Mesh(geometries.get(size), getBlockMaterials(id));
  mesh.userData.blockId = id; return mesh;
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
