// Shared content descriptors feed the existing registries, art and recipes.
export const STONE_MATERIALS = [
  ['stone','Stone',1.5,'#929da4'],['cobblestone','Cobblestone',2,'#879198'],
  ['mossy.cobblestone','Mossy Cobblestone',2,'#788b67'],['stone.bricks','Stone Bricks',1.5,'#929a96'],
  ['mossy.stone.bricks','Mossy Stone Bricks',1.5,'#7c916e'],['cracked.stone.bricks','Cracked Stone Bricks',1.5,'#858f89'],
  ['chiseled.stone.bricks','Chiseled Stone Bricks',1.5,'#929d96'],['granite','Granite',1.5,'#ae7d69'],
  ['diorite','Diorite',1.5,'#d1d2c6'],['andesite','Andesite',1.5,'#909d96'],
  ['polished.granite','Polished Granite',1.5,'#b68975'],['polished.diorite','Polished Diorite',1.5,'#d7d8cf'],['polished.andesite','Polished Andesite',1.5,'#a0aaa4'],
];
export const STONE_SHAPES = STONE_MATERIALS.slice(0,5);
export const MINERALS = [
  ['coal','Coal','#414846',0,5,'coal'],['iron','Iron Ingot','#d8d8cb',1,5,'iron.ingot'],
  ['gold','Gold Ingot','#e9bc42',2,3,'gold.ingot'],['lapis','Lapis Lazuli','#427ac2',1,3,'lapis.lazuli'],
  ['redstone','Redstone Dust','#ca4849',2,5,'redstone.dust'],['diamond','Diamond','#57ced5',2,5,'diamond'],
  ['emerald','Emerald','#40b878',2,5,'emerald'],['nether.quartz','Nether Quartz','#eadcc5',0,0,'nether.quartz'],
];
export const TOOL_MATERIALS = [
  ['wood',2,0,59,'#ba8b51'],['stone',4,1,131,'#9ca6a6'],['iron',6,2,250,'#d6e1df'],
  ['gold',12,0,32,'#ecc448'],['diamond',8,3,1561,'#53d5d0'],
];
export const TOOL_TYPES = ['pickaxe','axe','shovel','hoe','sword'];
export const TOOL_DEFINITIONS = new Map();
for(const [material,speed,level,durability,color] of TOOL_MATERIALS)for(const type of TOOL_TYPES) {
  const id=`${material}.${type}`,title=s=>s[0].toUpperCase()+s.slice(1);
  TOOL_DEFINITIONS.set(id,{id,name:`${material==='wood'?'Wooden':title(material)} ${title(type)}`,maxStack:1,
    durability,color,model:'flat',display:'handheld',texture:id,tool:Object.freeze({type,speed,level}),creativeCategory:'materials',creativeKind:type,creativeMaterial:material});
}
TOOL_DEFINITIONS.set('shears',{id:'shears',name:'Shears',maxStack:1,durability:238,color:'#c7d4d2',model:'flat',display:'item',texture:'shears',
  tool:Object.freeze({type:'shears',speed:15,level:0}),creativeCategory:'materials',creativeKind:'shears'});
