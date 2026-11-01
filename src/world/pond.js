import * as THREE from 'three';
import { M, mat } from '../core/materials.js';
import { rand } from '../core/random.js';
import { POND_Z, POND_R, WATER_LEVEL, waterSurface } from '../core/layout.js';
import { Feature } from './feature.js';
import { makeWaterMaterial, makeWaterGeometry, addMirror } from './water.js';

// ---- Pond with water ----
// Everything in the pond lives in its group, centred on the pond, so its parts (and
// the koi, ripples and food pellets) use simple pond-local coordinates: (0, 0) is the
// middle of the pond. World z = local z + POND_Z.
class Pond extends Feature {
  constructor() {
    super(0, POND_Z);
    // stone rim around the hole in the ground. A torus is a ring (doughnut); lying it flat
    // hides the seam between the ground's hole and the water.
    this.mesh(new THREE.TorusGeometry(POND_R + 0.2, 0.6, 6, 28), M.stoneD, 0, -0.05, 0, { receive: true })
      .rotation.x = -Math.PI / 2;

    // inner wall of the pond, so the hole doesn't look into the void. An open-ended
    // cylinder (no caps) drawn BackSide: from inside the pond you see its inner face.
    this.mesh(
      new THREE.CylinderGeometry(POND_R, POND_R, 0.9, 28, 1, true),
      mat(0x55605a, { side: THREE.BackSide, roughness: 0.9 }),
      0, -0.45, 0,
    );

    // inner ground of the pond (darker)
    this.mesh(new THREE.CircleGeometry(POND_R, 28), mat(0x3b5a52, { roughness: 0.9 }), 0, -0.9, 0)
      .rotation.x = -Math.PI / 2;

    // The water: a wavy, translucent surface with its own shader code (see water.js); the
    // floor and fish show through it. Transparent, so the renderer draws it after the
    // opaque objects and blends it over whatever is already behind.
    const { material, uniforms } = makeWaterMaterial();
    this.waterUniforms = uniforms;
    this.water = this.mesh(makeWaterGeometry(), material, 0, WATER_LEVEL, 0);
    addMirror(this.water, uniforms);

    // Lily pads. DoubleSide: visible from above and below (from under the water).
    for (let i = 0; i < 7; i++) {
      const a = rand() * Math.PI * 2;
      const d = rand() * 7;
      const pad = this.mesh(
        new THREE.CircleGeometry(0.6 + rand() * 0.5, 8),
        mat(0x5a8a4a, { side: THREE.DoubleSide, roughness: 0.8 }),
      );
      pad.rotation.x = -Math.PI / 2;
      pad.rotation.z = rand() * Math.PI;
      pad.position.set(Math.cos(a) * d, -0.05, Math.sin(a) * d);
    }
  }

  // gentle water bob, and the clock the waves run on
  update(dt, t) {
    this.water.position.y = waterSurface(t);
    this.waterUniforms.uTime.value = t;
  }
}
export const pond = new Pond();
