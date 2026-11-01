import { player } from '../core/state.js';
import { keys } from '../input/keys.js';

// ---- Looking around ----
// Mouse, touch drag and arrow keys all just change two angles, yaw and pitch;
// movement.js applies them to the camera rig each frame.

// Stop just short of straight up/down: at exactly ±90° "forward" and "up" coincide
// and the view would flip.
export function clampPitch(p) {
  return Math.max(-Math.PI / 2 + 0.05, Math.min(Math.PI / 2 - 0.05, p));
}

// Arrow keys look around without pointer lock (keyboard-only users, automation).
const lookSpeed = 1.8; // rad/sec
export function updateLook(dt) {
  if (keys['arrowleft']) player.yaw += lookSpeed * dt;
  if (keys['arrowright']) player.yaw -= lookSpeed * dt;
  if (keys['arrowup']) player.pitch += lookSpeed * dt;
  if (keys['arrowdown']) player.pitch -= lookSpeed * dt;
  player.pitch = clampPitch(player.pitch);
}
