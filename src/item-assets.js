import * as THREE from 'three';
import { ITEMS } from './inventory.js';
import { createSharedBlock, getItemGeometry, getItemMaterials, getFaceTexture } from './block-assets.js';
import { spriteGeometry } from './sprite-geometry.js';
const flatMaterials = new Map();
export function setItemAppearance(mesh, id = 'test.block') {
  const key = `${id}:${mesh.userData.displayContext ?? 'world'}`;
  if (mesh.userData.appearanceKey === key) return;
  const item = ITEMS.get(id), size = mesh.userData.itemSize ?? 1;
  if (item?.model === 'flat') {
    if (!flatMaterials.has(item.texture)) flatMaterials.set(item.texture, new THREE.MeshBasicMaterial({
      map: getFaceTexture(item.texture), alphaTest: .5, side: THREE.DoubleSide, vertexColors: true, depthWrite: true, depthTest: true,
    }));
    mesh.geometry = spriteGeometry(item.texture, mesh.userData.displayContext === 'firstperson' ? 1 : size); mesh.material = flatMaterials.get(item.texture);
  } else { mesh.geometry = getItemGeometry(size, id); mesh.material = getItemMaterials(id, mesh.geometry); }
  mesh.userData.appearanceKey = key; mesh.userData.itemId = id; mesh.userData.blockId = item?.block ? id : null;
}
export function createItemMesh(size = .375, id = 'test.block') {
  const mesh = createSharedBlock(size); setItemAppearance(mesh, id); return mesh;
}
