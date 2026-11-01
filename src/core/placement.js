import { rand } from './random.js';
import {
  FENCE_R, POND_Z, POND_R, LANTERN_SPOTS, PATH_LANTERN_SPOTS, TORII_Z, TEA, TEA_PATH, ZEN, SHISHI,
} from './layout.js';

// ---- Placement: keep randomly placed props from overlapping each other ----
// Every footprint is a circle on the ground plane: circle-vs-circle overlap is just
// "is the distance between centres less than the sum of the radii?".
// This is only for laying the garden out; what the player bumps into is physics.js.
const occupied = [];
export function isClear(x, z, r) {
  if (Math.abs(Math.hypot(x, z) - FENCE_R) < r + 1) return false; // keep the fence line clear
  return occupied.every((o) => Math.hypot(o.x - x, o.z - z) >= o.r + r);
}
export function reserve(x, z, r) {
  occupied.push({ x, z, r });
}
// Random free spot in a ring around the origin; null if none found.
// With keep = true the spot is reserved so later props avoid it.
// Picking an angle and a distance (polar coordinates) keeps spots within the ring.
export function randomFreeSpot(minD, maxD, r, keep = true, tries = 40) {
  for (let i = 0; i < tries; i++) {
    const a = rand() * Math.PI * 2;
    const d = minD + rand() * (maxD - minD);
    const x = Math.cos(a) * d, z = Math.sin(a) * d;
    if (isClear(x, z, r)) {
      if (keep) reserve(x, z, r);
      return { x, z };
    }
  }
  return null;
}

// Fixed features, reserved here, before anything random is placed. They're listed
// centrally rather than in each feature's module, because the reservations must all
// exist before the first random prop (the grass mounds) looks for room.
// A new fixed feature must reserve its footprint here too.
reserve(0, POND_Z, POND_R + 1.5);                                  // pond + rim + bridge
for (const [x, z] of LANTERN_SPOTS) reserve(x, z, 1.5);
for (const [x, z] of PATH_LANTERN_SPOTS) reserve(x, z, 1.2);
reserve(-5, TORII_Z, 1.2); reserve(5, TORII_Z, 1.2);              // torii posts
for (let z = POND_Z + POND_R; z <= 46; z += 2) reserve(0, z, 2);  // stepping-stone path + spawn
reserve(TEA.x, TEA.z, 6.5);
for (const [x, z] of TEA_PATH) reserve(x, z, 1.2);
reserve(ZEN.x, ZEN.z, 10.5);
reserve(SHISHI.x, SHISHI.z, 2.5);
