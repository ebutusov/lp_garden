import * as THREE from 'three';
import { scene } from '../core/scene.js';
import { dotTex } from '../core/textures.js';
import { POND_Z, WATER_LEVEL, WIND_DIR, windStrength, inPond } from '../core/layout.js';
import { cherryCrowns } from '../world/trees.js';
import { spawnRipple } from '../world/ripples.js';

// ---- Falling cherry petals ----
// Petals drop from the cherry crowns and drift with the wind.
// A particle system: 300 petals drawn as ONE THREE.Points object. Each petal is one
// vertex whose position the CPU updates every frame, so 300 petals cost a single
// draw call. (Separate meshes would cost 300.)
const petalCount = 300;
const petalGeo = new THREE.BufferGeometry();
const petalPos = new Float32Array(petalCount * 3);
const pColors = new Float32Array(petalCount * 3);
const palette = [new THREE.Color(0xffc4d4), new THREE.Color(0xffa9c0), new THREE.Color(0xfbe0e8)];
const petalData = [];
// Recycle a petal that reached the ground: put it back up in a random cherry crown.
// (anyHeight scatters the very first batch at all heights so the air isn't empty at start.)
function respawnPetal(i, anyHeight = false) {
  if (!cherryCrowns.length) { petalPos[i * 3 + 1] = -100; return; }
  const c = cherryCrowns[Math.floor(Math.random() * cherryCrowns.length)];
  const a = Math.random() * Math.PI * 2, r = Math.random() * c.r;
  petalPos[i * 3] = c.x + Math.cos(a) * r;
  petalPos[i * 3 + 1] = anyHeight ? Math.random() * c.y : c.y + (Math.random() - 0.3) * c.r * 0.6;
  petalPos[i * 3 + 2] = c.z + Math.sin(a) * r;
}
for (let i = 0; i < petalCount; i++) {
  respawnPetal(i, true);
  const col = palette[i % palette.length];
  pColors[i * 3] = col.r; pColors[i * 3 + 1] = col.g; pColors[i * 3 + 2] = col.b;
  petalData.push({
    speed: 0.7 + Math.random() * 0.7, // units/sec
    sway: Math.random() * Math.PI * 2,
    swaySpeed: 0.5 + Math.random() * 1.5,
  });
}
petalGeo.setAttribute('position', new THREE.BufferAttribute(petalPos, 3));
petalGeo.setAttribute('color', new THREE.BufferAttribute(pColors, 3));
// Transparent things must normally be drawn back to front, which three only does per
// object, not per point. alphaTest instead discards nearly transparent pixels
// outright, so each petal is a hard-edged disc that never needs sorting.
// The material's colour multiplies the per-vertex colours; dayNight.js dims it at night.
export const petalMat = new THREE.PointsMaterial({
  size: 0.32, vertexColors: true, transparent: true, opacity: 0.95,
  map: dotTex, alphaTest: 0.3, // hard-edged discs: no sorting artefacts between petals
});
const petalsMesh = new THREE.Points(petalGeo, petalMat);
petalsMesh.frustumCulled = false; // positions change every frame
scene.add(petalsMesh);

export function updatePetals(dt, t) {
  const w = windStrength(t) * 1.2;
  for (let i = 0; i < petalCount; i++) {
    const pd = petalData[i];
    const sway = Math.sin(t * pd.swaySpeed + pd.sway) * 0.6;
    petalPos[i * 3] += (sway + WIND_DIR.x * w) * dt;
    petalPos[i * 3 + 2] += WIND_DIR.y * w * dt;
    petalPos[i * 3 + 1] -= pd.speed * dt;
    const x = petalPos[i * 3], z = petalPos[i * 3 + 2];
    const wet = inPond(x, z);
    if (petalPos[i * 3 + 1] < (wet ? WATER_LEVEL : 0.02)) {
      if (wet && Math.random() < 0.3) spawnRipple(x, z - POND_Z, 0.35, 1);
      respawnPetal(i);
    }
  }
  petalGeo.attributes.position.needsUpdate = true;
}
