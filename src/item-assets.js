import * as THREE from 'three';
import { ITEMS } from './inventory.js';
import { createSharedBlock, getItemGeometry, getItemMaterials, getFaceTexture } from './block-assets.js';
import { spriteGeometry, spritePlaneGeometry } from './sprite-geometry.js';
const flatMaterials = new Map(), spriteTextures = new Map();
function spriteTexture(id) {
  if(!spriteTextures.has(id)) {
    const texture=getFaceTexture(id).clone();
    // getFaceTexture already stores logical top-down art in bottom-up GPU rows.
    // Keep that orientation for both picture faces and pixel-center edge UVs.
    texture.flipY=false;
    texture.minFilter=texture.magFilter=THREE.NearestFilter;texture.generateMipmaps=false;
    texture.wrapS=texture.wrapT=THREE.ClampToEdgeWrapping;texture.needsUpdate=true;
    spriteTextures.set(id,texture);
  }
  return spriteTextures.get(id);
}
export function setItemAppearance(mesh, id = 'dirt') {
  const key = `${id}:${mesh.userData.displayContext ?? 'world'}`;
  if (mesh.userData.appearanceKey === key) return;
  const item = ITEMS.get(id), size = mesh.userData.itemSize ?? 1;
  if (item?.model === 'flat') {
    const plane=item.spriteDepth===0,materialKey=`${item.texture}:${plane?'plane':'solid'}`;
    if (!flatMaterials.has(materialKey)) flatMaterials.set(materialKey, new THREE.MeshBasicMaterial({
      map: spriteTexture(item.texture), alphaTest: .5, side: plane?THREE.DoubleSide:THREE.FrontSide, vertexColors: !plane, depthWrite: true, depthTest: true,
    }));
    const spriteSize = mesh.userData.displayContext === 'firstperson' ? 1 : size;
    mesh.geometry = plane ? spritePlaneGeometry(spriteSize) : spriteGeometry(item.texture, spriteSize); mesh.material = flatMaterials.get(materialKey);
  } else { mesh.geometry = getItemGeometry(size, id); mesh.material = getItemMaterials(id, mesh.geometry); }
  mesh.userData.appearanceKey = key; mesh.userData.itemId = id; mesh.userData.blockId = item?.block ? id : null;
}
export function createItemMesh(size = .375, id = 'dirt') {
  const mesh = createSharedBlock(size); setItemAppearance(mesh, id); return mesh;
}
