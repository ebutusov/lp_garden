import { cameraGroup } from '../core/camera.js';
import { TEA } from '../core/layout.js';
import { env } from '../core/state.js';
import { POND_Z, POND_R, FALLS } from '../core/layout.js';
import { sound, audible } from './audio.js';
import { SFX } from './sfx.js';

// ---- Ambient sound: running water, the waterfall, birdsong by day, crickets by night, rain ----
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
  // Rain: the hiss outdoors, or the drumming on the roof inside the tea house, and
  // drops plinking into puddles all round, more often the harder it rains. Near the
  // pond the drops land in deeper water, so they ring lower.
  const rain = env.rainMix, inside = Math.abs(p.x - TEA.x) < 4 && Math.abs(p.z - TEA.z) < 3.5;
  sound.rainGain.gain.setTargetAtTime(0.13 * rain * (inside ? 0.25 : 1), now, 0.4);
  sound.roofGain.gain.setTargetAtTime(inside ? 0.22 * rain : 0, now, 0.4);
  if (now >= sound.nextDrip) {
    if (rain > 0.1) SFX.drip((0.3 + Math.random() * 0.7) * rain * (inside ? 0.35 : 1), edge < 4 ? 0.6 : 1);
    sound.nextDrip = now + (0.04 + Math.random() * 0.22) / Math.max(rain, 0.1);
  }
  // Birds and crickets go quiet in the rain.
  const day = (1 - env.nightMix) * (1 - rain);
  if (now >= sound.nextBird) {
    if (day > 0.2) SFX.bird(day);
    sound.nextBird = now + 1.5 + Math.random() * 4;
  }
  if (now >= sound.nextCricket) {
    if (env.nightMix * (1 - rain) > 0.2) SFX.cricket(env.nightMix * (1 - rain));
    sound.nextCricket = now + 0.3 + Math.random() * 0.9;
  }
}
