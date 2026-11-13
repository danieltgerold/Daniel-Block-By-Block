import * as THREE from 'three';
import { createBlockItem } from './player-visuals.js';
import { mergeEase } from './dropped-items.js';
import { EntityVisibility } from './entity-visibility.js';
import { VISUAL_QUALITY } from './visual-quality.js';
export const DROPPED_ITEM_RENDER_SETTINGS = Object.freeze({
  // The five rotating .25 cubes plus fixed offsets and the full .2 bob range
  // fit inside this sphere. Merge bob blending stays in the same envelope.
  bounds: Object.freeze({ radius: .5, offset: Object.freeze({ x: 0, y: .3, z: 0 }) }),
  detail: Object.freeze({ distance: 24, hysteresis: .5 }),
});
export class DroppedItemRenderer {
  constructor(scene, { visibility = new EntityVisibility(), settings = DROPPED_ITEM_RENDER_SETTINGS } = {}) {
    Object.assign(this, { scene, visibility, settings });
    this.prototype = createBlockItem(.25); this.meshes = new Map(); this.states = new Map();
  }
  update(drops, alpha = 0, camera = null, quality = null) {
    this.visibility.beginFrame(camera);
    const live = new Set();
    const now = drops.time + alpha * .05;
    const targets = new Map(drops.piles.map(p => [p.id, p]));
    const interpolated = p => ({ x: (p.previous?.x ?? p.x) + (p.x - (p.previous?.x ?? p.x)) * alpha,
      y: (p.previous?.y ?? p.y) + (p.y - (p.previous?.y ?? p.y)) * alpha,
      z: (p.previous?.z ?? p.z) + (p.z - (p.previous?.z ?? p.z)) * alpha });
    const visible = drops.piles.map(p => ({ pile: p, at: interpolated(p) }));
    const performance = quality?.settings ?? VISUAL_QUALITY[0];
    const effects = performance.mergeVisuals ? (drops.transitions ?? []).slice(-performance.mergeVisuals) : [];
    for (const effect of effects) {
      const target = targets.get(effect.targetId);
      if (!target || effect.count <= 0n || now >= effect.ends) continue;
      const elapsed = performance.mergeStep ? Math.floor(Math.max(0, now - effect.started) / performance.mergeStep) * performance.mergeStep : now - effect.started;
      const t = performance.mergeStep ? Math.min(1, elapsed / (effect.ends - effect.started)) : mergeEase(elapsed / (effect.ends - effect.started));
      const destination = interpolated(target);
      // Converge on the destination's rendered bob as well as its live physics
      // position, so the source does not disappear above/below the cluster.
      const bobDelta = (Math.sin((now - target.born) * 2 + target.phase) - Math.sin((now - effect.born) * 2 + effect.phase)) * .1 * t;
      visible.push({ pile: effect, at: { x: effect.from.x + (destination.x - effect.from.x) * t,
        y: effect.from.y + (destination.y - effect.from.y) * t, z: effect.from.z + (destination.z - effect.from.z) * t }, bobDelta });
    }
    for (const { pile, at, bobDelta = 0 } of visible) {
      live.add(pile.id);
      let state = this.states.get(pile.id);
      if (!state) { state = {}; this.states.set(pile.id, state); }
      this.visibility.evaluate(at, this.settings, state);
      let mesh = this.meshes.get(pile.id);
      if (!state.visible) { if (mesh) mesh.visible = false; continue; }
      if (!mesh) { mesh = new THREE.Group(); this.meshes.set(pile.id, mesh); this.scene.add(mesh); }
      mesh.visible = true;
      const desired = state.simplified ? 1 : droppedCubeCount(pile.count);
      // Retain allocated cube nodes across detail/count changes. Only visible
      // children draw; all nodes share the existing geometry and material.
      while (mesh.children.length < desired) {
        const i = mesh.children.length, cube = this.prototype.clone();
        cube.position.fromArray(PILE_OFFSETS[i]); cube.rotation.y = i * .37; mesh.add(cube);
      }
      mesh.children.forEach((cube, i) => { cube.visible = i < desired; });
      const ageTicks = (drops.time - pile.born) * 20 + alpha;
      const bob = Math.sin(ageTicks / 10 + pile.phase) * .1 + .1;
      mesh.position.set(at.x, at.y + .2 + bob + bobDelta, at.z);
      mesh.rotation.y = ageTicks / 20 + pile.phase;
    }
    for (const [id, mesh] of this.meshes) if (!live.has(id)) { this.scene.remove(mesh); this.meshes.delete(id); }
    for (const id of this.states.keys()) if (!live.has(id)) this.states.delete(id);
  }
}
export const PILE_OFFSETS = Object.freeze([[0, 0, 0], [.09, .025, -.07], [-.09, -.025, .06], [.04, .04, .10], [-.06, -.035, -.10]].map(Object.freeze));
export function droppedCubeCount(count) {
  return count <= 0n ? 0 : count === 1n ? 1 : count <= 16n ? 2 : count <= 32n ? 3 : count <= 48n ? 4 : 5;
}
