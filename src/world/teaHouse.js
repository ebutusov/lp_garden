import * as THREE from 'three';
import { M } from '../core/materials.js';
import { Feature } from './feature.js';

// ---- Tea house (chashitsu) ----
// Raised wooden floor with tatami, paper screens on three sides, an open doorway
// facing the pond and a hipped roof. The screens glow from a lamp inside at night.
// Built entirely from boxes; all positions are local to the house's group.
const FLOOR = 0.55, WALL = 2.8, BAND = 0.8, TOP = FLOOR + WALL + BAND;

export class TeaHouse extends Feature {
  constructor(ctx, { x, z }) {
    super(ctx, { x, z });
    this.floorY = FLOOR;
    // Where a visitor kneels at the table (local; facing +X, out of the doorway), and the
    // way there from outside: up the step, through the door and round the table's end.
    this.seat = { x: -1.7, z: 0, heading: Math.PI / 2 };
    this.visitPath = [[6.6, 0], [4.4, 0], [2.6, 0], [0.9, 1.05], [-1.7, 1.05], [-1.7, 0]];
    this.box(8, 0.5, 7, M.darkWood, 0, 0.25, 0);                // raised floor
    this.box(7.4, 0.05, 6.4, M.tatami, 0, 0.525, 0);            // tatami
    this.box(0.8, 0.27, 3, M.stone, 4.4, 0.135, 0);             // step up to the doorway
    this.box(1.4, 0.3, 0.9, M.darkWood, -0.5, FLOOR + 0.15, 0); // low tea table
    for (const [x, z] of [[-3.8, -3.3], [-3.8, 3.3], [3.8, -3.3], [3.8, 3.3], [3.8, -1.3], [3.8, 1.3]]) {
      this.box(0.25, WALL + BAND, 0.25, M.darkWood, x, FLOOR + (WALL + BAND) / 2, z);
    }
    this.box(0.15, WALL + BAND, 6.6, M.plaster, -3.8, FLOOR + (WALL + BAND) / 2, 0); // back wall
    for (const z of [-3.3, 3.3]) {
      this.box(7.6, WALL, 0.08, M.shoji, 0, FLOOR + WALL / 2, z);                   // side screens
      this.box(7.6, BAND, 0.12, M.plaster, 0, FLOOR + WALL + BAND / 2, z);
    }
    for (const z of [-2.35, 2.35]) this.box(0.08, WALL, 1.9, M.shoji, 3.8, FLOOR + WALL / 2, z);
    this.box(0.12, BAND, 6.6, M.plaster, 3.8, FLOOR + WALL + BAND / 2, 0);         // lintel over the doorway

    // Hipped roof: a square pyramid stretched to overhang the walls by about a unit.
    const half = Math.SQRT1_2; // half-width of a 4-sided unit cone after the 45° turn
    this.mesh(new THREE.ConeGeometry(1, 1, 4).rotateY(Math.PI / 4), M.roof, 0, TOP + 1.3, 0, { cast: true })
      .scale.set(5 / half, 2.6, 4.5 / half);

    // Off by day; dayNight.js raises its intensity at night.
    this.light = new THREE.PointLight(0xffc27a, 0, 12, 2);
    this.light.position.set(0.5, FLOOR + 2.2, 0);
    this.group.add(this.light);

    // Colliders: thin boxes for the walls (leaving the doorway open) and the table,
    // and walkable platforms for the floor and the doorstep.
    this.solidBox(-3.95, -3.65, -3.45, 3.45, 5);   // back
    this.solidBox(-3.95, 3.95, 3.2, 3.45, 5);      // sides
    this.solidBox(-3.95, 3.95, -3.45, -3.2, 5);
    this.solidBox(3.65, 3.95, 1.3, 3.45, 5);       // front screens either side of the door
    this.solidBox(3.65, 3.95, -3.45, -1.3, 5);
    this.solidBox(-1.2, 0.2, -0.45, 0.45, FLOOR + 0.3); // table
    this.platform(-4, 4, -3.5, 3.5, FLOOR);
    this.platform(4, 4.8, -1.5, 1.5, 0.27);
  }

  box(w, h, d, m, x, y, z) {
    return this.mesh(new THREE.BoxGeometry(w, h, d), m, x, y, z, { cast: true, receive: true });
  }

  // A bird perch on the roof peak.
  perches() {
    return [{ parent: this.group, local: new THREE.Vector3(0, TOP + 2.6, 0), kind: 'tea house' }];
  }

  // Is the point (x, z) inside the house? (For footstep sounds.)
  contains(x, z) {
    const p = this.group.position;
    return Math.abs(x - p.x) <= 4 && Math.abs(z - p.z) <= 3.5;
  }
}
