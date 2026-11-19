import * as THREE from 'three';
import { createPlayerModel, animatePlayerModel, syncEquipment } from './player-visuals.js';

export class InventoryPreviewPose {
  constructor() { this.reset(); }
  reset() { this.yaw = this.pitch = this.torso = this.targetYaw = this.targetPitch = 0; }
  aim(x, y) { this.targetYaw = THREE.MathUtils.clamp(x * .65, -.65, .65); this.targetPitch = THREE.MathUtils.clamp(-y * .4, -.4, .4); }
  step() {
    this.yaw += (this.targetYaw - this.yaw) * .15;
    this.pitch += (this.targetPitch - this.pitch) * .15;
    this.torso += (this.targetYaw * .35 - this.torso) * .1;
    return { torsoYaw: this.torso, aimPitch: this.pitch, headYaw: this.yaw - this.torso,
      phase: 0, amount: 0, crouch: 0, swingActive: false, swingProgress: 0 };
  }
}
export class InventoryPreview {
  constructor(canvas, inventory) {
    this.canvas = canvas; this.inventory = inventory; this.pose = new InventoryPreviewPose();
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
    this.renderer.setPixelRatio(Math.min(globalThis.devicePixelRatio ?? 1, 2));
    this.renderer.setSize(135, 180, false);
    this.scene = new THREE.Scene(); this.model = createPlayerModel(); this.scene.add(this.model);
    this.camera = new THREE.PerspectiveCamera(35, 135 / 180, .05, 20);
    this.camera.position.set(0, 1.05, -3.7); this.camera.lookAt(0, .95, 0);
  }
  reset() { this.pose.reset(); }
  aim(x, y) {
    const rect = this.canvas.getBoundingClientRect();
    this.pose.aim((x - rect.left - rect.width / 2) / 180, (y - rect.top - rect.height / 2) / 180);
  }
  render() {
    animatePlayerModel(this.model, { x: 0, y: 0, z: 0, size: 1 }, this.pose.step(), 1, this.inventory);
    syncEquipment(this.model, this.inventory); this.renderer.render(this.scene, this.camera);
  }
}
