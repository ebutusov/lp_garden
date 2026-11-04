import { clamp } from '../core/random.js';
import { cameraGroup } from '../core/camera.js';
import { sound, audible, noiseBurst, tone } from './audio.js';

// ---- Sound effects ----
// Every SFX function must start with `if (!audible() || vol < 0.02) return;`: the
// audio context doesn't exist until sound is turned on, and very quiet sounds aren't
// worth scheduling.

// Volume falloff with distance from the player (linear, silent at maxD).
export const distVol = (x, z, maxD) =>
  clamp(1 - Math.hypot(x - cameraGroup.position.x, z - cameraGroup.position.z) / maxD, 0, 1);

export const SFX = {
  splash(vol = 1) {
    if (!audible() || vol < 0.02) return;
    noiseBurst({ freq: 700, q: 0.7, gain: 0.35 * vol, dur: 0.6, attack: 0.01 });
    noiseBurst({ type: 'highpass', freq: 2500, gain: 0.08 * vol, dur: 0.35 });
  },
  plop(vol = 1) {
    if (!audible() || vol < 0.02) return;
    tone({ freq: 520, to: 160, gain: 0.12 * vol, dur: 0.12 });
    noiseBurst({ freq: 1400, q: 1.5, gain: 0.04 * vol, dur: 0.08 });
  },
  clack(vol = 1) { // hollow bamboo knock, with a faint echo
    if (!audible() || vol < 0.02) return;
    tone({ freq: 880, to: 600, type: 'triangle', gain: 0.45 * vol, dur: 0.14, attack: 0.002 });
    noiseBurst({ freq: 2200, q: 2, gain: 0.25 * vol, dur: 0.06, attack: 0.002 });
    tone({ freq: 880, to: 600, type: 'triangle', gain: 0.08 * vol, dur: 0.12, attack: 0.002, delay: 0.22 });
  },
  step(surface) {
    if (!audible()) return;
    if (surface === 'wood') {
      tone({ freq: 160, to: 110, gain: 0.12, dur: 0.07 });
      noiseBurst({ freq: 900, gain: 0.05, dur: 0.05 });
    } else if (surface === 'gravel') {
      noiseBurst({ type: 'highpass', freq: 1800, gain: 0.07, dur: 0.12 });
      noiseBurst({ freq: 4000, q: 2, gain: 0.04, dur: 0.08, delay: 0.02 });
    } else if (surface === 'water') {
      noiseBurst({ freq: 600, q: 0.8, gain: 0.07, dur: 0.25, attack: 0.02 });
    } else {
      noiseBurst({ type: 'lowpass', freq: 500, gain: 0.08, dur: 0.09 });
    }
  },
  bird(vol = 1) {
    if (!audible() || vol < 0.02) return;
    const base = 2300 + Math.random() * 1600;
    const n = 2 + Math.floor(Math.random() * 3);
    for (let i = 0; i < n; i++) {
      tone({ freq: base, to: base * (1.25 + Math.random() * 0.3), gain: 0.04 * vol, dur: 0.07, delay: i * 0.12 });
    }
  },
  cricket(vol = 1) {
    if (!audible() || vol < 0.02) return;
    const f = 4100 + Math.random() * 500;
    for (let i = 0; i < 3; i++) tone({ freq: f, gain: 0.025 * vol, dur: 0.028, attack: 0.003, delay: i * 0.05 });
  },
  bark(vol = 1) { // a friendly "woof woof"
    if (!audible() || vol < 0.02) return;
    for (let i = 0; i < 2; i++) {
      tone({ freq: 480, to: 300, type: 'triangle', gain: 0.18 * vol, dur: 0.13, attack: 0.01, delay: i * 0.24 });
      noiseBurst({ freq: 850, q: 1.2, gain: 0.1 * vol, dur: 0.11, delay: i * 0.24 });
    }
  },
  caw(vol = 1) { // crow
    if (!audible() || vol < 0.02) return;
    for (let i = 0; i < 2; i++) {
      tone({ freq: 620, to: 470, type: 'sawtooth', gain: 0.05 * vol, dur: 0.25, attack: 0.02, delay: i * 0.35 });
      noiseBurst({ freq: 1200, q: 2, gain: 0.04 * vol, dur: 0.22, delay: i * 0.35 });
    }
  },
  flutter(vol = 1) { // wings on take-off
    if (!audible() || vol < 0.02) return;
    for (let i = 0; i < 4; i++) noiseBurst({ type: 'highpass', freq: 1500, gain: 0.05 * vol, dur: 0.04, delay: i * 0.035 });
  },
  meow(vol = 1) {
    if (!audible() || vol < 0.02) return;
    tone({ freq: 520, to: 820, type: 'triangle', gain: 0.09 * vol, dur: 0.18, attack: 0.03 });
    tone({ freq: 820, to: 480, type: 'triangle', gain: 0.09 * vol, dur: 0.3, delay: 0.16 });
    tone({ freq: 1040, to: 960, type: 'sine', gain: 0.025 * vol, dur: 0.4, attack: 0.03 }); // nasal overtone
  },
  purr(vol = 1) { // low rumble, pulsing ~25 times a second
    if (!audible() || vol < 0.02) return;
    const { ctx, noise, master } = sound;
    const now = ctx.currentTime, DUR = 1.6;
    const src = ctx.createBufferSource();
    src.buffer = noise;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass'; lp.frequency.value = 220;
    const amp = ctx.createGain();
    amp.gain.value = 0;
    // An LFO (low-frequency oscillator) wired into a gain *parameter* modulates the
    // volume 25 times a second: the pulsing of a purr.
    const lfo = ctx.createOscillator();
    lfo.type = 'triangle'; lfo.frequency.value = 25;
    const depth = ctx.createGain();
    depth.gain.value = 0.25 * vol;
    lfo.connect(depth).connect(amp.gain);
    const env = ctx.createGain();
    env.gain.setValueAtTime(0.0001, now);
    env.gain.exponentialRampToValueAtTime(1, now + 0.2);
    env.gain.exponentialRampToValueAtTime(0.0001, now + DUR);
    src.connect(lp).connect(amp).connect(env).connect(master);
    src.start(now); lfo.start(now);
    src.stop(now + DUR + 0.05); lfo.stop(now + DUR + 0.05);
  },
  rake(vol = 1) { // the Gardener's rake drawn through gravel: a dry, grainy scrape
    if (!audible() || vol < 0.02) return;
    noiseBurst({ type: 'highpass', freq: 2600, gain: 0.05 * vol, dur: 0.7, attack: 0.15 });
    noiseBurst({ freq: 900, q: 0.8, gain: 0.03 * vol, dur: 0.6, attack: 0.12 });
  },
  sip(vol = 1) { // a quiet slurp of tea
    if (!audible() || vol < 0.02) return;
    noiseBurst({ freq: 1800, q: 3, gain: 0.05 * vol, dur: 0.35, attack: 0.08 });
    tone({ freq: 300, to: 220, gain: 0.03 * vol, dur: 0.2, delay: 0.3 }); // the swallow
  },
  munch(vol = 1) { // a crunch of kibble
    if (!audible() || vol < 0.02) return;
    noiseBurst({ freq: 2400, q: 1.2, gain: 0.06 * vol, dur: 0.06, attack: 0.003 });
    noiseBurst({ freq: 1500, q: 1.5, gain: 0.04 * vol, dur: 0.05, attack: 0.003, delay: 0.09 });
  },
  lap(vol = 1) { // a lap of water: a short, wet click
    if (!audible() || vol < 0.02) return;
    noiseBurst({ freq: 1100, q: 5, gain: 0.05 * vol, dur: 0.07, attack: 0.005 });
    tone({ freq: 380, to: 520, gain: 0.015 * vol, dur: 0.05 });
  },
  kibble(vol = 1) { // dry food poured into a bowl: a rattle of little ticks
    if (!audible() || vol < 0.02) return;
    for (let i = 0; i < 14; i++) {
      noiseBurst({ type: 'highpass', freq: 3000 + Math.random() * 2000, gain: 0.04 * vol, dur: 0.03, attack: 0.002, delay: i * 0.06 + Math.random() * 0.04 });
    }
  },
  pour(vol = 1) { // water poured from the bucket
    if (!audible() || vol < 0.02) return;
    noiseBurst({ freq: 900, q: 0.9, gain: 0.07 * vol, dur: 1.4, attack: 0.25 });
    noiseBurst({ type: 'highpass', freq: 3500, gain: 0.02 * vol, dur: 1.2, attack: 0.3 });
  },
  yip(vol = 1) { // happy little yip when petted
    if (!audible() || vol < 0.02) return;
    tone({ freq: 700, to: 950, type: 'triangle', gain: 0.1 * vol, dur: 0.09 });
    tone({ freq: 750, to: 1000, type: 'triangle', gain: 0.08 * vol, dur: 0.08, delay: 0.13 });
  },
};
