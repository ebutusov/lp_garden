import * as THREE from 'three';
import { M } from '../core/materials.js';
import { rand } from '../core/random.js';
import { POND_Z, POND_R, TEA_PATH } from '../core/layout.js';
import { Feature } from './feature.js';

// ---- Stepping stones (tobi-ishi): torii → bridge, and tea house → pond ----
class SteppingStones extends Feature {
  constructor() {
    super();
    const stoneCount = 9;
    const stoneStartZ = 31, stoneEndZ = POND_Z + POND_R + 3;
    for (let i = 0; i < stoneCount; i++) {
      const z = stoneStartZ + (stoneEndZ - stoneStartZ) * (i / (stoneCount - 1));
      this.addStone((i % 2 ? 0.6 : -0.6) + (rand() - 0.5) * 0.4, z);
    }
    for (const [x, z] of TEA_PATH) this.addStone(x, z);
  }

  addStone(x, z) {
    // A mesh can both cast shadows onto others and receive them from others.
    const stone = this.mesh(new THREE.CylinderGeometry(0.7 + rand() * 0.4, 0.9, 0.25, 7), M.stone,
      x, 0.12, z, { cast: true, receive: true });
    stone.rotation.y = rand() * Math.PI;
  }
}
export const steppingStones = new SteppingStones();
