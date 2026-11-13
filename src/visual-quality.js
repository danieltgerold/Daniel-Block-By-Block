export const VISUAL_QUALITY = Object.freeze([
  Object.freeze({ name: 'normal', particleFraction: 1, particleCap: 1024, particleDistance: 64, mergeVisuals: 64, mergeStep: 0 }),
  Object.freeze({ name: 'reduced', particleFraction: .5, particleCap: 768, particleDistance: 48, mergeVisuals: 24, mergeStep: .1 }),
  Object.freeze({ name: 'low', particleFraction: .25, particleCap: 256, particleDistance: 24, mergeVisuals: 0, mergeStep: .1 }),
]);
export class AdaptiveVisualQuality {
  constructor({ targetFps = 60, frameRateCap = null } = {}) {
    this.targetFps = targetFps; this.frameRateCap = frameRateCap; this.level = 0;
    this.frameSeconds = 1 / this.target; this.resetTiming();
  }
  get target() { return Math.min(this.targetFps, this.frameRateCap ?? Infinity); }
  get settings() { return VISUAL_QUALITY[this.level]; }
  resetTiming() { this.last = null; this.lowFor = this.severeFor = this.healthyFor = 0; }
  recordFrame(time, { active = true } = {}) {
    if (!active) { this.resetTiming(); return; }
    if (this.last === null) { this.last = time; return; }
    const dt = (time - this.last) / 1000; this.last = time;
    if (!(dt > 0) || dt > 1) { this.lowFor = this.severeFor = this.healthyFor = 0; return; }
    this.frameSeconds += (dt - this.frameSeconds) * (1 - Math.exp(-dt / .5));
    const fps = 1 / this.frameSeconds;
    this.lowFor = fps < this.target * .8 ? this.lowFor + dt : 0;
    this.severeFor = fps < this.target * .55 ? this.severeFor + dt : 0;
    this.healthyFor = fps >= this.target * .9 ? this.healthyFor + dt : 0;
    if ((this.level === 0 && this.lowFor >= 2) || (this.level === 1 && this.severeFor >= 2)) {
      this.level++; this.lowFor = this.severeFor = this.healthyFor = 0;
    } else if (this.level > 0 && this.healthyFor >= 5) {
      this.level--; this.lowFor = this.severeFor = this.healthyFor = 0;
    }
  }
}
