import * as THREE from 'three';
import { M } from '../core/materials.js';
import { Feature } from './feature.js';

// ---- Flowerbeds (iris) ----
// A 6×6-segment sphere on a 4-sided stem: about as few triangles as still reads as a flower.
export class Flowers extends Feature {
  constructor(ctx) {
    super(ctx);
    this.spots = []; // where each flower stands (the Gardener comes to look at them)
    this.heads = []; // the blooms, for butterflies to land on
    for (let i = 0; i < 30; i++) {
      const spot = ctx.placement.randomFreeSpot(14, 39, 0.4);
      if (!spot) continue;
      this.spots.push({ x: spot.x, z: spot.z });
      this.heads.push(this.mesh(new THREE.SphereGeometry(0.28, 6, 6), M.flower, spot.x, 0.4, spot.z, { cast: true }));
      this.mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.6, 4), M.pine, spot.x, 0.2, spot.z);
    }
  }

  // Butterflies land on top of each bloom (see Feature.landingOn).
  landings() {
    return this.heads.map((head) => this.landingOn(head, 0, 0, 'flower', 0.5)).filter(Boolean);
  }
}
