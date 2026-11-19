import { ITEMS } from './inventory.js';
export function damageMainTool(controller,amount=1) {
  const inv=controller.inventory,stack=inv.mainHand,item=ITEMS.get(stack?.id);
  if(controller.gameMode==='creative'||!item?.durability||amount<=0)return false;
  stack.damage=(stack.damage??0)+amount;
  if(stack.damage>item.durability)inv.slots[inv.selected]=null;
  inv.changed();return true;
}
export function miningToolWear(controller,block) {
  if(!(block.definition.hardness>0))return;
  const type=ITEMS.get(controller.inventory.mainHand?.id)?.tool?.type;
  const cost=type==='sword'?2:['pickaxe','axe','shovel'].includes(type)||type==='shears'&&block.definition.tags.includes('leaves')?1:0;
  damageMainTool(controller,cost);
}
export function useHoe(controller,world,hit) {
  if(ITEMS.get(controller.inventory.mainHand?.id)?.tool?.type!=='hoe')return {handled:false,success:false};
  if(!hit||hit.normal.y<0||!['dirt','grass.block'].includes(world.blockIdAt(hit.x,hit.y,hit.z))||world.hasBlock(hit.x,hit.y+1,hit.z))return {handled:true,success:false};
  const success=world.setBlock(hit.x,hit.y,hit.z,'farmland');
  if(success){damageMainTool(controller,1);controller.requestSwing();}
  return {handled:true,success};
}
