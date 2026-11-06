import { clamp } from './random.js';
import { clock } from './clock.js';
import {
  POND_Z, POND_R, inPond, waterSurface, TEA, FENCE_R,
  BRIDGE_SPAN, BRIDGE_RISE, BRIDGE_WIDTH, BRIDGE_DECK,
} from './layout.js';

// ---- Physical world: what blocks the player and what they can stand on ----
// Games rarely collide against the triangles that are drawn. Instead each object gets
// a much simpler invisible stand-in ("collider"): here circles and boxes on the
// ground plane, each with a height. Testing a point against a few dozen of those is
// far cheaper than against thousands of triangles, and it's easy to reason about.
//
// One Physics object holds every collider. main.js makes it and hands it to whatever
// adds colliders (the features, the animals) or tests against them (player movement).

export const PLAYER_HEIGHT = 2.6;      // eye height above the feet
export const PLAYER_RADIUS = 0.3;
export const MAX_STEP = 0.6;           // tallest ledge you can walk up (or down) without jumping
const HEAD_ABOVE_WATER = 0.35;         // eye height above the surface while in the pond
const HEAD_CLEARANCE = 0.35;           // room needed between the eyes and the underside of the deck

// World-space height of the bridge deck surface at (x, z), or null when not over the deck.
// The deck is an arc: a half sine wave over the span, so the height is
// sin(t·π)·RISE where t runs 0 → 1 from one end to the other.
// The arc is symmetric, so the bridge's rotation doesn't flip it.
// A pure function of the layout: it needs no colliders, so it isn't a method.
export function bridgeDeckTop(x, z) {
  if (Math.abs(x) > BRIDGE_WIDTH / 2) return null;
  const t = (z - POND_Z) / BRIDGE_SPAN + 0.5;
  if (t < 0 || t > 1) return null;
  return Math.sin(t * Math.PI) * BRIDGE_RISE + BRIDGE_DECK / 2;
}

// The pond's no-go circle for animals, and how far its edge is from the water.
const POND_KEEP_OUT = POND_R + 1.2;

// Is (px, pz) in the gap between a circle (centre at the origin, radius R) and a
// corner point (cx, cz) outside it, on the near side? That gap is the triangle
// between the corner and the two points where lines from it just touch the circle
// (the tangent points, at an angle acos(R / d) either side of the corner's direction,
// d being its distance). Add those triangles and a shape with a box poking out of a
// circle becomes its "convex hull": the shape a rubber band stretched round it would
// make, with no inside corners.
function inTangentWedge(px, pz, R, cx, cz) {
  const d = Math.hypot(cx, cz);
  if (d <= R) return false;
  const a = Math.acos(R / d), b = Math.atan2(cz, cx);
  const t1x = R * Math.cos(b + a), t1z = R * Math.sin(b + a);
  const t2x = R * Math.cos(b - a), t2z = R * Math.sin(b - a);
  // Inside a triangle: on the same side of all three edges (the cross products agree in sign).
  const side = (ax, az, bx, bz) => (bx - ax) * (pz - az) - (bz - az) * (px - ax);
  const s1 = side(cx, cz, t1x, t1z), s2 = side(t1x, t1z, t2x, t2z), s3 = side(t2x, t2z, cx, cz);
  return (s1 >= 0 && s2 >= 0 && s3 >= 0) || (s1 <= 0 && s2 <= 0 && s3 <= 0);
}

export class Physics {
  constructor() {
    this.solids = [];     // circles {x, z, r, h} and boxes {minX, maxX, minZ, maxZ, h}; block below height h
    this.platforms = [];  // walkable boxes {minX, maxX, minZ, maxZ, y}
    this.pads = [];       // walkable discs {x, z, r, y}: the tops of the stepping stones
    this.mounds = [];     // grass bumps {x, z, r}
  }

  // Each returns the collider it added, so its owner can move it (the animals do).
  addCircleSolid(x, z, r, h) {
    const s = { x, z, r, h };
    this.solids.push(s);
    return s;
  }
  addBoxSolid(minX, maxX, minZ, maxZ, h) {
    const s = { minX, maxX, minZ, maxZ, h };
    this.solids.push(s);
    return s;
  }
  addPlatform(minX, maxX, minZ, maxZ, y) {
    const p = { minX, maxX, minZ, maxZ, y };
    this.platforms.push(p);
    return p;
  }
  addPad(x, z, r, y) {
    const p = { x, z, r, y };
    this.pads.push(p);
    return p;
  }
  addMound(x, z, r) {
    const m = { x, z, r };
    this.mounds.push(m);
    return m;
  }

  // Height of the walkable ground features at (x, z): tea house floor, gravel garden,
  // stepping stones, mounds.
  surfaceHeightAt(x, z) {
    let h = 0;
    for (const pl of this.platforms) {
      if (x >= pl.minX && x <= pl.maxX && z >= pl.minZ && z <= pl.maxZ) h = Math.max(h, pl.y);
    }
    for (const pd of this.pads) {
      if ((x - pd.x) ** 2 + (z - pd.z) ** 2 < pd.r * pd.r) h = Math.max(h, pd.y);
    }
    // A mound is a cone sunk halfway into the ground: its visible top has radius r/2
    // and peak 0.3·r, so the height falls off linearly with distance from the centre.
    for (const m of this.mounds) {
      const d = Math.hypot(x - m.x, z - m.z);
      if (d < m.r / 2) h = Math.max(h, 0.3 * m.r - 0.6 * d);
    }
    return h;
  }

  // Height of whatever you'd stand on at (x, z) for feet at height `feet`:
  // the bridge deck if you're on it (or stepping onto it), else the pond's
  // "floor" (deep enough that only your head is out), else the ground surface.
  // Below the deck, e.g. swimming under it, the deck doesn't count.
  groundHeightAt(x, z, feet) {
    const deck = bridgeDeckTop(x, z);
    if (deck !== null && feet >= deck - MAX_STEP) return deck;
    if (inPond(x, z)) return waterSurface(clock.elapsedTime) + HEAD_ABOVE_WATER - PLAYER_HEIGHT;
    return this.surfaceHeightAt(x, z);
  }

  // True if the deck slab at (x, z) would cut through your body: you're not
  // stepping onto it, and it's not high enough overhead to pass beneath.
  deckBlocks(x, z, feet, eyeY) {
    const deck = bridgeDeckTop(x, z);
    if (deck === null || feet >= deck - MAX_STEP) return false;
    return deck - BRIDGE_DECK < eyeY + HEAD_CLEARANCE;
  }

  // Places animals won't go (they're polite about the tatami; the raked gravel they
  // walk on, and the Gardener rakes it smooth again), for an
  // animal of radius r whose own collision circle is `self`. `other` is one more collider
  // to overlook (say, whoever it's walking up to).
  // `house`: the tea house is allowed, for an animal sheltering from the rain. Its
  // walls are solids of their own, so it still has to come in through the door.
  groundBlocked(x, z, r, self, other = null, house = false) {
    if (this.pondBlocked(x, z, r)) return true;
    if (!house && this.nearTeaHouse(x, z)) return true;
    if (Math.hypot(x, z) > FENCE_R - 2) return true;
    return this.hitsSolid(x, z, r, self, other);
  }

  // The pond and the bridge across it, as one obstacle for an animal of radius r: a
  // circle round the water, the bridge's box (padded by the body) poking out of it at
  // each bank, and the wedges that fill the inside corners where the two meet.
  // Without the wedges each bank has two right-angled nooks between the rim and the
  // bridge. Steering by feelers is greedy: an animal that walks into one faces a wall
  // whichever way it looks toward its goal, and turns back and forth in there. With
  // them the obstacle is convex, and keeping to one side always leads round it.
  pondBlocked(x, z, r) {
    const dz = z - POND_Z, dist = Math.hypot(x, dz);
    if (dist < POND_KEEP_OUT) return true;
    const w = BRIDGE_WIDTH / 2 + r, l = BRIDGE_SPAN / 2 + r;
    if (Math.abs(x) < w && Math.abs(dz) < l) return true; // the bridge, with room for the body
    if (dist >= Math.hypot(w, l)) return false;            // the wedges are all nearer than the box's corners
    const end = Math.sign(dz) * l;                          // the bank this side of the pond
    return inTangentWedge(x, dz, POND_KEEP_OUT, w, end) || inTangentWedge(x, dz, POND_KEEP_OUT, -w, end);
  }

  // The box round the tea house (with its doorstep) that animals keep out of.
  nearTeaHouse(x, z) {
    return Math.abs(x - TEA.x) < 4.8 && Math.abs(z - TEA.z) < 4.2;
  }

  // Would a circle of radius r at (x, z) overlap any solid, apart from the `ignore`d ones?
  hitsSolid(x, z, r, ...ignore) {
    for (const s of this.solids) {
      if (ignore.includes(s)) continue;
      if (s.r !== undefined) {
        if (Math.hypot(x - s.x, z - s.z) < s.r + r) return true;
      } else {
        // Circle vs box: clamp the centre into the box to find the box's closest point.
        const cx = clamp(x, s.minX, s.maxX), cz = clamp(z, s.minZ, s.maxZ);
        if (Math.hypot(x - cx, z - cz) < r) return true;
      }
    }
    return false;
  }
}
