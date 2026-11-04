import * as THREE from 'three';
import { M } from '../core/materials.js';
import { Feature } from './feature.js';

const ROCK_PROBES = [[0, 0], [0.4, 0], [-0.4, 0], [0, 0.4], [0, -0.4]]; // fractions of the rock's size

// ---- Rock clusters ----
// Randomly placed boulders. A random rotation on all three axes makes the same
// 12-faced shape look like a different rock each time.
export class Rocks extends Feature {
  constructor(ctx) {
    super(ctx);
    const { rand, placement } = ctx;
    this.list = []; // { mesh, size }, for butterflies to land on
    for (let i = 0; i < 6; i++) {
      const size = 1 + rand() * 1.5;
      const spot = placement.randomFreeSpot(15, 45, size);
      if (!spot) continue;
      const rock = this.mesh(new THREE.DodecahedronGeometry(size, 0), i % 2 ? M.stone : M.stoneD,
        spot.x, 0.6, spot.z, { cast: true, receive: true });
      rock.rotation.set(rand(), rand(), rand());
      this.list.push({ mesh: rock, size });
      this.solidCircle(spot.x, spot.z, size * 0.85, 0.6 + size);
    }
  }

  // A tumbled boulder's top may be a sharp ridge, so probe a few points across it and
  // keep the ones on a facet flat enough to sit on.
  landings() {
    return this.list.flatMap(({ mesh, size }) => ROCK_PROBES
      .map(([dx, dz]) => this.landingOn(mesh, dx * size, dz * size, 'rock'))).filter(Boolean);
  }
}
