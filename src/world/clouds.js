import * as THREE from 'three';
import { scene } from '../core/scene.js';
import { WIND_DIR, windStrength } from '../core/layout.js';
import { FUJI_POS, FUJI_SUMMIT } from './fuji.js';

// ---- Clouds ----
// Low-poly clouds: clusters of flattened puffs, biggest in the middle. Every puff of
// every cloud shares ONE geometry; only the transform (position, rotation and a
// non-uniform scale that flattens and stretches it) differs per puff.
export const cloudMat = new THREE.MeshStandardMaterial({ color: 0xffffff, flatShading: true, roughness: 1, fog: false });
export const fujiCloudMat = cloudMat.clone(); // further away, so hazier
const cloudGeo = new THREE.IcosahedronGeometry(1, 1);
function makeCloud(size, stretch, material) {
  const g = new THREE.Group();
  const n = 5 + Math.floor(Math.random() * 4);
  for (let i = 0; i < n; i++) {
    const fromMiddle = Math.abs(i - (n - 1) / 2) / (n / 2);
    const r = size * (1 - 0.5 * fromMiddle) * (0.8 + Math.random() * 0.4);
    const puff = new THREE.Mesh(cloudGeo, material);
    puff.scale.set(r * stretch, r * 0.55, r);
    puff.position.set(
      (i - (n - 1) / 2) * size * 0.7 * stretch + (Math.random() - 0.5) * size * 0.4,
      Math.random() * size * 0.25,
      (Math.random() - 0.5) * size * 0.6,
    );
    g.add(puff);
  }
  scene.add(g);
  return g;
}
// Sky clouds drift with the wind and wrap around to the far side.
const CLOUD_FIELD_R = 380;
const skyClouds = Array.from({ length: 16 }, () => {
  const cloud = makeCloud(8 + Math.random() * 8, 1 + Math.random() * 0.6, cloudMat);
  const a = Math.random() * Math.PI * 2, d = 60 + Math.random() * 300;
  cloud.position.set(Math.cos(a) * d, 70 + Math.random() * 35, Math.sin(a) * d);
  cloud.rotation.y = Math.random() * Math.PI;
  return cloud;
});
// Fuji's cloud belt across its shoulder, and the lens-shaped cap cloud above the summit.
const fujiClouds = [];
{
  const toGarden = Math.atan2(-FUJI_POS.x, -FUJI_POS.z);
  // Either side of the face toward the garden, leaving the summit and snow in view.
  for (const off of [-1.15, -0.5, 0.55, 1.2]) {
    const a = toGarden + off;
    const cloud = makeCloud(7 + Math.random() * 3, 2.2, fujiCloudMat);
    cloud.position.set(FUJI_POS.x + Math.sin(a) * 40, 28 + Math.random() * 6, FUJI_POS.z + Math.cos(a) * 40);
    cloud.rotation.y = a + Math.PI / 2; // stretched along the mountain's flank
    cloud.userData.base = cloud.position.clone();
    cloud.userData.phase = Math.random() * Math.PI * 2;
    fujiClouds.push(cloud);
  }
  for (const [ry, sx, sz] of [[FUJI_SUMMIT + 9, 30, 26], [FUJI_SUMMIT + 12, 22, 19], [FUJI_SUMMIT + 14.5, 13, 11]]) {
    const lens = new THREE.Mesh(cloudGeo, fujiCloudMat);
    lens.scale.set(sx, 2.2, sz);
    lens.position.set(FUJI_POS.x, ry, FUJI_POS.z);
    scene.add(lens);
  }
}

export function updateClouds(dt, t) {
  const drift = (1.5 + windStrength(t) * 2) * dt;
  for (const c of skyClouds) {
    c.position.x += WIND_DIR.x * drift;
    c.position.z += WIND_DIR.y * drift;
    // Past the edge of the field downwind (the dot product with the wind direction is
    // positive): reappear on the far upwind side.
    if (Math.hypot(c.position.x, c.position.z) > CLOUD_FIELD_R &&
        c.position.x * WIND_DIR.x + c.position.z * WIND_DIR.y > 0) {
      c.position.x *= -0.95;
      c.position.z *= -0.95;
    }
  }
  for (const c of fujiClouds) { // the belt only sways slowly back and forth
    c.position.x = c.userData.base.x + Math.sin(t * 0.04 + c.userData.phase) * 6;
    c.position.z = c.userData.base.z + Math.cos(t * 0.03 + c.userData.phase) * 3;
  }
}
