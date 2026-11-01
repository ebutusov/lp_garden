import * as THREE from 'three';
import { M } from '../core/materials.js';
import { TORII_Z } from '../core/layout.js';
import { Feature } from './feature.js';

// ---- Torii gate (entrance) ----
class Torii extends Feature {
  constructor() {
    super(0, TORII_Z);
    // One geometry, two meshes: geometry data is uploaded to the GPU once and drawn twice.
    const postGeo = new THREE.CylinderGeometry(0.5, 0.6, 7, 10);
    for (const x of [-5, 5]) {
      this.mesh(postGeo, M.maple, x, 3.5, 0, { cast: true });
      this.solidCircle(x, 0, 0.65, 8);
    }
    // top beam (shi)
    this.mesh(new THREE.BoxGeometry(13, 0.9, 1.2), M.maple, 0, 7.2, 0, { cast: true });
    this.mesh(new THREE.BoxGeometry(12.2, 0.6, 0.9), M.maple, 0, 6.1, 0);
  }

  // Birds line up along the top beam.
  perches() {
    return [-5.5, -2.75, 0, 2.75, 5.5].map((x) => ({ parent: this.group, local: new THREE.Vector3(x, 7.65, 0), kind: 'torii' }));
  }
}
export const torii = new Torii();
