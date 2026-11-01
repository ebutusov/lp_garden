import * as THREE from 'three';
import { M } from '../core/materials.js';
import { rand } from '../core/random.js';
import { randomFreeSpot } from '../core/placement.js';
import { Feature } from './feature.js';

// ---- Rock clusters ----
// Randomly placed boulders. A random rotation on all three axes makes the same
// 12-faced shape look like a different rock each time.
class Rocks extends Feature {
  constructor() {
    super();
    for (let i = 0; i < 6; i++) {
      const size = 1 + rand() * 1.5;
      const spot = randomFreeSpot(15, 45, size);
      if (!spot) continue;
      const rock = this.mesh(new THREE.DodecahedronGeometry(size, 0), i % 2 ? M.stone : M.stoneD,
        spot.x, 0.6, spot.z, { cast: true, receive: true });
      rock.rotation.set(rand(), rand(), rand());
      this.solidCircle(spot.x, spot.z, size * 0.85, 0.6 + size);
    }
  }
}
export const rocks = new Rocks();
