// Tick-driven ownership: a block exists either in its cell, in entities, or as
// one emitted item. Renderers never own quantities or change world cells.
export class FallingBlocks {
  constructor(world) { this.world = world; this.time = 0; this.serial = 0; this.pending = new Map(); this.entities = []; }
  changed(x, y, z) { this.schedule(x,y,z); this.schedule(x,y+1,z); }
  schedule(x,y,z) {
    if (!this.world.blockAt(x,y,z)?.definition.falling) return;
    const key = `${x},${y},${z}`;
    if (!this.pending.has(key)) this.pending.set(key, { x,y,z, due: this.time + 2 });
  }
  supported(x,y,z) {
    return this.world.hasSolidInBox({ x: x+.001, y: y-1e-6, z: z+.001 }, { x: x+.999, y, z: z+.999 });
  }
  tick() {
    this.time++;
    for (const [key, at] of this.pending) if (at.due <= this.time) {
      this.pending.delete(key);
      const block = this.world.blockAt(at.x,at.y,at.z);
      if (!block?.definition.falling || this.supported(at.x,at.y,at.z)) continue;
      const entity = { serial: ++this.serial, id: block.id, state: { ...block.state }, x: at.x+.5, y: at.y, z: at.z+.5, vy: 0, age: 0 };
      entity.previous = { x: entity.x, y: entity.y, z: entity.z };
      this.world.setBlock(at.x,at.y,at.z,false); this.entities.push(entity);
    }
    // Lower entities settle first, letting the world collision handle the next
    // block in a stack immediately, without overlapping or overwriting it.
    this.entities.sort((a,b) => a.y-b.y || a.serial-b.serial);
    const alive = [], columns = new Map();
    for (const e of this.entities) {
      e.previous = { x: e.x, y: e.y, z: e.z }; e.age++; e.vy -= .04;
      const motion = this.world.moveRaw(e, { x: 0, y: e.vy, z: 0 }, .5, 1);
      const column = `${e.x},${e.z}`, lower = columns.get(column);
      const onEntity = lower && e.y >= lower.y+1-1e-7 && motion.y < lower.y+1;
      if (onEntity) motion.y = lower.y+1;
      e.y = motion.y; e.vy *= .98;
      if (!onEntity && motion.blocked.y) { this.settle(e); continue; }
      if (e.age >= 600) { this.drop(e); continue; }
      if (onEntity) e.vy = Math.max(e.vy, lower.vy);
      alive.push(e); columns.set(column,e);
    }
    this.entities = alive;
  }
  drop(e) { this.world.emitDrop({ id: e.id, count: 1 }, { x: e.x, y: e.y, z: e.z }); }
  settle(e) {
    const x = Math.floor(e.x), y = Math.floor(e.y+1e-7), z = Math.floor(e.z);
    const min = { x,y,z }, max = { x: x+1,y: y+1,z: z+1 };
    const players = this.world.getPlayers?.() ?? [];
    if (!this.world.canPlaceBlock(x,y,z,players,e.id,e.state) || this.world.hasSolidInBox(min,max)) { this.drop(e); return; }
    if (!this.world.setBlock(x,y,z,e.id,e.state)) this.drop(e);
  }
  save() { return { time: this.time, serial: this.serial, pending: [...this.pending.values()].map(p=>({...p})),
    entities: this.entities.map(e=>({...e,state:{...e.state},previous:{...e.previous}})) }; }
  load(data) {
    this.time = data.time; this.serial = data.serial;
    this.pending = new Map(data.pending.map(p=>[`${p.x},${p.y},${p.z}`,{...p}]));
    this.entities = data.entities.map(e=>({...e,state:{...e.state},previous:{...e.previous}}));
  }
}
