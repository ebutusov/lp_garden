import * as THREE from 'three';
import { scene } from './scene.js';
import { cameraGroup } from './camera.js';
import { env, player } from './state.js';
import { SUN_DIR, MOON_DIR } from './layout.js';

// ---- Lighting ----
// Three.js (r155+) uses physically based light units: a PointLight's intensity is in
// candela, and a DirectionalLight's in lux. Materials then respond to light the way
// real surfaces roughly would.

// A hemisphere light is cheap ambient light: surfaces facing up get the sky colour,
// surfaces facing down get the ground colour, and anything in between a blend. It
// stops shadowed sides from going pitch black.
export const hemi = new THREE.HemisphereLight(0xbfe0ff, 0x7a8f57, 0.85);
scene.add(hemi);

// How far from the player the light sits along its direction. Only the direction
// matters for lighting, but the shadow camera starts at the light, so this distance
// and `far` must enclose everything that casts or receives shadows nearby.
const LIGHT_DIST = 150;

// The sun: a DirectionalLight casts parallel rays, as if from infinitely far away.
// Only position − target.position (its direction) matters for lighting. At night
// the same light turns into moonlight (dayNight.js recolours it, syncShadow moves it).
export const sun = new THREE.DirectionalLight(0xfff4e0, 1.15);
sun.position.copy(SUN_DIR).multiplyScalar(LIGHT_DIST);
sun.castShadow = true;
// The shadow is rendered through an orthographic (box-shaped) camera aligned with the
// rays. Its 2048² texture is spread over the box's width, so a smaller box gives
// sharper shadows over less ground.
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.near = 1;
// Deep enough for the low moon: its slanting rays cross the ground at a shallow
// angle, so the ground the box covers spans a long way front to back.
sun.shadow.camera.far = LIGHT_DIST * 2.2;
sun.shadow.camera.left = -80;
sun.shadow.camera.right = 80;
sun.shadow.camera.top = 80;
sun.shadow.camera.bottom = -80;
// A tiny depth offset stops surfaces from shadowing themselves in stripes ("shadow acne").
sun.shadow.bias = -0.0004;
scene.add(sun);
scene.add(sun.target); // the target must be in the scene for its position to update

const lightDir = new THREE.Vector3();

// Keep the shadow camera re-anchored on the player after each move. The light stays
// LIGHT_DIST away along its direction, so far/near never change; only the
// orthographic clip adapts for sharpness vs. coverage.
export function syncShadow() {
  // Swing from the sun to the moon as night falls. Lerping two unit vectors and
  // normalising again is a cheap stand-in for rotating between them; the shadows
  // sweep round the garden during the fade.
  lightDir.lerpVectors(SUN_DIR, MOON_DIR, env.nightMix).normalize();
  sun.target.position.copy(cameraGroup.position);
  sun.position.copy(cameraGroup.position).addScaledVector(lightDir, LIGHT_DIST);

  // Flying high you see far more ground, so the shadow area must grow, not shrink.
  const clip = player.flyMode ? 130 : 80;
  const s = sun.shadow.camera;
  s.left = -clip;
  s.right = clip;
  s.top = clip;
  s.bottom = -clip;
  s.updateProjectionMatrix();
}
