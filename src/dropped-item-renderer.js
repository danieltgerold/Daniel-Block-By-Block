import * as THREE from 'three';
import { createBlockItem } from './player-visuals.js';
export class DroppedItemRenderer {
  constructor(scene) { this.scene = scene; this.prototype = createBlockItem(.25); this.meshes = new Map(); }
  update(drops, alpha = 0) {
    const live = new Set();
    for (const pile of drops.piles) {
      live.add(pile.id);
      let mesh = this.meshes.get(pile.id);
      if (!mesh) { mesh = new THREE.Group(); this.meshes.set(pile.id, mesh); this.scene.add(mesh); }
      const desired = droppedCubeCount(pile.count);
      while (mesh.children.length > desired) mesh.remove(mesh.children.at(-1));
      while (mesh.children.length < desired) {
        const i = mesh.children.length, cube = this.prototype.clone();
        cube.position.fromArray(PILE_OFFSETS[i]); cube.rotation.y = i * .37; mesh.add(cube);
      }
      const ageTicks = (drops.time - pile.born) * 20 + alpha;
      const bob = Math.sin(ageTicks / 10 + pile.phase) * .1 + .1;
      mesh.position.set(pile.x, pile.y + .2 + bob, pile.z);
      mesh.rotation.y = ageTicks / 20 + pile.phase;
    }
    for (const [id, mesh] of this.meshes) if (!live.has(id)) { this.scene.remove(mesh); this.meshes.delete(id); }
  }
}
export const PILE_OFFSETS = Object.freeze([[0, 0, 0], [.09, .025, -.07], [-.09, -.025, .06], [.04, .04, .10], [-.06, -.035, -.10]].map(Object.freeze));
export function droppedCubeCount(count) {
  return count <= 0n ? 0 : count === 1n ? 1 : count <= 16n ? 2 : count <= 32n ? 3 : count <= 48n ? 4 : 5;
}
