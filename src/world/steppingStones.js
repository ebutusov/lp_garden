import * as THREE from 'three';
import { M } from '../core/materials.js';
import { Feature } from './feature.js';

// ---- Stepping stones (tobi-ishi): torii → bridge, and tea house → pond ----
// The main path zigzags along x = 0 from z = `from` to z = `to`; `teaPath` lists the
// stones in front of the tea house.
export class SteppingStones extends Feature {
  constructor(ctx, { from, to, teaPath }) {
    super(ctx);
    const { rand } = ctx;
    const stoneCount = 9;
    for (let i = 0; i < stoneCount; i++) {
      const z = from + (to - from) * (i / (stoneCount - 1));
      this.addStone((i % 2 ? 0.6 : -0.6) + (rand() - 0.5) * 0.4, z);
    }
    for (const [x, z] of teaPath) this.addStone(x, z);
  }

  addStone(x, z) {
    const { rand } = this.ctx;
    // A mesh can both cast shadows onto others and receive them from others.
    const stone = this.mesh(new THREE.CylinderGeometry(0.7 + rand() * 0.4, 0.9, 0.25, 7), M.stone,
      x, 0.12, z, { cast: true, receive: true });
    stone.rotation.y = rand() * Math.PI;
  }
}
