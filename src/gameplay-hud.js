// Round halves away from zero consistently, without ever displaying "-0".
export const roundCoordinate = value => Math.sign(value) * Math.round(Math.abs(value)) || 0;
export const coordinateText = feet => ['x', 'y', 'z'].map(axis => `${axis.toUpperCase()}: ${roundCoordinate(feet[axis])}`).join('  ');

export class GameplayHUD {
  constructor(document, storage = null) {
    this.root = document.getElementById('world-hud');
    this.coordinates = document.getElementById('coordinates');
    this.fps = document.getElementById('fps');
    this.listeners = [];
    for (const [name, output] of [['coordinates', this.coordinates], ['fps', this.fps]]) {
      const toggle = document.getElementById(`show-${name}`);
      const key = `block-by-block.show-${name}`;
      let enabled = true;
      try { enabled = storage?.getItem(key) !== 'false'; } catch { /* Default on without storage. */ }
      toggle.checked = enabled;
      output.hidden = !enabled;
      const change = () => {
        output.hidden = !toggle.checked;
        try { storage?.setItem(key, String(toggle.checked)); } catch { /* Keep the session setting. */ }
      };
      toggle.addEventListener('change', change);
      this.listeners.push(() => toggle.removeEventListener('change', change));
    }
    this.resetFrames();
  }
  resetFrames() { this.lastFrame = null; this.elapsed = 0; this.frames = 0; }
  updatePosition(feet) { this.coordinates.textContent = coordinateText(feet); }
  renderedFrame(time, feet) {
    this.updatePosition(feet);
    if (this.lastFrame !== null) {
      const delta = time - this.lastFrame;
      // A hidden tab or suspended browser is not a rendered-frame sample.
      if (delta <= 0 || delta > 1000) { this.elapsed = 0; this.frames = 0; }
      else { this.elapsed += delta; this.frames++; }
      if (this.elapsed >= 500) {
        this.fps.textContent = `FPS: ${Math.round(this.frames * 1000 / this.elapsed)}`;
        this.elapsed = 0; this.frames = 0;
      }
    }
    this.lastFrame = time;
  }
  dispose() { for (const remove of this.listeners) remove(); }
}
