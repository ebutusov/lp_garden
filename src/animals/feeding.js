import * as THREE from 'three';
import { M } from '../core/materials.js';
import { WATER_LEVEL, waterSurface } from '../core/layout.js';
import { cameraGroup } from '../core/camera.js';
import { player } from '../core/state.js';
import { SFX } from '../audio/sfx.js';
import { Feature } from '../world/feature.js';

// ---- Koi feeding ----
// Food pellets float on the water until a koi eats them. The group sits inside the
// pond's group, so pellet positions are pond-local, like the koi's.
const pelletGeo = new THREE.SphereGeometry(0.07, 5, 4);
const PELLET_LIFE = 25; // uneaten food eventually sinks

export class Feeding extends Feature {
  constructor(ctx, { pond, ripples }) {
    super(ctx, { parent: pond.group });
    this.pond = pond;
    this.ripples = ripples;
    this.pellets = [];
    this.cooldown = 0;
  }

  // Where food would land if dropped now (pond-local), or null if the player isn't by the pond.
  target() {
    if (player.flyMode) return null;
    const p = cameraGroup.position, c = this.pond.group.position, R = this.pond.radius;
    if (Math.hypot(p.x - c.x, p.z - c.z) - R > 4) return null;
    // ~3 units ahead of the player, kept inside the water. With yaw measured from -Z,
    // the facing direction on the ground is (-sin yaw, -cos yaw).
    let lx = p.x - Math.sin(player.yaw) * 3 - c.x;
    let lz = p.z - Math.cos(player.yaw) * 3 - c.z;
    const d = Math.hypot(lx, lz), max = R - 1.2;
    if (d > max) { lx *= max / d; lz *= max / d; }
    return { lx, lz };
  }

  // Scatter a handful of pellets ahead of the player. False if there's nowhere to drop
  // them, or the last handful was too recent.
  tryFeed() {
    if (this.cooldown > 0) return false;
    const target = this.target();
    if (!target) return false;
    for (let i = 0; i < 7; i++) {
      const a = Math.random() * Math.PI * 2, r = Math.random() * 0.9;
      const x = target.lx + Math.cos(a) * r, z = target.lz + Math.sin(a) * r;
      const mesh = this.mesh(pelletGeo, M.pellet, x, WATER_LEVEL, z);
      this.pellets.push({ mesh, x, z, age: 0 });
      this.ripples.spawn(x, z, 0.4, 1);
    }
    SFX.plop(1);
    this.cooldown = 2;
    return true;
  }

  nearest(x, z) {
    let best = null, bestD = Infinity;
    for (const p of this.pellets) {
      const d = Math.hypot(p.x - x, p.z - z);
      if (d < bestD) { best = p; bestD = d; }
    }
    return best;
  }

  remove(p) {
    this.group.remove(p.mesh);
    this.pellets.splice(this.pellets.indexOf(p), 1);
  }

  update(dt, t) {
    for (const p of [...this.pellets]) {
      p.age += dt;
      p.mesh.position.y = waterSurface(t) + 0.02; // bob with the water
      if (p.age > PELLET_LIFE) this.remove(p);
    }
    this.cooldown = Math.max(0, this.cooldown - dt);
  }
}
