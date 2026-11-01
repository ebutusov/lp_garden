import { camera, cameraGroup } from '../core/camera.js';
import { player } from '../core/state.js';
import { POND_Z, WATER_LEVEL, inPond } from '../core/layout.js';
import { bridgeDeckTop, PLAYER_HEIGHT } from '../core/physics.js';
import { teaHouse } from '../world/teaHouse.js';
import { zenGarden } from '../world/zenGarden.js';
import { ripples } from '../world/ripples.js';
import { SFX } from '../audio/sfx.js';

// ---- Head bob, footsteps and wading ----
// The bob moves only the camera inside its group (camera.position.y), not the group
// itself, so it never affects collisions or the ground height.
const STRIDE = 1.7;  // distance per step
let stepPhase = 0, bobAmp = 0, wasWading = false;
let lastStepX = cameraGroup.position.x, lastStepZ = cameraGroup.position.z;
function footstep(wading, p, feet) {
  if (wading) {
    ripples.spawn(p.x, p.z - POND_Z, 1.1, 1.5);
    SFX.step('water');
    return;
  }
  const deck = bridgeDeckTop(p.x, p.z);
  const onDeck = deck !== null && Math.abs(feet - deck) < 0.3;
  SFX.step(onDeck || teaHouse.contains(p.x, p.z) ? 'wood' : zenGarden.contains(p.x, p.z) ? 'gravel' : 'grass');
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
    if (Math.floor(stepPhase / Math.PI) !== before) footstep(wading, p, feet);
  }
  // Lowest point of the bob lands on each footfall; in water you float gently instead.
  const stepBob = (Math.abs(Math.sin(stepPhase)) - 0.5) * bobAmp;
  camera.position.y = player.flyMode ? 0 : wading ? Math.sin(t * 1.4) * 0.035 + stepBob * 0.03 : stepBob * 0.09;
}
