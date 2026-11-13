import * as THREE from 'three';
import { BLOCK_COLOR, BLOCK_GRID_COLOR, blockShade } from './block-appearance.js';
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
export function createSharedBlock(size = .375) {
  const { material, geometries } = getBlockAssets();
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
  return new THREE.Mesh(geometries.get(size), material);
}
