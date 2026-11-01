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
