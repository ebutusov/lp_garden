import { clamp } from './random.js';
import { clock } from './clock.js';
import {
  POND_Z, POND_R, inPond, waterSurface, ZEN, TEA, FENCE_R,
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

export class Physics {
  constructor() {
    this.solids = [];     // circles {x, z, r, h} and boxes {minX, maxX, minZ, maxZ, h}; block below height h
    this.platforms = [];  // walkable boxes {minX, maxX, minZ, maxZ, y}
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
  addMound(x, z, r) {
    const m = { x, z, r };
    this.mounds.push(m);
    return m;
  }

  // Height of the walkable ground features at (x, z): tea house floor, gravel garden, mounds.
  surfaceHeightAt(x, z) {
    let h = 0;
    for (const pl of this.platforms) {
      if (x >= pl.minX && x <= pl.maxX && z >= pl.minZ && z <= pl.maxZ) h = Math.max(h, pl.y);
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

  // Places animals won't go (they're polite about the raked gravel and the tatami), for an
  // animal of radius r whose own collision circle is `self`.
  groundBlocked(x, z, r, self) {
    if (Math.hypot(x, z - POND_Z) < POND_R + 1.2) return true;
    if (Math.abs(x) < BRIDGE_WIDTH / 2 + r && Math.abs(z - POND_Z) < BRIDGE_SPAN / 2 + r) return true; // bridge, with room for the body
    if (Math.abs(x - ZEN.x) < ZEN.w / 2 + 0.8 && Math.abs(z - ZEN.z) < ZEN.d / 2 + 0.8) return true;
    if (Math.abs(x - TEA.x) < 4.8 && Math.abs(z - TEA.z) < 4.2) return true;
    if (Math.hypot(x, z) > FENCE_R - 2) return true;
    for (const s of this.solids) {
      if (s === self) continue;
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
