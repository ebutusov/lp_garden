import * as THREE from 'three';
import { scene } from '../core/scene.js';
import { M } from '../core/materials.js';
import { rand } from '../core/random.js';
import { GROUND_R, POND_Z, POND_R } from '../core/layout.js';
import { randomFreeSpot } from '../core/placement.js';
import { mounds } from '../core/physics.js';

// ---- Ground (with a hole cut out for the pond) ----
// A Shape is a 2D outline; ShapeGeometry triangulates it into a flat mesh. Holes are
// paths wound the opposite way. The shape is drawn in the XY plane, so it's rotated
// -90° about X to lie flat.
const groundShape = new THREE.Shape();
groundShape.absarc(0, 0, GROUND_R, 0, Math.PI * 2, false);
const pondHole = new THREE.Path();
// Shape space (x, y) maps to world (x, -z) after the rotateX below.
pondHole.absarc(0, -POND_Z, POND_R, 0, Math.PI * 2, true);
groundShape.holes.push(pondHole);
// Rotating the *geometry* (rather than the mesh) bakes the rotation into the vertices
// once, so the mesh itself keeps a plain transform.
const ground = new THREE.Mesh(
  new THREE.ShapeGeometry(groundShape, 64).rotateX(-Math.PI / 2),
  M.grass
);
ground.receiveShadow = true;
scene.add(ground);

// Gentle grass mounds for texture. They only avoid the fixed features; trees and rocks may
// sit on them. Each is a 6-sided cone whose centre sits at ground level, so only its top
// half shows: radius r/2, peak 0.3·r. physics.js uses the same numbers to let you walk on it.
for (let i = 0; i < 40; i++) {
  const r = 1.5 + rand() * 3;
  const spot = randomFreeSpot(20, 90, r, false);
  if (!spot) continue;
  const bump = new THREE.Mesh(new THREE.ConeGeometry(r, r * 0.6, 6), M.grass);
  bump.position.set(spot.x, 0, spot.z);
  bump.castShadow = true; bump.receiveShadow = true;
  scene.add(bump);
  mounds.push({ x: spot.x, z: spot.z, r });
}
