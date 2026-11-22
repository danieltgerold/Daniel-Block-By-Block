import { STONE_MATERIALS, STONE_SHAPES, MINERALS } from './mining-content.js';
import { farmlandBehavior } from './block-behaviors.js';
const mining=(hardness,level=0)=>({hardness,preferredTool:'pickaxe',requiresTool:true,harvestLevel:level,breakTicks:Math.ceil(hardness*100),breakTime:hardness*5});
export function registerStoneContent(register) {
  for(const [id,name,hardness,color] of STONE_MATERIALS.slice(2))register({id,name,color,...mining(hardness),creativeKind:'stone',creativeMaterial:id});
  for(const [base,name,h,color] of STONE_SHAPES)for(const shape of ['slab','stairs','wall']) {
    const id=`${base}.${shape}`,hardness=shape==='slab'?2:h;
    register({id,name:`${name} ${shape[0].toUpperCase()+shape.slice(1)}`,color,faces:{all:base},particleTexture:base,
      ...mining(hardness),collisionShape:shape,opaque:false,creativeKind:shape,creativeMaterial:base,
      defaultState:shape==='slab'?{type:'bottom'}:shape==='stairs'?{facing:'north',half:'bottom',shape:'straight'}:{},
      drops:({block})=>[{id,count:shape==='slab'&&block.state.type==='double'?2:1}]});
  }
  for(const [mineral,name,color,level,storageHardness,item] of MINERALS) {
    const id=`${mineral}.ore`,label=mineral==='iron'?'Iron':mineral==='gold'?'Gold':name;
    register({id,name:`${label} Ore`,color,...mining(3,level),creativeKind:'ore',creativeMaterial:mineral,
      drops:['iron','gold'].includes(mineral)?'self':({random=Math.random})=>[{id:item,count:mineral==='lapis'?4+Math.floor(random()*5):mineral==='redstone'?4+Math.floor(random()*2):1}]});
    if(storageHardness)register({id:`${mineral}.block`,name:`Block of ${mineral==='iron'?'Iron':mineral==='gold'?'Gold':name.replace(' Dust','')}`,color,
      ...mining(storageHardness,mineral==='iron'||mineral==='lapis'?1:mineral==='gold'||mineral==='diamond'||mineral==='emerald'||mineral==='redstone'?2:0),creativeKind:'storage',creativeMaterial:mineral});
  }
  register({id:'farmland',name:'Farmland',color:'#8d613d',faces:{top:'farmland.dry',side:'dirt',bottom:'dirt'},particleTexture:'dirt',
    collisionShape:'farmland',opaque:false,hardness:.6,preferredTool:'shovel',requiresTool:false,breakTicks:18,breakTime:.9,
    defaultState:{moisture:0,dryTicks:0},behavior:farmlandBehavior,drops:[{id:'dirt',count:1}],creativeCategory:'nature'});
}
