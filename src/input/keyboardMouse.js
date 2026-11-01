import { env, player } from '../core/state.js';
import { clampPitch } from '../player/look.js';
import { toggleFly } from '../player/flight.js';
import { setNight } from '../effects/dayNight.js';
import { sound, setSound } from '../audio/audio.js';
import { interaction } from '../animals/interaction.js';
import { helpVisible, showHelp, hideHelp } from '../ui/help.js';
import { keys } from './keys.js';
import { touch } from './touch.js';
import { lockPointer, isPointerLocked } from './pointerLock.js';

// ---- Desktop controls: first-person mouse-look + WASD ----
// One-shot actions (F, N, M, E, H) fire on keydown, ignoring auto-repeat. Every other
// key is just recorded as held in `keys` for movement to poll.
document.addEventListener('keydown', (e) => {
  const k = e.key.toLowerCase();
  if (k === 'f') { if (!e.repeat) toggleFly(); }
  else if (k === 'n') { if (!e.repeat) setNight(!env.isNight); }
  else if (k === 'm') { if (!e.repeat) setSound(!sound.on); }
  else if (k === 'e') { if (!e.repeat) interaction.tryInteract(); }
  else if (k === 'h') {
    if (e.repeat) return;
    if (!helpVisible()) showHelp();
    else { hideHelp(); if (!touch.enabled) lockPointer(); }
  }
  else keys[k] = true;
});
document.addEventListener('keyup', (e) => { keys[e.key.toLowerCase()] = false; });

document.addEventListener('mousedown', (e) => {
  if (touch.enabled || e.target.closest('#hud, #touch-ui, #overlay button')) return; // let buttons be clicked
  if (e.target.closest('#overlay')) hideHelp(); // clicking the help screen starts / resumes
  if (!isPointerLocked()) lockPointer();
});

// Mouse look: horizontal movement turns (yaw), vertical tilts (pitch). Moving the mouse
// right gives a positive movementX, but turning right is a negative rotation about Y
// (counter-clockwise is positive, seen from above), hence the minus signs.
document.addEventListener('mousemove', (e) => {
  if (!isPointerLocked()) return;
  const sens = 0.0022; // radians per pixel
  player.yaw -= e.movementX * sens;
  player.pitch -= e.movementY * sens;
  player.pitch = clampPitch(player.pitch);
});
