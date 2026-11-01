import * as THREE from 'three';
import { camera, cameraGroup } from '../core/camera.js';
import { clamp } from '../core/random.js';
import { player } from '../core/state.js';
import { WORLD, WATER_LEVEL, FENCE_R, FENCE_GAP, FENCE_H, BRIDGE_RAIL, inPond } from '../core/layout.js';
import { bridgeDeckTop, PLAYER_HEIGHT, PLAYER_RADIUS, MAX_STEP } from '../core/physics.js';
import { keys } from '../input/keys.js';
import { touch } from '../input/touch.js';

// ---- Player movement: first-person walking (or 6DOF flight with F) ----
const moveSpeed = 14; // units/sec
const runMultiplier = 2.0;
const gravity = 22;          // units/sec²
const WADE_SPEED = 0.5;      // movement multiplier in the water
const SINK_SPEED = 3;        // max fall speed through water
const CLIMB_SPEED = 5;       // how fast you haul yourself out onto the bank

const WORLD_UP = new THREE.Vector3(0, 1, 0);
const forward = new THREE.Vector3();
const right = new THREE.Vector3();
const wish = new THREE.Vector3();

// The garden's colliders (core/physics.js), handed over by main.js.
let physics = null;
export function initMovement(gardenPhysics) {
  physics = gardenPhysics;
}

// Push the player out of trunks, rocks, walls and other solids (sliding along them).
// Rather than stopping dead on contact, the player is moved to the nearest point just
// outside the solid. Movement toward the obstacle is cancelled while movement along
// it is kept, which is what makes you slide around a tree instead of sticking to it.
function resolveSolids(p, feet) {
  const R = PLAYER_RADIUS;
  for (let iter = 0; iter < 2; iter++) {
    for (const s of physics.solids) {
      if (feet >= s.h) continue; // standing higher than it: no collision (e.g. on top of a table)
      if (s.r !== undefined) {
        const dx = p.x - s.x, dz = p.z - s.z, d = Math.hypot(dx, dz), min = s.r + R;
        if (d >= min) continue;
        if (d < 1e-6) { p.x += min; continue; }
        p.x = s.x + dx / d * min;
        p.z = s.z + dz / d * min;
      } else {
        const cx = clamp(p.x, s.minX, s.maxX), cz = clamp(p.z, s.minZ, s.maxZ);
        const dx = p.x - cx, dz = p.z - cz, d = Math.hypot(dx, dz);
        if (d >= R) continue;
        if (d > 1e-6) {
          p.x = cx + dx / d * R;
          p.z = cz + dz / d * R;
        } else { // centre inside the box: leave by the nearest side
          const out = [p.x - s.minX, s.maxX - p.x, p.z - s.minZ, s.maxZ - p.z];
          const m = Math.min(...out);
          if (m === out[0]) p.x = s.minX - R;
          else if (m === out[1]) p.x = s.maxX + R;
          else if (m === out[2]) p.z = s.minZ - R;
          else p.z = s.maxZ + R;
        }
      }
    }
  }
}

// The fence ring blocks you except at the gateway; you slide along it.
function collideFence(p, prevX, prevZ, feet) {
  if (feet > FENCE_H) return;
  if (p.z > 0 && Math.abs(p.x) < FENCE_GAP - PLAYER_RADIUS) return;
  const d = Math.hypot(p.x, p.z), band = 0.15 + PLAYER_RADIUS;
  if (Math.abs(d - FENCE_R) >= band) return;
  const side = Math.hypot(prevX, prevZ) < FENCE_R ? -1 : 1;
  const target = FENCE_R + side * band;
  p.x *= target / d;
  p.z *= target / d;
}

// Keep the player within the roaming area.
function clampToWorld() {
  const b = WORLD - 4;
  const p = cameraGroup.position;
  const d = Math.hypot(p.x, p.z);
  if (d > b) { p.x *= b / d; p.z *= b / d; }
}

export function updateMovement(dt) {
  const running = keys['shift'] ? runMultiplier : 1;
  const p = cameraGroup.position;
  // Wading: only when actually down in the water, not on the bridge above it.
  const wading = !player.flyMode && inPond(p.x, p.z) && p.y - PLAYER_HEIGHT < WATER_LEVEL;
  const speed = moveSpeed * running * (wading ? WADE_SPEED : 1);

  // Apply yaw/pitch first so the camera's matrix reflects the current aim,
  // then read back the orthonormal world-space basis it defines.
  // A 4×4 transform matrix stores the object's own axes as its first three columns
  // (three.js keeps elements column by column): elements 0–2 are its local X ("right")
  // and 8–10 its local Z. Cameras look down their -Z, so forward is minus that column.
  cameraGroup.rotation.set(0, player.yaw, 0);
  camera.rotation.x = player.pitch;
  camera.updateWorldMatrix(true, false); // refresh the parent too, not just the camera
  const m = camera.matrixWorld.elements;
  forward.set(-m[8], -m[9], -m[10]);
  right.set(m[0], m[1], m[2]).normalize();
  // Walking moves along the ground regardless of where you look.
  if (!player.flyMode) forward.y = 0;
  forward.normalize();

  // Horizontal + forward motion (WASD or the touch joystick) works in both ground and flight.
  wish.set(0, 0, 0);
  if (keys['w']) wish.add(forward);
  if (keys['s']) wish.sub(forward);
  if (keys['d']) wish.add(right);
  if (keys['a']) wish.sub(right);
  if (touch.joyId !== null) wish.addScaledVector(forward, -touch.jy).addScaledVector(right, touch.jx);

  // In flight, Space rises and C sinks, using world-space up.
  // (Not Ctrl: Ctrl+W closes the tab and pages can't prevent it.)
  if (player.flyMode) {
    if (keys[' ']) wish.add(WORLD_UP);
    if (keys['c']) wish.sub(WORLD_UP);
  }

  // Normalising keeps diagonal movement (W+D) from being √2 times faster than straight.
  if (wish.lengthSq() > 1) wish.normalize(); // keep the joystick analog below full tilt
  const prevX = p.x, prevZ = p.z;
  const feet = p.y - PLAYER_HEIGHT;
  // Move in short sub-steps so a slow frame can't carry you through a thin wall.
  // ("Tunnelling": one big step could start in front of a wall and end behind it, with
  // no overlap ever detected.)
  const SUBSTEP = 0.2;
  const steps = Math.max(1, Math.ceil(Math.hypot(wish.x, wish.z) * speed * dt / SUBSTEP));
  for (let i = 0; i < steps; i++) {
    const sx = p.x, sz = p.z;
    p.x += wish.x * speed * dt / steps;
    p.z += wish.z * speed * dt / steps;
    clampToWorld();
    resolveSolids(p, feet);
    collideFence(p, sx, sz, feet);
  }
  p.y += wish.y * speed * dt; // only non-zero in flight

  if (player.flyMode) {
    // Free 6DOF flight: no gravity or floor clamp.
    p.y = Math.max(0.1, Math.min(WORLD, p.y));
    return;
  }

  // On the bridge, the rails keep you on the deck; leave by either end.
  const prevDeck = bridgeDeckTop(prevX, prevZ);
  if (prevDeck !== null && feet >= prevDeck - 0.3 && bridgeDeckTop(0, p.z) !== null) {
    const limit = BRIDGE_RAIL - PLAYER_RADIUS;
    p.x = Math.max(-limit, Math.min(limit, p.x));
  }
  // Anything higher than a step (e.g. the deck's side over the water) blocks you,
  // except the bank when wading out of the pond: you climb out instead.
  const climbingOut = wading && !inPond(p.x, p.z) && bridgeDeckTop(p.x, p.z) === null;
  const tooHigh = physics.groundHeightAt(p.x, p.z, feet) - feet > MAX_STEP && !climbingOut;
  if (tooHigh || physics.deckBlocks(p.x, p.z, feet, p.y)) {
    p.x = prevX;
    p.z = prevZ;
  }

  // Jump / gravity. Simple Euler integration: acceleration changes velocity, velocity
  // changes position, each scaled by dt.
  const wasOnGround = player.onGround;
  if ((keys[' ']) && player.onGround) {
    player.verticalVel = 10;
    player.onGround = false;
  }
  player.verticalVel -= gravity * dt;
  // Water drag: sink slowly instead of dropping like a stone.
  if (inPond(p.x, p.z) && feet < WATER_LEVEL) player.verticalVel = Math.max(player.verticalVel, -SINK_SPEED);
  p.y += player.verticalVel * dt;
  const floor = physics.groundHeightAt(p.x, p.z, feet) + PLAYER_HEIGHT;
  // Snap down while walking downhill so you don't hop off the bridge's slope.
  const stepDown = wasOnGround && player.verticalVel <= 0 && p.y - floor < MAX_STEP;
  if (p.y <= floor || stepDown) {
    // A big step up only happens when hauling yourself out of the pond.
    p.y = floor - p.y > MAX_STEP ? Math.min(floor, p.y + CLIMB_SPEED * dt) : floor;
    player.verticalVel = 0;
    player.onGround = true;
  } else {
    player.onGround = false;
  }
}
