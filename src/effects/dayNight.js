import * as THREE from 'three';
import { scene, fog } from '../core/scene.js';
import { bloom } from '../core/renderer.js';
import { hemi, sun } from '../core/lights.js';
import { M } from '../core/materials.js';
import { PATH_PAPER_GLOW } from '../core/layout.js';
import { env } from '../core/state.js';
import { Lantern } from '../world/lanterns.js';
import { petalMat } from './petals.js';
import { showToast } from '../ui/toast.js';

// ---- Day / night ----
// Everything that changes is blended between these two looks by `nightMix` (0 = day, 1 = night).
// Describing both ends as data and interpolating ("lerp": a + (b − a)·m) between them
// makes the transition a smooth fade for free, and keeps the look easy to tune.
const DAY = {
  skyTop: new THREE.Color(0x7fb6e0), horizon: new THREE.Color(0xd6e7ee),
  hemiSky: new THREE.Color(0xbfe0ff), hemiGround: new THREE.Color(0x7a8f57), hemi: 0.85,
  sun: new THREE.Color(0xfff4e0), sunIntensity: 1.15,
  lantern: Lantern.BASE_INTENSITY, paperGlow: 0.6, shojiGlow: 0, teaLight: 0,
  petals: new THREE.Color(0xffffff),
  bloomStrength: 0.12, bloomThreshold: 1.1, // by day only truly over-bright light blooms
};
const NIGHT = {
  skyTop: new THREE.Color(0x03060f), horizon: new THREE.Color(0x16213a),
  hemiSky: new THREE.Color(0x34457a), hemiGround: new THREE.Color(0x1a2219), hemi: 0.35,
  sun: new THREE.Color(0x9fb4ff), sunIntensity: 0.35, // the sun light doubles as moonlight
  lantern: Lantern.BASE_INTENSITY * 3, paperGlow: 1.8, shojiGlow: 0.45, teaLight: 4,
  petals: new THREE.Color(0x5a5470), // unlit points would otherwise glow at night
  bloomStrength: 0.85, bloomThreshold: 0.55,
};
const DAY_NIGHT_SECONDS = 1.5; // length of the fade
const WHITE = new THREE.Color(0xffffff);

const dayNightBtn = document.getElementById('daynight');
export function setNight(on) {
  env.isNight = on;
  dayNightBtn.innerHTML = `${on ? '☀️ Day' : '🌙 Night'} <kbd>N</kbd>`;
  showToast(on ? '🌙 Night' : '☀️ Day');
}

// The features whose look changes, handed over by main.js.
let sky, fuji, clouds, lanterns, teaHouse;
export function initDayNight(features) {
  ({ sky, fuji, clouds, lanterns, teaHouse } = features);
  dayNightBtn.addEventListener('click', () => setNight(!env.isNight));
}

// Far things fade toward the horizon colour (aerial perspective, a cheap stand-in for
// fog on objects beyond the fog's range): lit colour scaled down, horizon added as
// glow. `selfGlow` adds some of the material's own brightness (clouds glow white by day).
function applyHaze(material, amount, horizon, selfGlow = 0) {
  material.color.setScalar(1 - amount);
  material.emissive.copy(horizon).multiplyScalar(amount).addScalar(selfGlow);
}

export function updateDayNight(dt) {
  // Move nightMix toward its target at a fixed rate, so the fade takes DAY_NIGHT_SECONDS.
  const target = env.isNight ? 1 : 0;
  const step = dt / DAY_NIGHT_SECONDS;
  env.nightMix += Math.max(-step, Math.min(step, target - env.nightMix));
  const m = env.nightMix;
  const lerp = (a, b) => a + (b - a) * m;

  const horizon = sky.uniforms.horizon.value;
  horizon.lerpColors(DAY.horizon, NIGHT.horizon, m);
  sky.uniforms.top.value.lerpColors(DAY.skyTop, NIGHT.skyTop, m);
  fog.color.copy(horizon);
  scene.background.copy(horizon);
  applyHaze(fuji.material, 0.35, horizon);
  applyHaze(clouds.material, 0.2, horizon, 0.3 * (1 - m));
  applyHaze(clouds.fujiMaterial, 0.3, horizon, 0.3 * (1 - m));
  // Unlit sprites: bright mist by day, only a faint sheen at night.
  fuji.mistMaterial.color.copy(horizon).lerp(WHITE, lerp(0.3, 0.05));

  hemi.color.lerpColors(DAY.hemiSky, NIGHT.hemiSky, m);
  hemi.groundColor.lerpColors(DAY.hemiGround, NIGHT.hemiGround, m);
  hemi.intensity = lerp(DAY.hemi, NIGHT.hemi);
  sun.color.lerpColors(DAY.sun, NIGHT.sun, m);
  sun.intensity = lerp(DAY.sunIntensity, NIGHT.sunIntensity);
  lanterns.brightness = lerp(DAY.lantern, NIGHT.lantern);
  // Shared materials: one assignment changes every lantern's paper at once.
  M.paper.emissiveIntensity = lerp(DAY.paperGlow, NIGHT.paperGlow);
  M.pathPaper.emissiveIntensity = M.paper.emissiveIntensity * PATH_PAPER_GLOW;
  M.shoji.emissiveIntensity = lerp(DAY.shojiGlow, NIGHT.shojiGlow);
  teaHouse.light.intensity = lerp(DAY.teaLight, NIGHT.teaLight);
  petalMat.color.lerpColors(DAY.petals, NIGHT.petals, m);
  // At night the bloom threshold drops, so lanterns and fireflies halo.
  bloom.strength = lerp(DAY.bloomStrength, NIGHT.bloomStrength);
  bloom.threshold = lerp(DAY.bloomThreshold, NIGHT.bloomThreshold);

  sky.starMat.opacity = m;
  sky.moonMat.opacity = m;
  sky.stars.visible = sky.moon.visible = m > 0.001;
}
