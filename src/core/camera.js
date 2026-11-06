import * as THREE from 'three';
import { scene } from './scene.js';
import { PLAYER_HEIGHT } from './physics.js';

// ---- Camera ----
// PerspectiveCamera(fov, aspect, near, far): a 70° vertical field of view, the
// window's aspect ratio, and a near/far clipping range. Anything closer than `near`
// or further than `far` isn't drawn. Keep the ratio far/near modest: the depth buffer
// has limited precision, and a huge range makes distant surfaces flicker through
// each other ("z-fighting").
export const camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.1, 600);

// Layers: every object and camera has a set of 32 layers, and a camera draws only the
// objects that share at least one layer with it. Everything starts on layer 0. What's
// under the pond's surface (koi, floor) goes on UNDERWATER_LAYER instead: the player's
// camera sees both layers, while the reflection's camera (water.js) sees only layer 0,
// so it never spends a draw call on something it would clip away. Layers aren't
// inherited: each mesh needs its own (pond.hideFromReflection does that).
export const UNDERWATER_LAYER = 1;
camera.layers.enable(UNDERWATER_LAYER);

// The camera sits inside a group. The group turns left/right (yaw) and carries the
// player's position, while the camera inside it only tilts up/down (pitch). Nesting
// the two rotations means looking up never tilts the horizon, and "forward" for
// walking is simply the group's facing.
export const cameraGroup = new THREE.Group();
cameraGroup.add(camera);
// Start just outside the torii gate. Cameras look down -Z, so no base
// rotation is needed to face the garden at the origin.
cameraGroup.position.set(0, PLAYER_HEIGHT, 44);
scene.add(cameraGroup);
