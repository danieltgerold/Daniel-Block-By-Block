import * as THREE from 'three';
import { createBlockItem } from './player-visuals.js';
export class DroppedItemRenderer {
  constructor(scene, texture) { this.scene = scene; this.prototype = createBlockItem(.25, texture); this.meshes = new Map(); }
  update(drops, alpha = 0) {
    const live = new Set();
    for (const pile of drops.piles) {
      live.add(pile.id);
      let mesh = this.meshes.get(pile.id);
      if (!mesh) { mesh = this.prototype.clone(); this.meshes.set(pile.id, mesh); this.scene.add(mesh); }
      mesh.position.set(pile.x, pile.y + .18 + Math.sin((drops.time + alpha * .05) * 2 + pile.id) * .035, pile.z);
      mesh.rotation.y = (drops.time + alpha * .05) * .7 + pile.id;
    }
    for (const [id, mesh] of this.meshes) if (!live.has(id)) { this.scene.remove(mesh); this.meshes.delete(id); }
  }
}
