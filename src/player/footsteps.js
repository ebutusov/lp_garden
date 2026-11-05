import { camera, cameraGroup } from '../core/camera.js';
import { env, player } from '../core/state.js';
import { POND_Z, WATER_LEVEL, inPond } from '../core/layout.js';
import { bridgeDeckTop, PLAYER_HEIGHT } from '../core/physics.js';
import { SFX } from '../audio/sfx.js';

// ---- Head bob, footsteps and wading ----
// The bob moves only the camera inside its group (camera.position.y), not the group
// itself, so it never affects collisions or the ground height.
const STRIDE = 1.7;  // distance per step
let stepPhase = 0, bobAmp = 0, wasWading = false;
let lastStepX = cameraGroup.position.x, lastStepZ = cameraGroup.position.z;
// What the ground sounds like where (tea house floor, gravel, the stream), and the
// pond's ripples: handed over by main.js.
let teaHouse, zenGarden, ripples, stream;
export function initFootsteps(features) {
  ({ teaHouse, zenGarden, ripples, stream } = features);
}
// `side` is which foot: 1 left, -1 right.
function footstep(wading, p, feet, side) {
  if (wading) {
    ripples.spawn(p.x, p.z - POND_Z, 1.1, 1.5);
    SFX.step('water');
    return;
  }
  if (stream.contains(p.x, p.z)) { SFX.step('water'); return; } // splashing through the stream
  const deck = bridgeDeckTop(p.x, p.z);
  const onDeck = deck !== null && Math.abs(feet - deck) < 0.3;
  const gravel = !onDeck && zenGarden.contains(p.x, p.z);
  // In the rain the grass and the stepping stones are puddled: every step splashes.
  const wet = env.rainMix > 0.5;
  SFX.step(onDeck || teaHouse.contains(p.x, p.z) ? 'wood' : gravel ? 'gravel' : wet ? 'puddle' : 'grass');
  if (gravel) {
    // A footprint in the raked gravel, a little to the side of the camera. The player
    // faces (-sin yaw, -cos yaw), i.e. heading h = yaw + π; their left is (cos h, -sin h).
    const h = player.yaw + Math.PI, off = side * 0.13;
    zenGarden.footprint(p.x + Math.cos(h) * off, p.z - Math.sin(h) * off, h);
  }
}
export function updateFootsteps(dt, t) {
  const p = cameraGroup.position;
  const moved = Math.hypot(p.x - lastStepX, p.z - lastStepZ);
  lastStepX = p.x; lastStepZ = p.z;
  const feet = p.y - PLAYER_HEIGHT;
  const wading = !player.flyMode && inPond(p.x, p.z) && feet < WATER_LEVEL;
  if (wading && !wasWading) {
    ripples.spawn(p.x, p.z - POND_Z, 2, 2);
    ripples.spawn(p.x, p.z - POND_Z, 1.2, 1.4);
    SFX.splash(1);
  }
  wasWading = wading;
  // moved < 2 ignores teleports (garden.setView)
  const walking = !player.flyMode && (player.onGround || wading) && moved > 0.0005 && moved < 2;
  bobAmp += ((walking ? 1 : 0) - bobAmp) * Math.min(1, dt * 8);
  if (walking) {
    // The step phase advances with distance walked, half a sine cycle (π) per stride,
    // so a footstep sound plays each time it crosses a multiple of π.
    const before = Math.floor(stepPhase / Math.PI);
    stepPhase += moved / STRIDE * Math.PI;
    const step = Math.floor(stepPhase / Math.PI);
    if (step !== before) footstep(wading, p, feet, step % 2 ? 1 : -1);
  }
  // Lowest point of the bob lands on each footfall; in water you float gently instead.
  const stepBob = (Math.abs(Math.sin(stepPhase)) - 0.5) * bobAmp;
  camera.position.y = player.flyMode ? 0 : wading ? Math.sin(t * 1.4) * 0.035 + stepBob * 0.03 : stepBob * 0.09;
}
