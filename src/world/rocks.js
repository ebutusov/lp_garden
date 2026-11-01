import * as THREE from 'three';
import { scene } from '../core/scene.js';
import { M } from '../core/materials.js';
import { rand } from '../core/random.js';
import { randomFreeSpot } from '../core/placement.js';
import { addCircleSolid } from '../core/physics.js';

// ---- Rock clusters ----
// Randomly placed boulders. A random rotation on all three axes makes the same
// 12-faced shape look like a different rock each time.
for (let i = 0; i < 6; i++) {
  const size = 1 + rand() * 1.5;
  const spot = randomFreeSpot(15, 45, size);
  if (!spot) continue;
  const rock = new THREE.Mesh(
    new THREE.DodecahedronGeometry(size, 0),
    i % 2 ? M.stone : M.stoneD
  );
  rock.position.set(spot.x, 0.6, spot.z);
  rock.rotation.set(rand(), rand(), rand());
  rock.castShadow = true; rock.receiveShadow = true;
  scene.add(rock);
  addCircleSolid(spot.x, spot.z, size * 0.85, 0.6 + size);
}
