import * as THREE from 'three';
import { M } from '../core/materials.js';
import { FENCE_R, FENCE_GAP, FENCE_H } from '../core/layout.js';
import { Feature } from './feature.js';

// ---- Bamboo fence around the garden, open at the torii ----
// Hundreds of identical posts and rails: a perfect case for InstancedMesh. It holds
// one geometry and one material plus a list of transform matrices, and the GPU draws
// every copy in a single draw call instead of one call per mesh.
class Fence extends Feature {
  constructor() {
    super();
    const gapA = Math.asin(FENCE_GAP / FENCE_R);
    const span = Math.PI * 2 - 2 * gapA;
    const n = Math.round(span / (3 / FENCE_R)); // a post about every 3 units
    // angle a measured from +Z, so a = 0 is the gateway in front of the torii
    const pt = (a) => new THREE.Vector3(FENCE_R * Math.sin(a), 0, FENCE_R * Math.cos(a));
    const RAILS = [0.5, 1.1, 1.6];
    const posts = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.11, 0.14, FENCE_H, 6), M.bambooD, n + 1);
    const rails = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.05, 0.05, 1, 5), M.bamboo, n * RAILS.length);
    // A throwaway Object3D is a convenient way to build each instance's matrix: set its
    // position/rotation/scale, call updateMatrix(), and copy the result.
    const o = new THREE.Object3D();
    const up = new THREE.Vector3(0, 1, 0), dir = new THREE.Vector3();
    let ri = 0;
    for (let i = 0; i <= n; i++) {
      const p = pt(gapA + span * (i / n));
      o.position.set(p.x, FENCE_H / 2, p.z);
      o.quaternion.identity(); o.scale.set(1, 1, 1);
      o.updateMatrix();
      posts.setMatrixAt(i, o.matrix);
      if (i === n) break;
      const q = pt(gapA + span * ((i + 1) / n));
      dir.subVectors(q, p);
      const len = dir.length();
      for (const y of RAILS) {
        // Each rail is a unit-length cylinder (standing along Y) placed midway between two
        // posts, rotated so Y points from one post to the next, and stretched to fit.
        // setFromUnitVectors builds the quaternion that turns one direction into another.
        o.position.set((p.x + q.x) / 2, y, (p.z + q.z) / 2);
        o.quaternion.setFromUnitVectors(up, dir.clone().normalize());
        o.scale.set(1, len, 1);
        o.updateMatrix();
        rails.setMatrixAt(ri++, o.matrix);
      }
    }
    posts.castShadow = true;
    this.group.add(posts, rails);
    for (const a of [gapA, -gapA]) { // sturdier gate posts
      const p = pt(a);
      this.mesh(new THREE.CylinderGeometry(0.2, 0.24, 2.6, 8), M.darkWood, p.x, 1.3, p.z, { cast: true });
    }
  }

  // Ten bird perches at random spots along the top rail, away from the gateway. The
  // fence never moves, so these are plain world positions (no parent).
  perches() {
    const gapA = Math.asin(FENCE_GAP / FENCE_R);
    return Array.from({ length: 10 }, () => {
      const a = gapA + 0.1 + (Math.PI * 2 - 2 * gapA - 0.2) * Math.random();
      return { parent: null, local: new THREE.Vector3(FENCE_R * Math.sin(a), 1.65, FENCE_R * Math.cos(a)), kind: 'fence' };
    });
  }
}
export const fence = new Fence();
