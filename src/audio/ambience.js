import { cameraGroup } from '../core/camera.js';
import { env } from '../core/state.js';
import { POND_Z, POND_R, FALLS } from '../core/layout.js';
import { sound, audible } from './audio.js';
import { SFX } from './sfx.js';

// ---- Ambient sound: running water, the waterfall, birdsong by day, crickets by night ----
export function updateAudio() {
  if (!audible()) return;
  const now = sound.ctx.currentTime;
  const p = cameraGroup.position;
  const edge = Math.max(0, Math.hypot(p.x, p.z - POND_Z) - POND_R);
  // setTargetAtTime glides the volume toward the target, avoiding clicks from sudden jumps.
  sound.waterGain.gain.setTargetAtTime(0.16 * Math.max(0, 1 - edge / 35), now, 0.3);
  // The falls: squared falloff, so it's a roar close by and a murmur across the garden.
  const near = Math.max(0, 1 - Math.hypot(p.x - FALLS.x, p.z - FALLS.z) / 40);
  sound.fallsGain.gain.setTargetAtTime(0.2 * near * near, now, 0.3);
  const day = 1 - env.nightMix;
  if (now >= sound.nextBird) {
    if (day > 0.2) SFX.bird(day);
    sound.nextBird = now + 1.5 + Math.random() * 4;
  }
  if (now >= sound.nextCricket) {
    if (env.nightMix > 0.2) SFX.cricket(env.nightMix);
    sound.nextCricket = now + 0.3 + Math.random() * 0.9;
  }
}
