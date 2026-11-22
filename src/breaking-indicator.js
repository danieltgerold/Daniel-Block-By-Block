import * as THREE from 'three';
import { sameBreakingTarget } from './breaking-properties.js';
import { shapeQuads } from './shape-mesh.js';
export class BreakingIndicator extends THREE.Group {
  constructor() {
    super(); this.geometry = new THREE.PlaneGeometry(1, 1);
    this.background = new THREE.Mesh(this.geometry, new THREE.MeshBasicMaterial({ color: '#16251f', depthTest: true, depthWrite: false, side: THREE.DoubleSide }));
    this.fill = new THREE.Mesh(this.geometry, new THREE.MeshBasicMaterial({ color: '#f0efb0', depthTest: true, depthWrite: false, side: THREE.DoubleSide }));
    this.fill.position.z = .001; this.add(this.background, this.fill); this.visible = false;
    // Opaque meshes are sorted by material before distance. Materials allocated
    // after this indicator must not paint over its non-depth-writing planes.
    this.background.renderOrder = 100; this.fill.renderOrder = 101;
    this.normal = new THREE.Vector3(); this.right = new THREE.Vector3(); this.up = new THREE.Vector3(); this.basis = new THREE.Matrix4();
    this.worldUp = new THREE.Vector3(0, 1, 0); this.size = new THREE.Vector3();
  }
  update(breaking, hit, world, camera) {
    const target = breaking.target;
    this.visible = Boolean(target && hit && breaking.progress > 0 && target.x === hit.x && target.y === hit.y && target.z === hit.z
      && sameBreakingTarget(world.blockAt(hit.x, hit.y, hit.z), target));
    if (!this.visible) return;
    this.normal.set(hit.normal.x, hit.normal.y, hit.normal.z);
    if (!this.normal.lengthSq()) { this.visible = false; return; }
    const axis = hit.normal.x ? 'x' : hit.normal.y ? 'y' : 'z';
    const boxes = world.boxesFor(target, 'selection');
    // Use exposed faces of the UNION, rather than an individual selection box:
    // the center of a stair box's top can be inside its next step.
    if (this.target !== target || this.boxes !== boxes) {
      this.target = target; this.boxes = boxes;
      this.faces = shapeQuads(target, ['fence','wall'].includes(target.definition.collisionShape) ? world : null).map(q => ({ axis: 'xyz'[q.axis], sign: q.sign,
        min: Object.fromEntries(['x','y','z'].map((a,i)=>[a,target[a]+Math.min(...q.corners.map(p=>p[i]))])),
        max: Object.fromEntries(['x','y','z'].map((a,i)=>[a,target[a]+Math.max(...q.corners.map(p=>p[i]))])) }));
    }
    const box = this.faces.find(b => b.axis === axis && b.sign === hit.normal[axis]
      && Math.abs(hit.point[axis] - b.min[axis]) < 1e-6
      && ['x','y','z'].every(a => a === axis || hit.point[a] >= b.min[a] - 1e-6 && hit.point[a] <= b.max[a] + 1e-6));
    if (!box) { this.visible = false; return; }
    this.position.set((box.min.x + box.max.x) / 2, (box.min.y + box.max.y) / 2, (box.min.z + box.max.z) / 2);
    this.position[axis] = hit.normal[axis] > 0 ? box.max[axis] : box.min[axis]; this.position.addScaledVector(this.normal, .002);
    if (axis === 'y') { this.right.setFromMatrixColumn(camera.matrixWorld, 0).projectOnPlane(this.normal).normalize(); }
    else this.right.crossVectors(this.worldUp, this.normal).normalize();
    this.up.crossVectors(this.normal, this.right).normalize(); this.basis.makeBasis(this.right, this.up, this.normal); this.quaternion.setFromRotationMatrix(this.basis);
    const size = this.size.set(box.max.x - box.min.x, box.max.y - box.min.y, box.max.z - box.min.z);
    let width = Math.min(.48, Math.abs(this.right.x)*size.x + Math.abs(this.right.y)*size.y + Math.abs(this.right.z)*size.z) * .8;
    let height = Math.min(.065, (Math.abs(this.up.x)*size.x + Math.abs(this.up.y)*size.y + Math.abs(this.up.z)*size.z) * .18);
    let fit = 1;
    for (const a of ['x','y','z']) if (a !== axis) {
      const span = Math.abs(this.right[a])*width + Math.abs(this.up[a])*height;
      if (span) fit = Math.min(fit, size[a]*.9/span);
    }
    width *= fit; height *= fit;
    const innerWidth = width*.96, innerHeight = height*.72;
    this.background.scale.set(width, height, 1); this.fill.scale.set(innerWidth * breaking.progress, innerHeight, 1);
    this.fill.position.x = -innerWidth * (1 - breaking.progress) / 2;
  }
  dispose() { this.geometry.dispose(); this.background.material.dispose(); this.fill.material.dispose(); }
}
