// ---- Entry point ----
// Importing a module runs its top-level code once, in import order. The modules here
// mostly just define classes and functions; nothing in the garden exists until this
// file builds it. It makes the shared context, hands it to buildGarden() (garden.js),
// which constructs every feature and animal in a deliberate order, and then gives the
// effects, player, input and UI modules the parts of the garden they work with.
import { scene } from './core/scene.js';
import { clock } from './core/clock.js';
import { camera } from './core/camera.js';
import { renderer, composer } from './core/renderer.js';
import { syncShadow } from './core/lights.js';
import { SEED, mulberry32 } from './core/random.js';
import { Physics } from './core/physics.js';
import { Placement } from './core/placement.js';
import { buildGarden } from './garden.js';

import { initPetals, updatePetals } from './effects/petals.js';
import { updateFireflies } from './effects/fireflies.js';
import { initDayNight, updateDayNight } from './effects/dayNight.js';

import { updateLook } from './player/look.js';
import { initMovement, updateMovement } from './player/movement.js';
import { initFootsteps, updateFootsteps } from './player/footsteps.js';
import { setupKeyboardMouse } from './input/keyboardMouse.js';
import { setupTouch } from './input/touch.js';
import { updateAudio } from './audio/ambience.js';
import { initHint, updateHint } from './ui/hint.js';
import { drawCompass } from './ui/compass.js';
import { setHelpVisible } from './ui/help.js';
import { installDebug } from './debug.js';

// ---- The shared context ----
// What every feature builds into or draws from (see world/feature.js):
//  - scene:     the scene graph it adds its meshes to;
//  - physics:   the colliders it registers (core/physics.js);
//  - placement: where random props may still go (core/placement.js);
//  - rand:      the ONE seeded random generator, so the layout is the same every visit.
// Placement draws from the same `rand`, so its random spots are part of that sequence.
const rand = mulberry32(SEED);
const ctx = { scene, physics: new Physics(), placement: new Placement(rand), rand };

// Phones and tablets get half the grass: their GPUs have less to spare.
const garden = buildGarden(ctx, {
  anisotropy: renderer.capabilities.getMaxAnisotropy(),
  grassDensity: matchMedia('(pointer: coarse)').matches ? 0.5 : 1,
});
const {
  sky, grass, pond, koi, feeding, ripples, trees, shishi, dog, hearts, birds, cats, teaThings, clouds, lanterns,
} = garden;

// Hand the function modules the parts of the garden they need.
initPetals(garden);
initDayNight(garden);
initMovement(ctx.physics);
initFootsteps(garden);
initHint(garden);
setupKeyboardMouse(garden);
setupTouch(garden);
installDebug(garden, ctx);

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
  grass.update(dt, t);
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
