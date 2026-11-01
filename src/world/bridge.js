import * as THREE from 'three';
import { M } from '../core/materials.js';
import { POND_Z, BRIDGE_SPAN, BRIDGE_RISE, BRIDGE_WIDTH, BRIDGE_DECK, BRIDGE_RAIL } from '../core/layout.js';
import { Feature } from './feature.js';

// ---- Bridge over the pond ----
// Built along local X, then turned to run north-south across the pond at x = 0.
// Its walkable surface is computed separately (bridgeDeckTop in physics.js) from the
// same arc formula, rather than from the meshes.
class Bridge extends Feature {
  constructor() {
    super(0, POND_Z);
    this.group.rotation.y = Math.PI / 2;
    // arced deck using a series of boxes
    const SPAN = BRIDGE_SPAN;
    const RISE = BRIDGE_RISE;
    const segs = 20;
    for (let i = 0; i <= segs; i++) {
      const t = i / segs;
      const x = (t - 0.5) * SPAN;
      const y = Math.sin(t * Math.PI) * RISE;
      // Slightly longer than the spacing, so neighbouring planks overlap with no gaps.
      const seg = this.mesh(new THREE.BoxGeometry(SPAN / segs + 0.2, BRIDGE_DECK, BRIDGE_WIDTH), M.wood,
        x, y, 0, { cast: true, receive: true });
      // Tilt each plank to the arc's slope there. The slope of a curve is the ratio of
      // its derivatives: dy/dt = RISE·π·cos(tπ), dx/dt = SPAN, so the angle is atan2 of them.
      seg.rotation.z = Math.atan2(RISE * Math.PI * Math.cos(t * Math.PI), SPAN);
    }
    // rail posts
    for (let i = 0; i <= segs; i += 2) {
      const t = i / segs;
      const x = (t - 0.5) * SPAN;
      const y = Math.sin(t * Math.PI) * RISE + 0.6;
      for (const side of [BRIDGE_RAIL, -BRIDGE_RAIL]) {
        this.mesh(new THREE.BoxGeometry(0.25, 0.8, 0.25), M.stoneD, x, y, side);
      }
    }
  }
}
export const bridge = new Bridge();
