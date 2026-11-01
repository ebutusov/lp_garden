import * as THREE from 'three';
import { scene } from './scene.js';
import { cameraGroup } from './camera.js';
import { player } from './state.js';

// ---- Lighting ----
// Three.js (r155+) uses physically based light units: a PointLight's intensity is in
// candela, and a DirectionalLight's in lux. Materials then respond to light the way
// real surfaces roughly would.

// A hemisphere light is cheap ambient light: surfaces facing up get the sky colour,
// surfaces facing down get the ground colour, and anything in between a blend. It
// stops shadowed sides from going pitch black.
export const hemi = new THREE.HemisphereLight(0xbfe0ff, 0x7a8f57, 0.85);
scene.add(hemi);

// The sun: a DirectionalLight casts parallel rays, as if from infinitely far away.
// Only position − target.position (its direction) matters for lighting.
export const sun = new THREE.DirectionalLight(0xfff4e0, 1.15);
sun.position.set(40, 60, 20);
sun.castShadow = true;
// The shadow is rendered through an orthographic (box-shaped) camera aligned with the
// rays. Its 2048² texture is spread over the box's width, so a smaller box gives
// sharper shadows over less ground.
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.near = 1;
sun.shadow.camera.far = 200;
sun.shadow.camera.left = -80;
sun.shadow.camera.right = 80;
sun.shadow.camera.top = 80;
sun.shadow.camera.bottom = -80;
// A tiny depth offset stops surfaces from shadowing themselves in stripes ("shadow acne").
sun.shadow.bias = -0.0004;
scene.add(sun);
scene.add(sun.target); // the target must be in the scene for its position to update

const SUN_OFFSET = new THREE.Vector3(40, 60, 20);

// Keep the shadow camera re-anchored on the player after each move. The fixed
// sun offset makes the sun->player distance invariant, so far/near never
// change; only the orthographic clip adapts for sharpness vs. coverage.
export function syncShadow() {
  sun.target.position.copy(cameraGroup.position);
  sun.position.copy(cameraGroup.position).add(SUN_OFFSET);

  // Flying high you see far more ground, so the shadow area must grow, not shrink.
  const clip = player.flyMode ? 130 : 80;
  const s = sun.shadow.camera;
  s.left = -clip;
  s.right = clip;
  s.top = clip;
  s.bottom = -clip;
  s.updateProjectionMatrix();
}
