import * as THREE from 'three';
import { ITEMS } from './inventory.js';
import { createSharedBlock, getBlockGeometry, getBlockMaterials, getFaceTexture } from './block-assets.js';
const flatGeometry = new Map(), flatMaterials = new Map();
export function setItemAppearance(mesh, id = 'test.block') {
  if (mesh.userData.itemId === id) return;
  const item = ITEMS.get(id), size = mesh.userData.itemSize ?? 1;
  if (item?.model === 'flat') {
    if (!flatGeometry.has(size)) flatGeometry.set(size, new THREE.PlaneGeometry(size * 1.25, size * 1.25));
    if (!flatMaterials.has(item.texture)) flatMaterials.set(item.texture, new THREE.MeshBasicMaterial({
      map: getFaceTexture(item.texture), alphaTest: .5, side: THREE.DoubleSide, depthWrite: true, depthTest: true,
    }));
    mesh.geometry = flatGeometry.get(size); mesh.material = flatMaterials.get(item.texture);
  } else { mesh.geometry = getBlockGeometry(size); mesh.material = getBlockMaterials(id); }
  mesh.userData.itemId = id; mesh.userData.blockId = item?.block ? id : null;
}
export function createItemMesh(size = .375, id = 'test.block') {
  const mesh = createSharedBlock(size); setItemAppearance(mesh, id); return mesh;
}
