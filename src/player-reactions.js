const STEP = .05, clamp = n => Math.max(0,Math.min(1,n));
const smooth = n => { n=clamp(n); return n*n*(3-2*n); };
// Visual state, advanced by the same fixed world clock. Dead player physics and
// vitals stay frozen while world systems keep ticking independently.
export class PlayerReactions {
  constructor() { this.reset(); }
  reset() { this.hurtAge = this.previousHurtAge = -1; this.hurtSerial = 0; this.dead = false; this.deathTicks = 0; this.deathAccumulator = 0; }
  hurt() { this.hurtAge = this.previousHurtAge = 0; this.hurtSerial++; }
  clearHurt() { this.hurtAge = this.previousHurtAge = -1; }
  die() { if(this.dead)return;this.dead=true;this.deathTicks=0;this.deathAccumulator=0; }
  tick() {
    this.previousHurtAge=this.hurtAge;
    if(this.hurtAge>=0 && ++this.hurtAge>=10)this.hurtAge=-1;
  }
  advanceDeath(seconds) {
    if(!this.dead || !Number.isFinite(seconds) || seconds<=0)return;
    this.deathAccumulator+=Math.min(seconds,1);
    while(this.deathAccumulator+1e-9>=STEP && this.deathTicks<20){this.deathAccumulator-=STEP;this.deathTicks++;this.tick();}
    if(this.deathTicks>=20)this.deathAccumulator=0;
  }
  pose(alpha=0) {
    let age=this.hurtAge;
    if(this.dead && age>=0)age+=this.deathAccumulator/STEP+alpha;
    else if(this.previousHurtAge>=0)age=this.previousHurtAge+((age<0?10:age)-this.previousHurtAge)*alpha;
    const t=clamp(age/10);
    const death=smooth((this.deathTicks+this.deathAccumulator/STEP+(this.dead?alpha:0))/20);
    return { hurtRoll:age<0?0:-.18*Math.sin(Math.PI*Math.sqrt(t))*(1-t), deathProgress:death, deathRoll:-.22*smooth(death*2) };
  }
}
export function applyCameraReaction(camera, handCamera, pose, mode, strength=1) {
  const roll=pose.hurtRoll*strength+(mode===0?pose.deathRoll:0);
  camera.rotateZ(roll); if(handCamera)handCamera.rotation.z=roll;
  return roll;
}
