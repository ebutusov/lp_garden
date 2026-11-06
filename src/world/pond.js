import * as THREE from 'three';
import { M, mat } from '../core/materials.js';
import { WATER_LEVEL, waterSurface } from '../core/layout.js';
import { UNDERWATER_LAYER } from '../core/camera.js';
import { Feature } from './feature.js';
import { makeWaterMaterial, makeWaterGeometry, addMirror } from './water.js';

// ---- Pond with water ----
// Everything in the pond lives in its group, centred on the pond, so its parts (and
// the koi, ripples and food pellets) use simple pond-local coordinates: (0, 0) is the
// middle of the pond. World z = local z + the pond's z.
export class Pond extends Feature {
  // `inlet` { angle, width }: a gap in the rim where a stream flows in (angle measured
  // as in layout.js: the rim point is (cos angle, sin angle) · radius from the centre).
  constructor(ctx, { z, radius, inlet = null }) {
    super(ctx, { z });
    const { rand } = ctx;
    this.radius = radius;
    // stone rim around the hole in the ground. A torus is a ring (doughnut); lying it flat
    // hides the seam between the ground's hole and the water.
    // With an inlet, the torus is only an arc (its last parameter: how far round it goes),
    // turned so the missing piece faces the stream. In its own XY plane a torus starts at
    // angle 0 and runs anticlockwise; lying it flat (rotateX below) turns its angle φ into
    // the garden's -φ, hence the minus signs.
    this.inletGap = inlet ? inlet.width / 2 / (radius + 0.2) : 0; // half the gap, as an angle
    const rimGeo = new THREE.TorusGeometry(radius + 0.2, 0.6, 6, 28, Math.PI * 2 - 2 * this.inletGap);
    if (inlet) rimGeo.rotateZ(-inlet.angle + this.inletGap);
    this.mesh(rimGeo, M.stoneD, 0, -0.05, 0, { receive: true })
      .rotation.x = -Math.PI / 2;

    // inner wall of the pond, so the hole doesn't look into the void. An open-ended
    // cylinder (no caps) drawn BackSide: from inside the pond you see its inner face.
    const wall = this.mesh(
      new THREE.CylinderGeometry(radius, radius, 0.9, 28, 1, true),
      mat(0x55605a, { side: THREE.BackSide, roughness: 0.9 }),
      0, -0.45, 0,
    );

    // inner ground of the pond (darker)
    const floor = this.mesh(new THREE.CircleGeometry(radius, 28), mat(0x3b5a52, { roughness: 0.9 }), 0, -0.9, 0);
    floor.rotation.x = -Math.PI / 2;
    // Both are below the surface, so the reflection would only clip them away.
    this.hideFromReflection(wall);
    this.hideFromReflection(floor);

    // The water: a wavy, translucent surface with its own shader code (see water.js); the
    // floor and fish show through it. Transparent, so the renderer draws it after the
    // opaque objects and blends it over whatever is already behind.
    const { material, uniforms } = makeWaterMaterial(radius);
    this.waterUniforms = uniforms;
    this.water = this.mesh(makeWaterGeometry(radius), material, 0, WATER_LEVEL, 0);
    this.renderMirror = addMirror(this.water, uniforms, radius);

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

  // Renders the water's reflection (see addMirror in water.js). main.js calls it every
  // frame, after all the updates and just before drawing the scene.
  renderReflection(renderer, scene, camera) {
    this.renderMirror(renderer, scene, camera);
  }

  // Keeps something that stays under the surface (and all its parts) out of the
  // reflection's render: the oblique near plane would clip it away anyway, but only
  // after it had been drawn. See UNDERWATER_LAYER in camera.js.
  hideFromReflection(object) {
    object.traverse((o) => o.layers.set(UNDERWATER_LAYER));
  }
}
