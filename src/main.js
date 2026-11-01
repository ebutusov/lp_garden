// ---- Entry point ----
// Importing a module runs its top-level code once, in import order, depth first.
// Most modules here build their meshes as a side effect of being imported, so this
// list is also the order in which the garden is built.
//
// ORDER MATTERS, for two reasons:
//  1. The layout comes from one seeded random sequence (core/random.js). The modules
//     that call rand() at load time must run in this order: ground (mounds), trees,
//     pond (lily pads), koi, stepping stones, zen garden, rocks, flowers. Reordering
//     them, or making an earlier module import a later one, rearranges the garden.
//  2. The animals pick their starting spots by avoiding everything in `solids`, so
//     every world module that adds solids must load before any animal module.
import { clock } from './core/clock.js';
import { camera } from './core/camera.js';
import { renderer, composer } from './core/renderer.js';
import { syncShadow } from './core/lights.js';
import './core/placement.js'; // reserves the fixed features' footprints

// The world, in layout order.
// Each module creates its feature (a Feature subclass, see world/feature.js) on import.
import { sky } from './world/sky.js';
import './world/ground.js';
import './world/fuji.js';
import { clouds } from './world/clouds.js';
import { trees } from './world/trees.js';
import { lanterns } from './world/lanterns.js';
import { pond } from './world/pond.js';
import { ripples } from './world/ripples.js';
import { koi } from './animals/koi.js';
import './world/bridge.js';
import './world/torii.js';
import './world/steppingStones.js';
import './world/teaHouse.js';
import './world/zenGarden.js';
import { shishi } from './world/shishiOdoshi.js';
import './world/fence.js';
import './world/rocks.js';
import './world/flowers.js';
import { teaThings } from './world/teaThings.js';

// Effects.
import { updatePetals } from './effects/petals.js';
import { updateFireflies } from './effects/fireflies.js';
import { updateDayNight } from './effects/dayNight.js';

// Animals: after every solid is in place.
import { feeding } from './animals/feeding.js';
import { dog } from './animals/dog.js';
import { hearts } from './animals/hearts.js';
import { birds } from './animals/birds.js';
import { cats } from './animals/cats.js';

// The player, input and UI.
import { updateLook } from './player/look.js';
import { updateMovement } from './player/movement.js';
import { updateFootsteps } from './player/footsteps.js';
import './input/keyboardMouse.js';
import { updateAudio } from './audio/ambience.js';
import { updateHint } from './ui/hint.js';
import { drawCompass } from './ui/compass.js';
import { setHelpVisible } from './ui/help.js';
import './debug.js';

// ---- Animation loop ----
// The "game loop": every frame, advance the simulation by dt, then draw. The browser
// calls requestAnimationFrame callbacks just before each screen refresh, and pauses
// them in background tabs.
function animate() {
  requestAnimationFrame(animate);
  // Cap the step: after a stall (tab switch, slow frame) a huge dt would make things
  // jump or tunnel through walls. Simulated time then runs slower than real time.
  const dt = Math.min(clock.getDelta(), 0.05);
  const t = clock.elapsedTime;

  updateLook(dt);
  updateMovement(dt);
  updateFootsteps(dt, t);

  // Re-anchored after the final position (sun tracking goes here, not in setup)
  syncShadow();
  updateDayNight(dt);
  sky.update(dt, t); // moves the sky, stars and moon with the player

  pond.update(dt, t);
  koi.update(dt, t);
  feeding.update(dt, t);
  ripples.update(dt, t);
  trees.update(dt, t);
  updatePetals(dt, t);
  shishi.update(dt, t);
  dog.update(dt, t);
  hearts.update(dt);
  birds.update(dt, t);
  cats.update(dt, t);
  teaThings.update(dt, t);
  updateFireflies(t);
  clouds.update(dt, t);
  lanterns.update(dt, t);

  updateAudio();
  updateHint();
  drawCompass();
  // Draw through the post-processing chain rather than renderer.render().
  composer.render();
}
animate();

// ---- Resize ----
// Keep the projection's aspect ratio in step with the window, or the image stretches.
// updateProjectionMatrix() must be called after changing any camera lens setting.
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  composer.setSize(window.innerWidth, window.innerHeight);
});

// Show overlay until first click (touch devices hide it on the first tap)
setHelpVisible(true);
