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
  sun: new THREE.Color(0xfff4e0), sunIntensity: 1.15, waterGlint: 1,
  lantern: Lantern.BASE_INTENSITY, paperGlow: 0.6, shojiGlow: 0, teaLight: 0,
  petals: new THREE.Color(0xffffff),
  bloomStrength: 0.12, bloomThreshold: 1.1, // by day only truly over-bright light blooms
};
const NIGHT = {
  skyTop: new THREE.Color(0x03060f), horizon: new THREE.Color(0x16213a),
  hemiSky: new THREE.Color(0x34457a), hemiGround: new THREE.Color(0x1a2219), hemi: 0.35,
  sun: new THREE.Color(0x9fb4ff), sunIntensity: 0.35, // the sun light doubles as moonlight
  waterGlint: 0.12, // the low moon glints straight across the pond; tone it right down
  lantern: Lantern.BASE_INTENSITY * 2.2, paperGlow: 1.3, shojiGlow: 0.45, teaLight: 4,
  petals: new THREE.Color(0x5a5470), // unlit points would otherwise glow at night
  bloomStrength: 0.85, bloomThreshold: 0.55,
};
const DAY_NIGHT_SECONDS = 1.5; // length of the fade
const WHITE = new THREE.Color(0xffffff);
// The light the sky dome itself gives off round the sun and the moon (sky.js).
const SUN_GLOW = new THREE.Color(0.55, 0.45, 0.3);
const MOON_GLOW = new THREE.Color(0.1, 0.13, 0.22);

const dayNightBtn = document.getElementById('daynight');
export function setNight(on) {
  env.isNight = on;
  dayNightBtn.innerHTML = `${on ? '☀️ Day' : '🌙 Night'} <kbd>N</kbd>`;
  showToast(on ? '🌙 Night' : '☀️ Day');
}

// The features whose look changes, handed over by main.js.
let sky, fuji, mountains, clouds, lanterns, teaHouse, pond;
export function initDayNight(features) {
  ({ sky, fuji, mountains, clouds, lanterns, teaHouse, pond } = features);
  dayNightBtn.addEventListener('click', () => setNight(!env.isNight));
}

// Rain lays an overcast look over whichever of day or night it is: a grey sky and a
// lower, greyer horizon, dim diffuse light from the cloud instead of sunshine (so the
// shadows fade), and closer fog. It's two more tables, blended by nightMix like the
// others, and then the result is blended in by env.rainMix.
const RAIN_DAY = {
  skyTop: new THREE.Color(0x77818c), horizon: new THREE.Color(0x9ea7af),
  hemiSky: new THREE.Color(0xa9b2bc), hemi: 0.62,
};
const RAIN_NIGHT = {
  skyTop: new THREE.Color(0x05070a), horizon: new THREE.Color(0x12161d),
  hemiSky: new THREE.Color(0x2c3442), hemi: 0.3,
};
const RAIN = {
  sunIntensity: 0.2,       // of the clear-sky value: overcast light casts faint shadows
  fogNear: 14, fogFar: 85, // clear: 35 and 150 (scene.js)
  haze: 0.3,               // extra aerial-perspective fade on the mountains and Fuji
};
const FOG_NEAR = 35, FOG_FAR = 150;
const rainTop = new THREE.Color(), rainHorizon = new THREE.Color(), rainHemi = new THREE.Color();

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
  const m = env.nightMix, r = env.rainMix, clear = 1 - r;
  const lerp = (a, b) => a + (b - a) * m;

  // Sky colours: day → night, then → overcast by the rain.
  const horizon = sky.uniforms.horizon.value;
  horizon.lerpColors(DAY.horizon, NIGHT.horizon, m)
    .lerp(rainHorizon.lerpColors(RAIN_DAY.horizon, RAIN_NIGHT.horizon, m), r);
  sky.uniforms.top.value.lerpColors(DAY.skyTop, NIGHT.skyTop, m)
    .lerp(rainTop.lerpColors(RAIN_DAY.skyTop, RAIN_NIGHT.skyTop, m), r);
  fog.color.copy(horizon);
  fog.near = FOG_NEAR + (RAIN.fogNear - FOG_NEAR) * r;
  fog.far = FOG_FAR + (RAIN.fogFar - FOG_FAR) * r;
  scene.background.copy(horizon);
  // The distant things are hazier in the rain, nearly lost in it.
  const haze = RAIN.haze * r;
  applyHaze(fuji.material, 0.35 + haze, horizon);
  // The far range is hazier than Fuji, the foothills a little less so.
  applyHaze(mountains.materials.near, 0.45 + haze, horizon);
  applyHaze(mountains.materials.far, 0.6 + haze, horizon);
  // Rain clouds: no white glow, and dark grey (after applyHaze, which sets their
  // colour). They darken as they build up (clouds.cover, which changes more slowly
  // than the rain), so they're at their darkest when they're at their biggest.
  const cover = clouds.cover;
  applyHaze(clouds.material, 0.2, horizon, 0.3 * (1 - m) * (1 - cover));
  applyHaze(clouds.fujiMaterial, 0.3, horizon, 0.3 * (1 - m) * (1 - cover));
  clouds.material.color.multiplyScalar(1 - 0.7 * cover);
  clouds.material.emissive.multiplyScalar(1 - 0.5 * cover); // less of the bright horizon glow
  clouds.fujiMaterial.color.multiplyScalar(1 - 0.45 * cover);
  // Unlit sprites: bright mist by day, only a faint sheen at night.
  fuji.mistMaterial.color.copy(horizon).lerp(WHITE, lerp(0.3, 0.05) * clear);

  hemi.color.lerpColors(DAY.hemiSky, NIGHT.hemiSky, m)
    .lerp(rainHemi.lerpColors(RAIN_DAY.hemiSky, RAIN_NIGHT.hemiSky, m), r);
  hemi.groundColor.lerpColors(DAY.hemiGround, NIGHT.hemiGround, m);
  hemi.intensity = lerp(DAY.hemi, NIGHT.hemi) + (lerp(RAIN_DAY.hemi, RAIN_NIGHT.hemi) - lerp(DAY.hemi, NIGHT.hemi)) * r;
  sun.color.lerpColors(DAY.sun, NIGHT.sun, m);
  sun.intensity = lerp(DAY.sunIntensity, NIGHT.sunIntensity) * (1 - (1 - RAIN.sunIntensity) * r);
  pond.waterUniforms.uGlint.value = lerp(DAY.waterGlint, NIGHT.waterGlint) * clear;
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

  // The sun sets as the moon rises, each with its glow in the dome and its halo.
  // Rain clouds hide all of them, and the stars.
  const night = m * clear, day = (1 - m) * clear;
  sky.starMat.opacity = night;
  sky.moonMat.opacity = night;
  sky.moonHalo.material.opacity = 0.35 * night;
  sky.uniforms.moonGlow.value.copy(MOON_GLOW).multiplyScalar(night);
  sky.stars.visible = sky.moon.visible = sky.moonHalo.visible = night > 0.001;
  sky.sunMat.opacity = day;
  sky.sunHalo.material.opacity = 0.55 * day;
  sky.uniforms.sunGlow.value.copy(SUN_GLOW).multiplyScalar(day);
  sky.sun.visible = sky.sunHalo.visible = day > 0.001;
}
