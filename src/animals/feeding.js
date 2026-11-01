import * as THREE from 'three';
import { M } from '../core/materials.js';
import { POND_Z, POND_R, WATER_LEVEL, waterSurface } from '../core/layout.js';
import { cameraGroup } from '../core/camera.js';
import { player } from '../core/state.js';
import { pondGroup } from '../world/pond.js';
import { spawnRipple } from '../world/ripples.js';
import { SFX } from '../audio/sfx.js';

// ---- Koi feeding ----
// Food pellets float on the water (pond-local coordinates) until a koi eats them.
export const pellets = [];
const pelletGeo = new THREE.SphereGeometry(0.07, 5, 4);
let feedCooldown = 0;

// Where food would land if dropped now (pond-local), or null if the player isn't by the pond.
export function feedTarget() {
  if (player.flyMode) return null;
  const p = cameraGroup.position;
  if (Math.hypot(p.x, p.z - POND_Z) - POND_R > 4) return null;
  // ~3 units ahead of the player, kept inside the water. With yaw measured from -Z,
  // the facing direction on the ground is (-sin yaw, -cos yaw).
  let lx = p.x - Math.sin(player.yaw) * 3;
  let lz = p.z - Math.cos(player.yaw) * 3 - POND_Z;
  const d = Math.hypot(lx, lz), max = POND_R - 1.2;
  if (d > max) { lx *= max / d; lz *= max / d; }
  return { lx, lz };
}
export function tryFeed() {
  if (feedCooldown > 0) return false;
  const target = feedTarget();
  if (!target) return false;
  for (let i = 0; i < 7; i++) {
    const a = Math.random() * Math.PI * 2, r = Math.random() * 0.9;
    const x = target.lx + Math.cos(a) * r, z = target.lz + Math.sin(a) * r;
    const mesh = new THREE.Mesh(pelletGeo, M.pellet);
    mesh.position.set(x, WATER_LEVEL, z);
    pondGroup.add(mesh);
    pellets.push({ mesh, x, z, age: 0 });
    spawnRipple(x, z, 0.4, 1);
  }
  SFX.plop(1);
  feedCooldown = 2;
  return true;
}
export function nearestPellet(x, z) {
  let best = null, bestD = Infinity;
  for (const p of pellets) {
    const d = Math.hypot(p.x - x, p.z - z);
    if (d < bestD) { best = p; bestD = d; }
  }
  return best;
}
export function removePellet(p) {
  pondGroup.remove(p.mesh);
  pellets.splice(pellets.indexOf(p), 1);
}
export function updatePellets(dt, t) {
  for (const p of [...pellets]) {
    p.age += dt;
    p.mesh.position.y = waterSurface(t) + 0.02; // bob with the water
    if (p.age > 25) removePellet(p); // uneaten food eventually sinks
  }
  feedCooldown = Math.max(0, feedCooldown - dt);
}
