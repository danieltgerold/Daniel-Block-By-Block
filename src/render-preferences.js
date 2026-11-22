export const RENDER_SCALES = Object.freeze([.5,.75,1,1.5,2]);
export function renderPixelRatio(deviceRatio=1,scale=1) {
  return Math.min(Number.isFinite(deviceRatio)&&deviceRatio>0?deviceRatio:1,scale);
}
// Local visual preferences only. They never change gameplay or HUD CSS pixels.
export class RenderPreferences {
  constructor(document,storage=null,onResolutionChange=()=>{}) {
    this.storage=storage;this.removers=[];
    for(const [name,allowed,fallback] of [['render-scale',RENDER_SCALES,1],['damage-tilt',[0,.5,1],1]]) {
      const field=document.getElementById(name),key=`block-by-block.${name}`;
      let value=fallback;
      try { const saved=storage?.getItem(key);if(saved!==null&&saved!==undefined&&allowed.includes(Number(saved)))value=Number(saved); } catch { /* Session settings remain usable. */ }
      this[name]=value;field.value=String(value);
      const change=()=>{
        const next=Number(field.value);if(!allowed.includes(next))return;
        this[name]=next;
        try {storage?.setItem(key,String(next));}catch{/* Keep session value. */}
        if(name==='render-scale')onResolutionChange();
      };
      field.addEventListener('change',change);this.removers.push(()=>field.removeEventListener('change',change));
    }
  }
  pixelRatio(deviceRatio) {return renderPixelRatio(deviceRatio,this['render-scale']);}
  get damageTilt() {return this['damage-tilt'];}
  dispose(){for(const remove of this.removers)remove();}
}
