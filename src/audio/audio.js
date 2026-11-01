import { showToast } from '../ui/toast.js';

// ---- Sound (synthesised with Web Audio; off until the player turns it on) ----
// There are no sound files: every sound is built from two raw ingredients, shaped by
// filters and volume envelopes.
//  - Noise (random samples) through a filter gives splashes, rustles and footsteps.
//  - Oscillators (pure tones) sliding in pitch give chirps, knocks and meows.
// Web Audio connects "nodes" into a graph: source → filter → gain → … → speakers.
// Browsers only allow an AudioContext to start after a user gesture, which is one
// reason sound starts switched off.
export const sound = { on: false, ctx: null, master: null, noise: null, waterGain: null, nextBird: 0, nextCricket: 0 };
const soundBtn = document.getElementById('sound');

function initAudio() {
  const ctx = new (window.AudioContext || window.webkitAudioContext)();
  const master = ctx.createGain();
  master.gain.value = 0.8;
  master.connect(ctx.destination);
  // Two seconds of white noise, generated once and reused by every noisy sound.
  const noise = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
  const data = noise.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  // running water: looped, low-passed noise whose volume follows distance to the pond
  const src = ctx.createBufferSource();
  src.buffer = noise; src.loop = true;
  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass'; lp.frequency.value = 650;
  const waterGain = ctx.createGain();
  waterGain.gain.value = 0;
  src.connect(lp).connect(waterGain).connect(master);
  src.start();
  Object.assign(sound, { ctx, master, noise, waterGain });
}
export function setSound(on) {
  sound.on = on;
  if (on && !sound.ctx) initAudio();
  if (sound.ctx) (on ? sound.ctx.resume() : sound.ctx.suspend());
  soundBtn.innerHTML = `${on ? '🔊 Sound on' : '🔇 Sound off'} <kbd>M</kbd>`;
  showToast(on ? '🔊 Sound on' : '🔇 Sound off');
}
soundBtn.addEventListener('click', () => setSound(!sound.on));
export const audible = () => sound.on && sound.ctx && sound.ctx.state === 'running';

// Filtered noise burst with a quick attack and exponential decay.
// The gain "envelope" is scheduled ahead on the audio clock, so timing is sample-exact
// regardless of frame rate. Exponential ramps can't reach 0, hence 0.0001.
export function noiseBurst({ type = 'bandpass', freq = 1000, q = 1, gain = 0.2, dur = 0.15, attack = 0.004, delay = 0 }) {
  const { ctx, noise, master } = sound;
  const when = ctx.currentTime + delay;
  const src = ctx.createBufferSource();
  src.buffer = noise;
  const f = ctx.createBiquadFilter();
  f.type = type; f.frequency.value = freq; f.Q.value = q;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, when);
  g.gain.exponentialRampToValueAtTime(gain, when + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, when + dur);
  src.connect(f).connect(g).connect(master);
  src.start(when, Math.random() * 1.5); // start at a random point so bursts differ
  src.stop(when + dur + 0.05);
}
// Short pitched blip, optionally sliding in pitch.
export function tone({ freq, to = freq, type = 'sine', gain = 0.1, dur = 0.1, attack = 0.005, delay = 0 }) {
  const { ctx, master } = sound;
  const when = ctx.currentTime + delay;
  const osc = ctx.createOscillator();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, when);
  osc.frequency.exponentialRampToValueAtTime(to, when + dur);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, when);
  g.gain.exponentialRampToValueAtTime(gain, when + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, when + dur);
  osc.connect(g).connect(master);
  osc.start(when);
  osc.stop(when + dur + 0.05);
}
