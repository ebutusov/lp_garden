import * as THREE from 'three';
import { scene } from '../core/scene.js';
import { M } from '../core/materials.js';
import { TEA } from '../core/layout.js';
import { addBoxSolid, platforms } from '../core/physics.js';

// ---- Tea house (chashitsu) ----
// Raised wooden floor with tatami, paper screens on three sides, an open doorway
// facing the pond and a hipped roof. The screens glow from a lamp inside at night.
// Built entirely from boxes; all positions are local to the house's group.
function buildTeaHouse() {
  const g = new THREE.Group();
  g.position.set(TEA.x, 0, TEA.z);
  const box = (w, h, d, m, x, y, z) => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
    mesh.position.set(x, y, z);
    mesh.castShadow = mesh.receiveShadow = true;
    g.add(mesh);
    return mesh;
  };
  const FLOOR = 0.55, WALL = 2.8, BAND = 0.8, TOP = FLOOR + WALL + BAND;
  box(8, 0.5, 7, M.darkWood, 0, 0.25, 0);                // raised floor
  box(7.4, 0.05, 6.4, M.tatami, 0, 0.525, 0);            // tatami
  box(0.8, 0.27, 3, M.stone, 4.4, 0.135, 0);             // step up to the doorway
  box(1.4, 0.3, 0.9, M.darkWood, -0.5, FLOOR + 0.15, 0); // low tea table
  for (const [x, z] of [[-3.8, -3.3], [-3.8, 3.3], [3.8, -3.3], [3.8, 3.3], [3.8, -1.3], [3.8, 1.3]]) {
    box(0.25, WALL + BAND, 0.25, M.darkWood, x, FLOOR + (WALL + BAND) / 2, z);
  }
  box(0.15, WALL + BAND, 6.6, M.plaster, -3.8, FLOOR + (WALL + BAND) / 2, 0); // back wall
  for (const z of [-3.3, 3.3]) {
    box(7.6, WALL, 0.08, M.shoji, 0, FLOOR + WALL / 2, z);                   // side screens
    box(7.6, BAND, 0.12, M.plaster, 0, FLOOR + WALL + BAND / 2, z);
  }
  for (const z of [-2.35, 2.35]) box(0.08, WALL, 1.9, M.shoji, 3.8, FLOOR + WALL / 2, z);
  box(0.12, BAND, 6.6, M.plaster, 3.8, FLOOR + WALL + BAND / 2, 0);         // lintel over the doorway

  // Hipped roof: a square pyramid stretched to overhang the walls by about a unit.
  const half = Math.SQRT1_2; // half-width of a 4-sided unit cone after the 45° turn
  const roof = new THREE.Mesh(new THREE.ConeGeometry(1, 1, 4).rotateY(Math.PI / 4), M.roof);
  roof.scale.set(5 / half, 2.6, 4.5 / half);
  roof.position.y = TOP + 1.3;
  roof.castShadow = true;
  g.add(roof);

  // Off by day; dayNight.js raises its intensity at night.
  const light = new THREE.PointLight(0xffc27a, 0, 12, 2);
  light.position.set(0.5, FLOOR + 2.2, 0);
  g.add(light);
  scene.add(g);

  // Colliders: thin boxes for the walls (leaving the doorway open) and the table,
  // and walkable platforms for the floor and the doorstep.
  const X = TEA.x, Z = TEA.z;
  addBoxSolid(X - 3.95, X - 3.65, Z - 3.45, Z + 3.45, 5);   // back
  addBoxSolid(X - 3.95, X + 3.95, Z + 3.2, Z + 3.45, 5);    // sides
  addBoxSolid(X - 3.95, X + 3.95, Z - 3.45, Z - 3.2, 5);
  addBoxSolid(X + 3.65, X + 3.95, Z + 1.3, Z + 3.45, 5);    // front screens either side of the door
  addBoxSolid(X + 3.65, X + 3.95, Z - 3.45, Z - 1.3, 5);
  addBoxSolid(X - 1.2, X + 0.2, Z - 0.45, Z + 0.45, FLOOR + 0.3); // table
  platforms.push(
    { minX: X - 4, maxX: X + 4, minZ: Z - 3.5, maxZ: Z + 3.5, y: FLOOR },
    { minX: X + 4, maxX: X + 4.8, minZ: Z - 1.5, maxZ: Z + 1.5, y: 0.27 },
  );
  return { light, group: g, floorY: FLOOR };
}
export const teaHouse = buildTeaHouse();
export const inTeaHouse = (x, z) => Math.abs(x - TEA.x) <= 4 && Math.abs(z - TEA.z) <= 3.5;
