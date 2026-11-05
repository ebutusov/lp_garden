import * as THREE from 'three';
import { M } from '../core/materials.js';
import { POND_Z, BRIDGE_WIDTH, BRIDGE_SPAN } from '../core/layout.js';
import { Feature } from './feature.js';

// ---- Tea house (chashitsu) ----
// Raised wooden floor with tatami, paper screens on three sides, an open doorway
// facing the pond and a hipped roof. The screens glow from a lamp inside at night.
// Built entirely from boxes; all positions are local to the house's group.
// When it rains the dog and the cats shelter inside, each at a spot of its own.
const FLOOR = 0.55, WALL = 2.8, BAND = 0.8, TOP = FLOOR + WALL + BAND;

export class TeaHouse extends Feature {
  constructor(ctx, { x, z }) {
    super(ctx, { x, z });
    this.floorY = FLOOR;
    // Where a visitor kneels at the table (local; facing +X, out of the doorway), and the
    // way there from outside: up the step, through the door and round the table's end.
    this.seat = { x: -1.7, z: 0, heading: Math.PI / 2 };
    this.visitPath = [[6.6, 0], [4.4, 0], [2.6, 0], [0.9, 1.05], [-1.7, 1.05], [-1.7, 0]];
    // Where the animals wait out the rain (local; `heading` is the way each faces,
    // out toward the door), with whoever has claimed it in `by`. All in the north
    // half (-Z), away from the table, his seat and the path he walks in on (it runs
    // along +Z, and he follows it blindly), and from the doorway itself. The dog takes
    // the spot just inside the door, in view through it, where it can watch the rain;
    // the cats are further in.
    this.shelterSpots = [
      { kind: 'dog', x: 2.0, z: -1.6, heading: 1.6 },
      { kind: 'cat', x: -0.3, z: -2.6, heading: 1.2 },
      { kind: 'cat', x: -2.7, z: -2.6, heading: 0.9 },
      { kind: 'cat', x: -2.9, z: -1.5, heading: 1.6 },
    ].map((s) => ({ ...s, by: null }));
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

  // ---- Shelter from the rain ----
  // A free spot for `animal` (by its `bowlKind`: 'dog' or 'cat'), in world
  // coordinates, or null if they're all taken. Released with releaseShelter().
  claimShelter(animal) {
    const spot = this.shelterSpots.find((s) => s.kind === animal.bowlKind && !s.by);
    if (!spot) return null;
    spot.by = animal;
    const w = this.toWorld(spot.x, spot.z);
    return { spot, x: w.x, z: w.z, heading: spot.heading };
  }
  releaseShelter(claim, by) {
    if (claim.spot.by === by) claim.spot.by = null; // unless someone else has it by now
  }

  // The way in from (x, z) to a claimed spot, as world waypoints: round the pond's
  // south end if the pond and bridge are in the way (as Bowls.route does), round the
  // house if it's coming from behind or beside it, then in through the door.
  shelterRoute(x, z, claim) {
    const h = this.group.position, pts = [];
    const door = this.toWorld(6.6, 0).clone(); // toWorld reuses one vector: keep a copy
    if (x > 0) {
      // The pond and the bridge make one long barrier across the middle (x = 0).
      const southEnd = { x: BRIDGE_WIDTH / 2 + 1.5, z: POND_Z + BRIDGE_SPAN / 2 + 2 };
      const zc = z + (door.z - z) * (x / (x - door.x)); // where the straight line crosses x = 0
      if (zc > -22 && zc < southEnd.z) { pts.push({ x: southEnd.x, z: southEnd.z }, { x: -southEnd.x, z: southEnd.z }); x = -southEnd.x; z = southEnd.z; }
    }
    if (x < h.x + 5.8) {
      // Behind or beside the house: round its corner, on the near side. South of it
      // the bowls stand along the wall, so that way goes wider.
      // First straight out to that side's line (from behind, out past the corner),
      // unless it's already beyond it, then along the line to the front.
      const south = z >= h.z, sideZ = south ? h.z + 7.8 : h.z - 5.6;
      if (south ? z < sideZ : z > sideZ) pts.push({ x: x < h.x - 4.8 ? h.x - 6.2 : x, z: sideZ });
      pts.push({ x: h.x + 6.6, z: sideZ });
    }
    pts.push(door);
    for (const [lx, lz] of [[4.4, 0], [2.6, 0]]) pts.push(this.toWorld(lx, lz).clone());
    pts.push({ x: claim.x, z: claim.z });
    return pts.map(({ x, z }) => ({ x, z }));
  }

  // The way out from (x, z): back to the doorway and out onto the grass. Empty if it
  // isn't in the box round the house that animals otherwise keep out of.
  exitRoute(x, z) {
    if (!this.ctx.physics.nearTeaHouse(x, z)) return [];
    return [[2.6, 0], [4.4, 0], [6.6, 0], [8, (Math.random() - 0.5) * 4]].map(([lx, lz]) => {
      const w = this.toWorld(lx, lz);
      return { x: w.x, z: w.z };
    });
  }

  // Is the point (x, z) inside the house? (For footstep sounds.)
  contains(x, z) {
    const p = this.group.position;
    return Math.abs(x - p.x) <= 4 && Math.abs(z - p.z) <= 3.5;
  }
}
