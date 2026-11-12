import * as THREE from 'three';
import { playerBounds } from './voxel-world.js';

// All entities use the same bounds function as physical collision. No rig yaw,
// model scale guesses, or camera-space geometry participates in these outlines.
export class EntityHitboxes {
  constructor(scene) {
    this.group = new THREE.Group();
    this.group.name = 'Entity Collision Boxes';
    this.group.visible = false;
    scene.add(this.group);
    const cube = new THREE.BoxGeometry(1, 1, 1);
    this.geometry = new THREE.EdgesGeometry(cube);
    cube.dispose();
    this.material = new THREE.LineBasicMaterial({ color: '#e5f5ff', depthTest: true, depthWrite: false });
    this.lines = new Map();
  }
  update(entities, cameraMode, enabled) {
    this.group.visible = enabled;
    for (const line of this.lines.values()) line.visible = false;
    if (!enabled) return;
    for (const entity of entities) {
      if (entity.local && cameraMode === 0) continue;
      let line = this.lines.get(entity.id);
      if (!line) {
        line = new THREE.LineSegments(this.geometry, this.material);
        line.name = `Hitbox ${entity.id}`;
        this.lines.set(entity.id, line); this.group.add(line);
      }
      const { min, max } = playerBounds(entity);
      line.position.set((min.x + max.x) / 2, (min.y + max.y) / 2, (min.z + max.z) / 2);
      line.scale.set(max.x - min.x, max.y - min.y, max.z - min.z);
      line.visible = true;
    }
  }
  dispose() { this.group.removeFromParent(); this.geometry.dispose(); this.material.dispose(); }
}
