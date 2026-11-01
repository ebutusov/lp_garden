import * as THREE from 'three';
import { waterSurface } from '../core/layout.js';
import { Feature } from './feature.js';

// ---- Ripples: expanding rings on the water (pond-local coordinates) ----
// An object pool: a fixed set of ring meshes is created once and reused, oldest first.
// Creating and destroying meshes every time something touches the water would
// allocate GPU buffers constantly and stutter on garbage collection.
const RIPPLE_COUNT = 40;
// All rings share one unit-radius ring geometry; each is sized with its scale.
const rippleGeo = new THREE.RingGeometry(0.92, 1, 32).rotateX(-Math.PI / 2);

export class Ripples extends Feature {
  constructor(ctx, { pond }) {
    super(ctx, { parent: pond.group }); // inside the pond's group, so positions are pond-local
    this.pondR = pond.radius;
    this.rings = [];
    this.next = 0;
    for (let i = 0; i < RIPPLE_COUNT; i++) {
      // Each ring needs its own material, because each fades at its own pace.
      const mesh = this.mesh(rippleGeo, new THREE.MeshBasicMaterial({
        color: 0xffffff, transparent: true, opacity: 0, depthWrite: false,
      }));
      mesh.visible = false;
      this.rings.push({ mesh, age: 0, life: 1, size: 1 });
    }
  }

  spawn(lx, lz, size = 1, life = 1.6) {
    const d = Math.hypot(lx, lz), max = this.pondR - 0.3;
    if (d > max) { lx *= max / d; lz *= max / d; }
    const r = this.rings[this.next]; // oldest ring gets reused
    this.next = (this.next + 1) % RIPPLE_COUNT;
    Object.assign(r, { age: 0, life, size });
    r.mesh.position.set(lx, 0, lz);
    r.mesh.visible = true;
  }

  update(dt, t) {
    const y = waterSurface(t) + 0.045; // just above the wave crests, so they don't hide it
    for (const r of this.rings) {
      if (!r.mesh.visible) continue;
      r.age += dt;
      const k = r.age / r.life; // 0 → 1 over the ring's life
      if (k >= 1) { r.mesh.visible = false; continue; }
      r.mesh.scale.setScalar(r.size * (0.15 + k));
      r.mesh.position.y = y;
      r.mesh.material.opacity = 0.5 * (1 - k) * (1 - k); // squared: fades fast, then lingers
    }
  }
}
