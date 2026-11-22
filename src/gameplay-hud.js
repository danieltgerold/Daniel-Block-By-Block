import { vitalIcon } from './vital-icons.js';
// Round halves away from zero consistently, without ever displaying "-0".
export const roundCoordinate = value => Math.sign(value) * Math.round(Math.abs(value)) || 0;
export const coordinateText = feet => ['x', 'y', 'z'].map(axis => `${axis.toUpperCase()}: ${roundCoordinate(feet[axis])}`).join('  ');
const SIMULATION_MODES = new Set(['playing','ready','inventory','chat','menu','death']);
export const gameSimulationRunning = mode => SIMULATION_MODES.has(mode);
export function updateCrosshair(element, mode, cameraMode) {
  element.hidden = mode !== 'playing' || cameraMode !== 0;
}

export class GameplayHUD {
  constructor(document, storage = null) {
    this.root = document.getElementById('world-hud');
    this.coordinates = document.getElementById('coordinates');
    this.fps = document.getElementById('fps');
    this.survival = document.getElementById('survival-hud');
    this.saturation = document.getElementById('saturation-value');
    this.vitalRows = new Map();
    for (const kind of ['health','hunger']) {
      const row = document.getElementById(`${kind}-bar`);
      row.replaceChildren();
      const icons = Array.from({length:10},()=>{const icon=document.createElement('img');icon.alt='';icon.width=18;icon.height=18;row.append(icon);return icon;});
      this.vitalRows.set(kind,{row,icons});
    }
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
  updatePosition(feet) { const text=coordinateText(feet);if(this.coordinates.textContent!==text)this.coordinates.textContent=text; }
  updateVitals(controller, mode) {
    const v = controller.vitals;
    const previous=this.lastVitals;
    if(previous && previous.health===v.health && previous.hunger===v.hunger && previous.saturation===v.saturation
      && previous.developer===controller.developerMode && previous.gameMode===controller.gameMode && previous.mode===mode)return;
    this.lastVitals={health:v.health,hunger:v.hunger,saturation:v.saturation,developer:controller.developerMode,gameMode:controller.gameMode,mode};
    this.survival.hidden = controller.gameMode !== 'survival' || v.dead || !['playing','ready','chat'].includes(mode);
    for (const [kind,{row,icons}] of this.vitalRows) {
      const value = Math.ceil(v[kind]);
      const label = `${kind === 'health' ? 'Health' : 'Hunger'}: ${v[kind]} / 20`;
      if(row.getAttribute('aria-label') !== label)row.setAttribute('aria-label',label);
      icons.forEach((icon,i)=>{const fill=Math.max(0,Math.min(2,value-i*2));if(icon.dataset.fill!==String(fill)){icon.src=vitalIcon(kind,fill);icon.dataset.fill=String(fill);}});
    }
    this.saturation.hidden = !controller.developerMode;
    const text = `Saturation: ${v.saturation.toFixed(1)} / ${v.hunger}`;
    if(this.saturation.textContent !== text)this.saturation.textContent = text;
  }
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
