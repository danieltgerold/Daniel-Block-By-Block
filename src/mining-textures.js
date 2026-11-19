import { STONE_MATERIALS, MINERALS, TOOL_DEFINITIONS } from './mining-content.js';
const shade=(hex,k)=>'#'+hex.slice(1).match(/../g).map(c=>Math.min(255,Math.round(parseInt(c,16)*k)).toString(16).padStart(2,'0')).join('');
export function registerMiningTextures(tile,tiles) {
  for(const [id,, ,color] of STONE_MATERIALS)if(!tiles.has(id)) {
    const mossy=id.startsWith('mossy.'),palette=[color,shade(color,.72),shade(color,1.12),shade(color,.9), '#4d7540','#78944f'];
    tile(id,palette,r=>{
      if(id.includes('bricks')) {
        for(const y of [0,8]){r(0,y,16,1,1);r(0,y+1,16,1,2);r(y?8:2,y,1,8,1);}
        r(4,4,6,1,3);r(10,12,4,1,3);
        if(id.startsWith('cracked'))for(const [x,y] of [[5,1],[6,2],[6,3],[7,4],[7,5],[11,9],[10,10],[10,11],[9,12]])r(x,y,1,2,1);
        if(id.startsWith('chiseled')) {r(2,2,12,12,1);r(3,3,10,10,2);r(4,4,8,8,0);r(6,6,4,4,1);r(7,7,2,2,3);}
      } else if(id.includes('cobblestone')) {
        r(0,0,16,16,1);for(const [x,y,w,h] of [[1,1,6,6],[9,1,6,4],[1,9,4,6],[7,8,8,7]]){r(x,y,w,h,0);r(x,y,w-1,1,2);}
      } else {
        for(let y=1;y<16;y+=4)for(let x=1;x<16;x+=4) {const n=(x*7+y*3)%3+1;r(x,y,2+(x+y)%2,2,n);}
        if(id.startsWith('polished')) {r(0,0,16,1,2);r(0,0,1,16,2);r(0,15,16,1,1);r(15,0,1,16,1);r(3,4,7,1,0);r(7,9,6,1,0);}
      }
      if(mossy)for(const [x,y] of [[1,5],[2,6],[10,2],[11,3],[6,11],[7,12],[13,13]]){r(x,y,2,2,4);r(x,y,1,1,5);}
    });
  }
  for(const [id,,color,,hardness,item] of MINERALS) {
    tile(`${id}.ore`,id==='nether.quartz'?['#784b45','#583b39','#936258',color,shade(color,.75),shade(color,1.1)]:['#929da4','#7e8b91','#a2abb0',color,shade(color,.75),shade(color,1.1)],r=>{
      r(1,1,5,1,2);r(10,8,5,2,1);r(3,13,5,1,1);
      for(const [x,y] of [[3,3],[11,2],[8,8],[2,11],[12,12]]){r(x,y,3,2,4);r(x,y,2,1,3);r(x+1,y+1,2,1,3);r(x,y,1,1,5);}
    });
    if(hardness)tile(`${id}.block`,[color,shade(color,.65),shade(color,1.2),shade(color,.85)],r=>{
      r(0,0,16,1,2);r(0,1,1,15,2);r(0,15,16,1,1);r(15,0,1,16,1);
      r(3,3,10,1,2);r(3,4,1,8,2);r(4,12,9,1,3);r(12,4,1,8,3);r(6,6,4,3,id==='coal'?3:0);
      if(id==='lapis'||id==='coal')for(const [x,y] of [[2,7],[9,2],[6,11],[12,9]])r(x,y,2,2,3);
    });
    tile(item,['#00000000',shade(color,.55),color,shade(color,1.2),shade(color,.85)],r=>{
      if(id==='iron'||id==='gold') {r(4,4,8,1,1);r(2,5,12,6,1);r(3,11,10,1,1);r(4,5,8,1,3);r(3,6,10,4,2);r(5,6,6,1,3);r(3,10,10,1,4);}
      else if(id==='redstone') {r(5,5,5,2,1);r(2,8,12,4,1);r(4,6,7,5,2);r(3,9,10,2,2);r(5,7,3,2,3);r(10,8,2,2,4);}
      else if(id==='coal'||id==='lapis') {r(5,2,6,1,1);r(3,3,10,8,1);r(4,11,7,2,1);r(4,4,8,6,2);r(6,3,4,2,3);r(5,10,5,2,4);}
      else {r(6,1,4,1,1);r(4,2,8,3,1);r(3,5,10,5,1);r(5,10,6,3,1);r(7,13,2,1,1);r(5,3,6,3,2);r(4,6,8,3,2);r(6,9,4,3,2);r(6,3,2,5,3);r(9,6,2,3,4);}
    });
  }
  for(const [id,def] of TOOL_DEFINITIONS)tile(id,['#00000000','#4d392c','#946b43','#c69a61',shade(def.color,.6),def.color,shade(def.color,1.15)],r=>{
    const type=def.tool.type;
    if(type==='shears') {r(3,9,4,5,1);r(9,9,4,5,1);r(4,10,2,3,2);r(10,10,2,3,2);for(let i=0;i<7;i++){r(4+i,2+i,2,2,5);r(10-i,2+i,2,2,5);}r(7,7,2,2,4);r(5,2,1,3,6);return;}
    for(let i=0;i<8;i++){r(2+i,12-i,2,2,1);r(2+i,12-i,1,1,2);}r(3,12,1,1,3);
    if(type==='pickaxe'){r(5,2,9,2,4);r(6,1,6,1,4);r(5,2,8,1,5);r(6,2,4,1,6);r(13,4,2,4,4);r(13,4,1,3,5);r(4,3,2,2,5);}
    if(type==='axe'){r(8,1,5,7,4);r(7,2,7,4,4);r(8,2,5,4,5);r(9,2,3,1,6);r(8,6,3,1,5);}
    if(type==='shovel'){r(9,1,4,1,4);r(8,2,6,4,4);r(9,6,4,1,4);r(9,2,4,3,5);r(9,2,2,1,6);r(9,5,3,1,5);}
    if(type==='hoe'){r(5,2,9,2,4);r(6,2,7,1,5);r(12,4,2,3,4);r(12,4,1,2,5);r(7,2,3,1,6);}
    if(type==='sword'){for(let i=0;i<9;i++){r(5+i,8-i,3,3,4);r(6+i,8-i,1,2,5);r(6+i,8-i,1,1,6);}r(4,8,5,2,1);r(5,8,4,1,5);}
  });
  for(const wet of [false,true])tile(wet?'farmland.wet':'farmland.dry',wet?['#69472f','#3f3023','#805638']:['#a47145','#765035','#b38251'],r=>{
    for(let z=1;z<16;z+=4){r(0,z,16,2,1);r(0,z-1,16,1,2);}r(3,5,2,1,0);r(11,13,2,1,0);
  });
}
