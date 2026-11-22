import { playerBounds } from './voxel-world.js';
export const WATER_EDGE = Object.freeze({ rise: .6, velocity: .3 });

// The old water offset test is a clearance PROBE, never a movement/step.
// Check the swept route too: an empty endpoint above a ceiling or beyond a
// narrow wall is not a valid way out. Runs only for wet horizontal collisions.
export function canEscapeWater(world, player, previousY, horizontal, halfWidth, height) {
  const size=player.size??1;
  const rise=WATER_EDGE.rise*size+player.vy+previousY-player.y;
  if(!(rise>0) || !Number.isFinite(rise))return false;
  const length=Math.hypot(horizontal.x,horizontal.z);
  if(!(length>0))return false;
  const reach=Math.min(1,WATER_EDGE.rise*size/length);
  const dx=horizontal.x*reach,dz=horizontal.z*reach;
  const up=world.moveRaw(player,{x:0,y:rise,z:0},halfWidth,height);
  if(up.blocked.y)return false;
  const ahead=world.moveRaw(up,{x:dx,y:0,z:dz},halfWidth,height);
  if(ahead.blocked.x || ahead.blocked.z)return false;
  const {min,max}=playerBounds(ahead,halfWidth,height);
  return !world.hasSolidInBox(min,max) && !world.fluids.sample(min,max).inWater;
}
