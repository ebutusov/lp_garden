import * as THREE from 'three';
import { scene } from '../core/scene.js';
import { M, mat } from '../core/materials.js';
import { rand } from '../core/random.js';
import { POND_Z, POND_R, WATER_LEVEL, waterSurface } from '../core/layout.js';

// ---- Pond with water ----
// Everything in the pond lives in one group centred on the pond, so its parts (and
// the koi, ripples and food pellets) use simple pond-local coordinates: (0, 0) is the
// middle of the pond. World z = local z + POND_Z.
export const pondGroup = new THREE.Group();
pondGroup.position.set(0, 0, POND_Z);
scene.add(pondGroup);

// stone rim around the hole in the ground. A torus is a ring (doughnut); lying it flat
// hides the seam between the ground's hole and the water.
const pondEdge = new THREE.Mesh(
  new THREE.TorusGeometry(POND_R + 0.2, 0.6, 6, 28),
  M.stoneD
);
pondEdge.rotation.x = -Math.PI / 2;
pondEdge.position.y = -0.05;
pondEdge.receiveShadow = true;
pondGroup.add(pondEdge);

// inner wall of the pond, so the hole doesn't look into the void. An open-ended
// cylinder (no caps) drawn BackSide: from inside the pond you see its inner face.
const pondWall = new THREE.Mesh(
  new THREE.CylinderGeometry(POND_R, POND_R, 0.9, 28, 1, true),
  mat(0x55605a, { side: THREE.BackSide, roughness: 0.9 })
);
pondWall.position.y = -0.45;
pondGroup.add(pondWall);

// inner ground of the pond (darker)
const pondFloor = new THREE.Mesh(
  new THREE.CircleGeometry(POND_R, 28),
  mat(0x3b5a52, { roughness: 0.9 })
);
pondFloor.rotation.x = -Math.PI / 2;
pondFloor.position.y = -0.9;
pondGroup.add(pondFloor);

// The water is just a translucent disc; the floor and fish show through it.
export const water = new THREE.Mesh(
  new THREE.CircleGeometry(POND_R, 28),
  M.water
);
water.rotation.x = -Math.PI / 2;
water.position.y = WATER_LEVEL;
pondGroup.add(water);

// Lily pads. DoubleSide: visible from above and below (from under the water).
for (let i = 0; i < 7; i++) {
  const a = rand() * Math.PI * 2;
  const d = rand() * 7;
  const pad = new THREE.Mesh(
    new THREE.CircleGeometry(0.6 + rand() * 0.5, 8),
    mat(0x5a8a4a, { side: THREE.DoubleSide, roughness: 0.8 })
  );
  pad.rotation.x = -Math.PI / 2;
  pad.rotation.z = rand() * Math.PI;
  pad.position.set(Math.cos(a) * d, -0.05, Math.sin(a) * d);
  pondGroup.add(pad);
}

// gentle water bob
export function updatePond(t) {
  water.position.y = waterSurface(t);
}
