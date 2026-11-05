import * as THREE from 'three';
import { scene } from '../core/scene.js';
import { dotTex } from '../core/textures.js';
import { POND_Z, TEA, ZEN } from '../core/layout.js';
import { env } from '../core/state.js';

// ---- Fireflies (night only) ----
// Another point particle system. Each firefly hovers around a home spot on a
// Lissajous-like path: independent sine waves on x, y and z at different frequencies.
const FIREFLY_COUNT = 70;
const fireflyGeo = new THREE.BufferGeometry();
const flyPos = new Float32Array(FIREFLY_COUNT * 3);
const flyCol = new Float32Array(FIREFLY_COUNT * 3);
const fireflies = [];
for (let i = 0; i < FIREFLY_COUNT; i++) {
  let x, z;
  if (i < 46) {          // mostly along the pond
    const a = Math.random() * Math.PI * 2, r = 9 + Math.random() * 6;
    x = Math.cos(a) * r; z = POND_Z + Math.sin(a) * r;
  } else if (i < 58) {   // outside the tea house
    x = TEA.x + 5 + Math.random() * 4; z = TEA.z + (Math.random() - 0.5) * 8;
  } else {               // by the zen garden
    x = ZEN.x + (Math.random() - 0.5) * ZEN.w; z = ZEN.z + (Math.random() < 0.5 ? -1 : 1) * (ZEN.d / 2 + 1);
  }
  fireflies.push({
    x, z, y: 0.4 + Math.random() * 1.8,
    f: [0.2 + Math.random() * 0.3, 0.3 + Math.random() * 0.4, 0.2 + Math.random() * 0.3, 0.6 + Math.random() * 1.2],
    p: [Math.random() * 6.3, Math.random() * 6.3, Math.random() * 6.3, Math.random() * 6.3],
  });
}
fireflyGeo.setAttribute('position', new THREE.BufferAttribute(flyPos, 3));
fireflyGeo.setAttribute('color', new THREE.BufferAttribute(flyCol, 3));
// Additive blending adds each point's colour to what's behind it instead of covering
// it, so overlapping glows brighten like real light and black means "invisible".
// That's why a firefly fades out by darkening its colour rather than its opacity.
const fireflyPoints = new THREE.Points(fireflyGeo, new THREE.PointsMaterial({
  size: 0.45, vertexColors: true, transparent: true, depthWrite: false,
  blending: THREE.AdditiveBlending, map: dotTex,
}));
fireflyPoints.frustumCulled = false;
fireflyPoints.visible = false;
scene.add(fireflyPoints);

export function updateFireflies(t) {
  // They don't come out in the rain.
  const nightMix = env.nightMix * (1 - env.rainMix);
  // Invisible objects are skipped entirely, both drawing and this update.
  fireflyPoints.visible = nightMix > 0.01;
  if (!fireflyPoints.visible) return;
  fireflies.forEach((ff, i) => {
    flyPos[i * 3] = ff.x + Math.sin(t * ff.f[0] + ff.p[0]) * 1.5;
    flyPos[i * 3 + 1] = ff.y + Math.sin(t * ff.f[1] + ff.p[1]) * 0.5;
    flyPos[i * 3 + 2] = ff.z + Math.cos(t * ff.f[2] + ff.p[2]) * 1.5;
    // slow blink: mostly dark, with soft pulses (cubing a sine sharpens its peaks)
    const b = Math.pow(Math.max(0, Math.sin(t * ff.f[3] + ff.p[3])), 3) * nightMix;
    flyCol[i * 3] = 0.75 * b; flyCol[i * 3 + 1] = 1.0 * b; flyCol[i * 3 + 2] = 0.35 * b;
  });
  fireflyGeo.attributes.position.needsUpdate = true;
  fireflyGeo.attributes.color.needsUpdate = true;
}
