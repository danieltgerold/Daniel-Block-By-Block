import * as THREE from 'three';
import { blockBoxes } from './block-shapes.js';
export class BlockOutline extends THREE.Group {
  constructor() {
    super(); this.geometry = new THREE.EdgesGeometry(new THREE.BoxGeometry(1, 1, 1));
    this.material = new THREE.LineBasicMaterial({ color: '#fff4ad' }); this.visible = false;
  }
  update(hit, world) {
    this.visible = Boolean(hit); if (!hit) return;
    const boxes = blockBoxes(world.blockAt(hit.x, hit.y, hit.z), 'selection', world);
    while (this.children.length < boxes.length) this.add(new THREE.LineSegments(this.geometry, this.material));
    this.children.forEach((line, i) => {
      line.visible = i < boxes.length; if (!line.visible) return;
      const b = boxes[i]; line.position.set(hit.x + (b[0] + b[3]) / 2, hit.y + (b[1] + b[4]) / 2, hit.z + (b[2] + b[5]) / 2);
      line.scale.set(b[3] - b[0] + .003, b[4] - b[1] + .003, b[5] - b[2] + .003);
    });
  }
}
