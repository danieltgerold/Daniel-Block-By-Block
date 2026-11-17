import * as THREE from 'three';
import { texturePixels } from './block-textures.js';
const cache = new Map();
// Generated-item model: a 16px Y-up sprite, with 1/16-unit thickness and
// exposed silhouette/hole edges. One shared mesh geometry, never pixel meshes.
export function spriteGeometry(texture, size = 1) {
  const key = `${texture}:${size}`; if (cache.has(key)) return cache.get(key);
  const pixels = texturePixels(texture), positions = [], uv = [], normals = [], colors = [], indices = [];
  const opaque = (x, y) => x >= 0 && x < 16 && y >= 0 && y < 16 && pixels[(y * 16 + x) * 4 + 3] >= 128;
  const quad = (points, normal, tex, shade = 1) => {
    const start = positions.length / 3;
    for (let i = 0; i < 4; i++) { positions.push(...points[i].map(n => n * size)); normals.push(...normal); uv.push(...tex[i]); colors.push(shade, shade, shade); }
    indices.push(start, start + 1, start + 2, start, start + 2, start + 3);
  };
  for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) if (opaque(x, y)) {
    const x0 = x / 16 - .5, x1 = (x + 1) / 16 - .5, y1 = .5 - y / 16, y0 = .5 - (y + 1) / 16, z = 1 / 32;
    const t = [[x / 16, 1 - (y + 1) / 16], [(x + 1) / 16, 1 - (y + 1) / 16], [(x + 1) / 16, 1 - y / 16], [x / 16, 1 - y / 16]];
    quad([[x0, y0, z], [x1, y0, z], [x1, y1, z], [x0, y1, z]], [0, 0, 1], t);
    quad([[x1, y0, -z], [x0, y0, -z], [x0, y1, -z], [x1, y1, -z]], [0, 0, -1], [t[1], t[0], t[3], t[2]], .9);
    const edgeUv = Array(4).fill([(x + .5) / 16, 1 - (y + .5) / 16]);
    if (!opaque(x - 1, y)) quad([[x0, y0, -z], [x0, y0, z], [x0, y1, z], [x0, y1, -z]], [-1, 0, 0], edgeUv, .75);
    if (!opaque(x + 1, y)) quad([[x1, y0, z], [x1, y0, -z], [x1, y1, -z], [x1, y1, z]], [1, 0, 0], edgeUv, .85);
    if (!opaque(x, y - 1)) quad([[x0, y1, z], [x1, y1, z], [x1, y1, -z], [x0, y1, -z]], [0, 1, 0], edgeUv, .95);
    if (!opaque(x, y + 1)) quad([[x0, y0, -z], [x1, y0, -z], [x1, y0, z], [x0, y0, z]], [0, -1, 0], edgeUv, .65);
  }
  const geometry = new THREE.BufferGeometry(); geometry.name = `${texture} generated sprite`;
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3)); geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3)); geometry.setIndex(indices);
  geometry.computeBoundingBox(); geometry.computeBoundingSphere(); cache.set(key, geometry); return geometry;
}
