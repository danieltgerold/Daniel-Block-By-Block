// Original 16px silhouettes. Rows describe inclusive runs of the metal/head
// interior; a one-pixel border is generated once around each complete shape.
// All ordinary grips run from lower left to upper right, matching the shared
// handheld display anchor. Material changes never change a tool's silhouette.
const HEADS = {
  pickaxe: [[1,6,10],[2,4,12],[3,3,5],[3,10,13],[4,2,3],[4,12,14],[5,2,2],[5,13,14],[6,13,13]],
  axe: [[1,4,7],[2,3,8],[3,3,9],[4,3,10],[5,3,6],[6,4,5]],
  shovel: [[1,13,13],[2,11,14],[3,10,14],[4,10,13],[5,10,12],[6,10,11]],
  hoe: [[2,6,12],[3,6,13],[4,12,13],[5,12,12]],
  sword: [[1,13,13],[2,12,13],[3,11,12],[4,10,11],[5,9,10],[6,8,9],[7,7,8],[8,6,7],[9,6,6]],
};
const tone = (hex,k) => '#' + hex.slice(1).match(/../g).map(c => Math.min(255,Math.round(parseInt(c,16)*k)).toString(16).padStart(2,'0')).join('');
export function toolPalette(definition) {
  const handles = definition.tool.type === 'shears' ? ['#394750','#7b8b94','#c1d0d5'] : ['#493325','#986839','#d4a362'];
  return ['#00000000',...handles,tone(definition.color,.43),definition.color,tone(definition.color,1.24),tone(definition.color,.78)];
}
export function paintTool(rect,type) {
  const art = new Uint8Array(256), at = (x,y) => y*16+x;
  const set = (x,y,c) => { if(x>=0&&x<16&&y>=0&&y<16)art[at(x,y)]=c; };
  const shape = (points,highlight = (x,y,has) => !has(x,y-1)) => {
    const mask = new Set(points.map(([x,y])=>at(x,y))), has = (x,y) => x>=0&&x<16&&y>=0&&y<16&&mask.has(at(x,y));
    for(const [x,y] of points)for(const [dx,dy] of [[-1,0],[1,0],[0,-1],[0,1]])if(!has(x+dx,y+dy))set(x+dx,y+dy,4);
    for(const [x,y] of points)set(x,y,highlight(x,y,has)?6:!has(x,y+1)?7:5);
  };
  if(type==='shears') {
    // Slender crossed blades, separated tips, a pivot, and two genuinely open
    // handle loops. Their transparent centers also exercise generated hole edges.
    const blades=[];
    for(let i=0;i<6;i++)blades.push([4+i,2+i],[11-i,2+i]);
    blades.push([7,7],[8,7],[6,8],[9,8],[5,9],[10,9],[5,10],[10,10]);
    shape(blades);
    for(const left of [2,10])for(let y=10;y<=14;y++)for(let x=left;x<=left+3;x++) {
      if(x===left||x===left+3||y===10||y===14)set(x,y,y===10?3:1);
      else set(x,y,0);
    }
    set(7,6,4);set(8,7,6);
  } else {
    // Two-pixel wooden shaft with a dark edge and a restrained lit edge.
    const length=type==='sword'?4:type==='axe'?8:type==='shovel'?9:10;
    for(let i=0;i<length;i++){set(2+i,14-i,1);set(3+i,14-i,1);set(2+i,13-i,3);set(3+i,13-i,2);}
    if(type==='sword') {
      // Short grip and a crossguard perpendicular to the narrow diagonal blade.
      const guard=[];for(let i=0;i<5;i++)guard.push([4+i,8+i]);
      shape(guard);
    }
    const points=[];for(const [y,left,right] of HEADS[type])for(let x=left;x<=right;x++)points.push([x,y]);
    shape(points,type==='axe'?(x,y,has)=>!has(x-1,y):(x,y,has)=>!has(x,y-1));
  }
  // Rect writer is shared with all textures; clip here instead of wrapping
  // strokes across an edge of the tile and producing unrelated stray pixels.
  art.forEach((color,i)=>{if(color)rect(i%16,Math.floor(i/16),1,1,color);});
}
