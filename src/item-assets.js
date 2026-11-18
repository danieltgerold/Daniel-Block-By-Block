import * as THREE from 'three';
import { ITEMS } from './inventory.js';
import { createSharedBlock, getItemGeometry, getItemMaterials, getFaceTexture } from './block-assets.js';
import { spriteGeometry, spritePlaneGeometry } from './sprite-geometry.js';
const flatMaterials = new Map();
export function setItemAppearance(mesh, id = 'dirt') {
  const key = `${id}:${mesh.userData.displayContext ?? 'world'}`;
  if (mesh.userData.appearanceKey === key) return;
  const item = ITEMS.get(id), size = mesh.userData.itemSize ?? 1;
  if (item?.model === 'flat') {
    if (!flatMaterials.has(item.texture)) flatMaterials.set(item.texture, new THREE.MeshBasicMaterial({
      map: getFaceTexture(item.texture), alphaTest: .5, side: THREE.DoubleSide, vertexColors: item.spriteDepth !== 0, depthWrite: true, depthTest: true,
    }));
    const spriteSize = mesh.userData.displayContext === 'firstperson' ? item.display === 'item' ? .6 : 1 : size;
    mesh.geometry = item.spriteDepth === 0 ? spritePlaneGeometry(spriteSize) : spriteGeometry(item.texture, spriteSize); mesh.material = flatMaterials.get(item.texture);
  } else { mesh.geometry = getItemGeometry(size, id); mesh.material = getItemMaterials(id, mesh.geometry); }
  mesh.userData.appearanceKey = key; mesh.userData.itemId = id; mesh.userData.blockId = item?.block ? id : null;
}
export function createItemMesh(size = .375, id = 'dirt') {
  const mesh = createSharedBlock(size); setItemAppearance(mesh, id); return mesh;
}
