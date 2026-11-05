import * as THREE from 'three';
import { scene } from '../core/scene.js';
import { cameraGroup } from '../core/camera.js';
import { TEA, WIND_DIR } from '../core/layout.js';
import { env } from '../core/state.js';
import { showToast } from '../ui/toast.js';

// ---- Rain ----
// The switch (setRain) and the fade (env.rainMix, eased like env.nightMix), plus the
// two things the rain itself draws: streaks falling round the player, and drops
// landing on the pond. Everything else that changes in the rain reads env.rainMix
// (or env.isRaining) on its own: the sky and light (dayNight.js), the sound
// (audio/ambience.js), the Gardener's umbrella, and the dog and cats, who shelter in
// the tea house.
//
// The streaks are one LineSegments: two vertices per drop, a short line along the way
// it falls, slanted by the wind. Like the stars, only a box of rain round the player
// exists. A drop that falls below the ground (or onto the tea house roof) starts
// again at the top, and one the player has walked away from is moved across the box
// to the side they're heading for, so the box seems to fill all the garden.
// It's only scenery, so it uses Math.random, not the seeded layout generator.
const RAIN_SECONDS = 3;        // length of the fade in and out
const BOX = 26;                // half-width of the box of rain round the player
const TOP = 20;                // height drops start from, above the player's feet
const FALL = 17;               // units/second
const STREAK = 0.05;           // seconds of fall each streak shows: its length is FALL × STREAK
const DRIFT = 3;               // sideways speed in the wind, units/second
const POND_DROPS = 50;         // drops a second landing on the pond, in full rain
// The tea house's roof reaches out past its walls; nothing falls under it.
const ROOF = { x: TEA.x, z: TEA.z, hx: 5.3, hz: 4.8, top: 6.8 };

const rainBtn = document.getElementById('rain');
export function setRain(on) {
  env.isRaining = on;
  rainBtn.innerHTML = `${on ? '🌤️ Clear' : '🌧️ Rain'} <kbd>R</kbd>`;
  showToast(on ? '🌧️ Rain' : '🌤️ Clear skies');
}

let drops, positions, lines, material, pond, ripples;
const DAY_COLOR = new THREE.Color(0xc4ccd6), NIGHT_COLOR = new THREE.Color(0x46505e);

// `rainRipples`: the pond's own pool of rings for raindrops (see world/ripples.js).
// Touch devices get fewer drops, like the grass.
export function initRain({ pond: p, rainRipples }, { density = 1 } = {}) {
  pond = p;
  ripples = rainRipples;
  rainBtn.addEventListener('click', () => setRain(!env.isRaining));
  const count = Math.round(1800 * density);
  drops = Array.from({ length: count }, () => ({ x: 0, y: 0, z: 0, speed: 0 }));
  positions = new Float32Array(count * 6);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  // Normal blending, dim and see-through: at night the bloom threshold is low, and
  // bright streaks would each grow a halo.
  material = new THREE.LineBasicMaterial({ color: DAY_COLOR.clone(), transparent: true, opacity: 0, depthWrite: false });
  lines = new THREE.LineSegments(geo, material);
  // The drops move every frame and follow the player, so the bounding sphere three
  // would test against the view is never right. Skip the test: always draw them.
  lines.frustumCulled = false;
  lines.visible = false;
  scene.add(lines);
  const p0 = cameraGroup.position;
  for (const d of drops) respawn(d, p0, Math.random() * TOP);
}

// Start a drop again at height `y` above the player's feet, somewhere in the box.
function respawn(d, p, y = TOP) {
  d.x = p.x + (Math.random() * 2 - 1) * BOX;
  d.z = p.z + (Math.random() * 2 - 1) * BOX;
  d.y = p.y - 2.6 + y;
  d.speed = FALL * (0.85 + Math.random() * 0.3);
}

const underRoof = (d) => d.y < ROOF.top && Math.abs(d.x - ROOF.x) < ROOF.hx && Math.abs(d.z - ROOF.z) < ROOF.hz;

export function updateRain(dt, t) {
  const target = env.isRaining ? 1 : 0, step = dt / RAIN_SECONDS;
  env.rainMix += Math.max(-step, Math.min(step, target - env.rainMix));
  const r = env.rainMix;
  lines.visible = r > 0.01;
  if (!lines.visible) return;
  material.opacity = 0.42 * r;
  material.color.lerpColors(DAY_COLOR, NIGHT_COLOR, env.nightMix);

  // The streaks. Every drop drifts with the wind as it falls; a streak runs from the
  // drop back up along that motion.
  const p = cameraGroup.position, wx = WIND_DIR.x * DRIFT, wz = WIND_DIR.y * DRIFT;
  // Fewer drops fall at the start and end of a shower: the rest are pushed out of sight.
  const shown = Math.floor(drops.length * r);
  for (let i = 0; i < drops.length; i++) {
    const d = drops[i];
    d.y -= d.speed * dt;
    d.x += wx * dt;
    d.z += wz * dt;
    if (d.y < 0 || underRoof(d)) respawn(d, p);
    // Keep the box round the player: wrap a drop that's left it to the far side.
    if (d.x - p.x > BOX) d.x -= 2 * BOX; else if (p.x - d.x > BOX) d.x += 2 * BOX;
    if (d.z - p.z > BOX) d.z -= 2 * BOX; else if (p.z - d.z > BOX) d.z += 2 * BOX;
    const o = i * 6, hide = i >= shown ? -1000 : 0;
    positions[o] = d.x; positions[o + 1] = d.y + hide; positions[o + 2] = d.z;
    positions[o + 3] = d.x - wx * STREAK; positions[o + 4] = d.y + d.speed * STREAK + hide; positions[o + 5] = d.z - wz * STREAK;
  }
  lines.geometry.attributes.position.needsUpdate = true;

  // Drops on the pond: small, short-lived rings scattered over the water. On average
  // POND_DROPS × dt land this frame; the fraction left over lands with that chance.
  let n = POND_DROPS * r * dt;
  const R = pond.radius - 0.4;
  for (; n > 0; n--) {
    if (n < 1 && Math.random() > n) break;
    // sqrt spreads them evenly over the disc's area, not bunched in the middle.
    const a = Math.random() * Math.PI * 2, d = Math.sqrt(Math.random()) * R;
    ripples.spawn(Math.cos(a) * d, Math.sin(a) * d, 0.22 + Math.random() * 0.3, 0.6 + Math.random() * 0.4);
  }
}
