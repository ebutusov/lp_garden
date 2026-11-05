import * as THREE from 'three';
import { WIND_DIR, windStrength } from '../core/layout.js';
import { env } from '../core/state.js';
import { Feature } from './feature.js';

// ---- Clouds ----
// Low-poly clouds: clusters of flattened puffs, biggest in the middle. Every puff of
// every cloud shares ONE geometry; only the transform (position, rotation and a
// non-uniform scale that flattens and stretches it) differs per puff.
const cloudGeo = new THREE.IcosahedronGeometry(1, 1);
// Sky clouds drift with the wind and wrap around to the far side.
const CLOUD_FIELD_R = 380;
// In the rain the sky clouds swell into a heavy, lower cover: `cover` eases from 0
// (fair weather) to 1 (rain) far more slowly than the rain itself fades in, so the
// clouds keep building after the first drops, and break up slowly once it's over.
const COVER_GROW = 15;    // seconds to build up to full cover
const COVER_CLEAR = 25;   // seconds to shrink back to fair-weather clouds
const RAIN_SPREAD = 2.8;  // how much wider and longer each cloud grows
const RAIN_SWELL = 1.6;   // ...and how much taller
const RAIN_DROP = 18;     // how much lower it hangs

// `fuji` is the mountain that wears the belt and cap clouds.
export class Clouds extends Feature {
  constructor(ctx, { fuji }) {
    super(ctx);
    const { position: foot, summit } = fuji;
    this.material = new THREE.MeshStandardMaterial({ color: 0xffffff, flatShading: true, roughness: 1, fog: false });
    this.fujiMaterial = this.material.clone(); // further away, so hazier
    this.cover = 0; // 0 fair weather … 1 rain cover; dayNight.js darkens the clouds by it

    this.skyClouds = Array.from({ length: 16 }, () => {
      const cloud = this.makeCloud(8 + Math.random() * 8, 1 + Math.random() * 0.6, this.material);
      const a = Math.random() * Math.PI * 2, d = 60 + Math.random() * 300;
      cloud.position.set(Math.cos(a) * d, 70 + Math.random() * 35, Math.sin(a) * d);
      cloud.rotation.y = Math.random() * Math.PI;
      cloud.userData.y = cloud.position.y; // its fair-weather height
      return cloud;
    });

    // Fuji's cloud belt across its shoulder, and the lens-shaped cap cloud above the summit.
    this.fujiClouds = [];
    const toGarden = Math.atan2(-foot.x, -foot.z);
    // Either side of the face toward the garden, leaving the summit and snow in view.
    for (const off of [-1.15, -0.5, 0.55, 1.2]) {
      const a = toGarden + off;
      const cloud = this.makeCloud(7 + Math.random() * 3, 2.2, this.fujiMaterial);
      cloud.position.set(foot.x + Math.sin(a) * 40, 28 + Math.random() * 6, foot.z + Math.cos(a) * 40);
      cloud.rotation.y = a + Math.PI / 2; // stretched along the mountain's flank
      cloud.userData.base = cloud.position.clone();
      cloud.userData.phase = Math.random() * Math.PI * 2;
      this.fujiClouds.push(cloud);
    }
    for (const [ry, sx, sz] of [[summit + 9, 30, 26], [summit + 12, 22, 19], [summit + 14.5, 13, 11]]) {
      this.mesh(cloudGeo, this.fujiMaterial, foot.x, ry, foot.z).scale.set(sx, 2.2, sz);
    }
  }

  makeCloud(size, stretch, material) {
    const g = new THREE.Group();
    const n = 5 + Math.floor(Math.random() * 4);
    for (let i = 0; i < n; i++) {
      const fromMiddle = Math.abs(i - (n - 1) / 2) / (n / 2);
      const r = size * (1 - 0.5 * fromMiddle) * (0.8 + Math.random() * 0.4);
      const puff = this.mesh(cloudGeo, material,
        (i - (n - 1) / 2) * size * 0.7 * stretch + (Math.random() - 0.5) * size * 0.4,
        Math.random() * size * 0.25,
        (Math.random() - 0.5) * size * 0.6,
        { parent: g });
      puff.scale.set(r * stretch, r * 0.55, r);
    }
    this.group.add(g);
    return g;
  }

  update(dt, t) {
    // Build up or clear the cover at its own slow pace, then ease it (smoothstep) so
    // the clouds start and finish growing gently rather than at a steady rate.
    const target = env.isRaining ? 1 : 0;
    const rate = dt / (target > this.cover ? COVER_GROW : COVER_CLEAR);
    this.cover += Math.max(-rate, Math.min(rate, target - this.cover));
    const k = this.cover * this.cover * (3 - 2 * this.cover);
    // A cloud is one group of puffs, so scaling the group scales the whole cloud
    // about its middle, puffs, gaps and all.
    const spread = 1 + (RAIN_SPREAD - 1) * k, swell = 1 + (RAIN_SWELL - 1) * k;
    const drift = (1.5 + windStrength(t) * 2) * dt;
    for (const c of this.skyClouds) {
      c.scale.set(spread, swell, spread);
      c.position.y = c.userData.y - RAIN_DROP * k;
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
    for (const c of this.fujiClouds) { // the belt only sways slowly back and forth
      c.position.x = c.userData.base.x + Math.sin(t * 0.04 + c.userData.phase) * 6;
      c.position.z = c.userData.base.z + Math.cos(t * 0.03 + c.userData.phase) * 3;
    }
  }
}
