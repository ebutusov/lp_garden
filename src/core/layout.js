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
// Beside the tea path: the stone wash basin, north of the stones (kept east of the
// doorway, where the animals come out of the house), and the little temple bell in its
// frame a few steps further north.
export const TSUKUBAI = { x: -20.6, z: -2.6 };
export const BELL = { x: -17.4, z: -4.9 };
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
// The woodland ringing the garden outside the fence, out into the fog. On foot you can
// walk out of the gateway as far as its edge.
export const FOREST = { inner: 66, outer: 140 };

// Where the sun and moon stand, as unit vectors from the viewer. The sun light shines
// from SUN_DIR by day and swings round to MOON_DIR at night (syncShadow in lights.js),
// so shadows always fall away from what's in the sky. The sun is high in the south-east,
// behind you as you come in; the moon hangs low in the north-east, just over the
// mountain ranges and to the right of Fuji.
export const SUN_DIR = new THREE.Vector3(40, 60, 20).normalize();
const MOON_AZIMUTH = 0.5, MOON_ELEVATION = 0.21; // radians: east of north, above the horizon
export const MOON_DIR = new THREE.Vector3(
  Math.sin(MOON_AZIMUTH) * Math.cos(MOON_ELEVATION),
  Math.sin(MOON_ELEVATION),
  -Math.cos(MOON_AZIMUTH) * Math.cos(MOON_ELEVATION),
);

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

// ---- The brook ----
// A rockery (a tsukiyama, "built hill") in the north-west corner, with a waterfall on
// its south face. The water gathers in a plunge pool at its foot and winds south-east
// as a shallow stream into the pond's north-west bank. Seen from the entrance, the
// falls sit just under Mount Fuji.
//
// The course runs through ground where nothing random had been placed, so reserving
// it (placement.js) leaves every tree, flower and rock where it was.
export const FALLS = { x: -23, z: -31, r: 4, height: 3.2 };   // the rockery, and the falls' drop
export const FALLS_FACING = Math.atan2(0.4, 0.92);             // heading of the falls' face (atan2(x, z))
export const STREAM_INLET = -2.5;                              // angle on the pond rim where the stream joins it
export const STREAM_BANK = 1.1;                                // how far the banks reach past the water's edge
// The stream's centre line, from the plunge pool to the pond rim: [x, z, water width].
export const STREAM = [
  [-21.7, -28.0, 3.0],  // plunge pool
  [-21.2, -25.6, 1.5],
  [-21.5, -22.4, 1.3],
  [-18.6, -19.6, 1.3],
  [-15.4, -18.6, 1.4],
  [-12.4, -15.6, 1.4],
  [Math.cos(STREAM_INLET) * (POND_R + 0.8), POND_Z + Math.sin(STREAM_INLET) * (POND_R + 0.8), 1.5],
];

// Evenly spaced samples { x, z, w, heading } along a smooth curve through STREAM, about
// `step` apart. A Catmull-Rom spline passes through every control point (unlike a Bézier
// curve, which only passes near its middle ones), so the course goes where it's told.
// The width is interpolated between the control points' widths.
export function streamCourse(step = 0.5) {
  const curve = new THREE.CatmullRomCurve3(STREAM.map(([x, z]) => new THREE.Vector3(x, 0, z)), false, 'centripetal');
  const n = Math.max(2, Math.ceil(curve.getLength() / step));
  const out = [];
  for (let i = 0; i <= n; i++) {
    const u = i / n;                                   // fraction of the length...
    const p = curve.getPointAt(u), tan = curve.getTangentAt(u);
    const k = curve.getUtoTmapping(u) * (STREAM.length - 1); // ...and which control points it lies between
    const j = Math.min(STREAM.length - 2, Math.floor(k));
    const w = THREE.MathUtils.lerp(STREAM[j][2], STREAM[j + 1][2], k - j);
    out.push({ x: p.x, z: p.z, w, heading: Math.atan2(tan.x, tan.z) });
  }
  return out;
}
