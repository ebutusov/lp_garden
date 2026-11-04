import {
  FENCE_R, POND_Z, POND_R, LANTERN_SPOTS, PATH_LANTERN_SPOTS, TORII_Z, TEA, TEA_PATH, BOWLS, ZEN, SHISHI,
  FALLS, STREAM_BANK, streamCourse,
} from './layout.js';

// ---- Placement: keep randomly placed props from overlapping each other ----
// Every footprint is a circle on the ground plane: circle-vs-circle overlap is just
// "is the distance between centres less than the sum of the radii?".
// This is only for laying the garden out; what the player bumps into is physics.js.
//
// A Placement draws its random spots from the `rand` it's given: the garden's one
// seeded generator (see random.js), so placing a prop advances the same sequence
// every other placement uses.
export class Placement {
  constructor(rand) {
    this.rand = rand;
    this.occupied = [];
    this.reserveFixedFeatures();
  }

  isClear(x, z, r) {
    if (Math.abs(Math.hypot(x, z) - FENCE_R) < r + 1) return false; // keep the fence line clear
    return this.occupied.every((o) => Math.hypot(o.x - x, o.z - z) >= o.r + r);
  }

  reserve(x, z, r) {
    this.occupied.push({ x, z, r });
  }

  // Random free spot in a ring around the origin; null if none found.
  // With keep = true the spot is reserved so later props avoid it.
  // Picking an angle and a distance (polar coordinates) keeps spots within the ring.
  randomFreeSpot(minD, maxD, r, keep = true, tries = 40) {
    for (let i = 0; i < tries; i++) {
      const a = this.rand() * Math.PI * 2;
      const d = minD + this.rand() * (maxD - minD);
      const x = Math.cos(a) * d, z = Math.sin(a) * d;
      if (this.isClear(x, z, r)) {
        if (keep) this.reserve(x, z, r);
        return { x, z };
      }
    }
    return null;
  }

  // Fixed features, reserved here, before anything random is placed. They're listed
  // centrally rather than in each feature's class, because the reservations must all
  // exist before the first random prop (the grass mounds) looks for room, and some
  // fixed features are built after that.
  // A new fixed feature must reserve its footprint here too.
  reserveFixedFeatures() {
    this.reserve(0, POND_Z, POND_R + 1.5);                                  // pond + rim + bridge
    for (const [x, z] of LANTERN_SPOTS) this.reserve(x, z, 1.5);
    for (const [x, z] of PATH_LANTERN_SPOTS) this.reserve(x, z, 1.2);
    this.reserve(-5, TORII_Z, 1.2); this.reserve(5, TORII_Z, 1.2);         // torii posts
    for (let z = POND_Z + POND_R; z <= 46; z += 2) this.reserve(0, z, 2);  // stepping-stone path + spawn
    this.reserve(TEA.x, TEA.z, 6.5);
    for (const [x, z] of TEA_PATH) this.reserve(x, z, 1.2);
    for (let dx = -4.2; dx <= 3.7; dx += 1.3) this.reserve(BOWLS.x + dx, BOWLS.z, 0.9); // bowls, bin and bucket
    this.reserve(ZEN.x, ZEN.z, 10.5);
    this.reserve(SHISHI.x, SHISHI.z, 2.5);
    this.reserve(FALLS.x, FALLS.z, FALLS.r);                               // rockery and waterfall
    for (const s of streamCourse(0.8)) this.reserve(s.x, s.z, s.w / 2 + STREAM_BANK); // the stream and its banks
  }
}
