import * as THREE from 'three';
import { scene } from '../core/scene.js';
import { M } from '../core/materials.js';
import { randomFreeSpot } from '../core/placement.js';

// ---- Flowerbeds (iris) ----
// A 6×6-segment sphere on a 4-sided stem: about as few triangles as still reads as a flower.
for (let i = 0; i < 30; i++) {
  const spot = randomFreeSpot(14, 39, 0.4);
  if (!spot) continue;
  const flower = new THREE.Mesh(
    new THREE.SphereGeometry(0.28, 6, 6),
    M.flower
  );
  flower.position.set(spot.x, 0.4, spot.z);
  flower.castShadow = true;
  scene.add(flower);
  const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.6, 4), M.pine);
  stem.position.copy(flower.position);
  stem.position.y -= 0.2;
  scene.add(stem);
}
