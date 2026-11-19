import { createSharedBlock } from './block-assets.js';
import { EntityVisibility } from './entity-visibility.js';
const SETTINGS = { bounds: { radius: .87, offset: { y: .5 } } };
export class FallingBlockRenderer {
  constructor(scene) { this.scene = scene; this.meshes = new Map(); this.visibility = new EntityVisibility(); this.state = {}; }
  update(falling, alpha, camera) {
    this.visibility.beginFrame(camera); const live = new Set();
    for (const e of falling.entities) {
      live.add(e.serial);
      let mesh = this.meshes.get(e.serial);
      if (!mesh) { mesh = createSharedBlock(1,e.id); this.meshes.set(e.serial,mesh); this.scene.add(mesh); }
      const y = e.previous.y+(e.y-e.previous.y)*alpha;
      mesh.position.set(e.x,y+.5,e.z);
      mesh.visible = this.visibility.evaluate({x:e.x,y,z:e.z},SETTINGS,this.state).visible;
    }
    for (const [id,mesh] of this.meshes) if (!live.has(id)) { this.scene.remove(mesh); this.meshes.delete(id); }
  }
}
