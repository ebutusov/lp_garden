import * as THREE from 'three';

// ---- Layout constants ----
// World coordinates: Y is up, and the ground is the XZ plane at y = 0. The garden is
// centred on the origin. The player starts at +Z looking toward -Z ("north", where
// Mount Fuji stands). The player's eyes are 2.6 units above their feet.
export const WORLD = 120;          // how far the player may roam
export const GROUND_R = 400;       // ground disc reaches well past the fog, so its edge is never seen
export const POND_Z = -6;
export const POND_R = 10.5;
export const WATER_LEVEL = -0.15;
// Water surface height including its gentle bob, at time t (seconds).
export const waterSurface = (t) => WATER_LEVEL + Math.sin(t * 1.5) * 0.05;
export const inPond = (x, z) => Math.hypot(x, z - POND_Z) < POND_R;
export const FENCE_R = 50;         // bamboo fence around the garden...
export const FENCE_GAP = 5;        // ...with a gateway this wide either side of x = 0, on the torii side
export const FENCE_H = 1.8;
export const TEA = { x: -30, z: 0 };                  // tea house, facing east toward the pond
export const TEA_PATH = [[-24.4, 0.4], [-22.6, -0.2], [-20.8, 0.5], [-19, 0]]; // its stepping stones
export const BOWLS = { x: -30, z: 5.3 };            // the pets' bowls, in a row along its south wall
export const ZEN = { x: 28, z: 2, w: 16, d: 12 };     // raked gravel garden
export const SHISHI_ANGLE = -1.05;                    // bamboo water spout on the pond rim
export const SHISHI = {
  x: Math.cos(SHISHI_ANGLE) * 11.4,
  z: POND_Z + Math.sin(SHISHI_ANGLE) * 11.4,
};
export const LANTERN_SPOTS = [[6, 6], [-15, -2], [12, -18]];
// Smaller lanterns in pairs either side of the stepping-stone path to the bridge.
export const PATH_LANTERN_SCALE = 0.7;
export const PATH_LANTERN_GLOW = 0.25; // light output relative to a full-size lantern
export const PATH_PAPER_GLOW = 0.55;   // their paper boxes glow this much of a full-size one's
export const PATH_LANTERN_SPOTS = [27, 19, 11].flatMap((z) => [[-2.8, z], [2.8, z]]);
export const TORII_Z = 34;
// Planned tree spots. Each tree is jittered around its spot, and skipped if there's no room.
export const TREE_SPOTS = [
  [14, 10], [-16, 6], [20, -14], [-22, -10], [10, -26],
  [-12, 22], [26, 18], [-28, -22], [38, -16], [-36, 14],
  [6, 32], [-6, -34], [18, 30], [-24, 26],
  [30, 28], [-30, 30], [42, 10], [-40, -6], [-14, -30], [24, -30], [-34, -26], [0, -42],
];
// Mount Fuji's foot, far beyond the fence (and the fog).
export const FUJI_POS = new THREE.Vector3(-90, -2, -250);

// The arched bridge runs north-south across the pond at x = 0.
export const BRIDGE_SPAN = (POND_R + 2) * 2; // long enough to land on both banks
export const BRIDGE_RISE = 2.5;
export const BRIDGE_WIDTH = 3;
export const BRIDGE_DECK = 0.4;              // plank thickness
export const BRIDGE_RAIL = 1.4;              // rail posts' distance from the centre line

export const WIND_DIR = new THREE.Vector2(0.92, 0.39).normalize();
// Breeze strength over time: a slow swell plus gusts. Summing a few sine waves of
// unrelated frequencies is a cheap way to get motion that never visibly repeats.
export const windStrength = (t) => Math.max(0, 0.55 + 0.3 * Math.sin(t * 0.21) + 0.2 * Math.sin(t * 0.67 + 1.3));
