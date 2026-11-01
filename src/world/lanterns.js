import * as THREE from 'three';
import { M } from '../core/materials.js';
import { LANTERN_SPOTS, PATH_LANTERN_SPOTS, PATH_LANTERN_SCALE, PATH_LANTERN_GLOW } from '../core/layout.js';
import { Feature } from './feature.js';

// ---- Stone Lantern (Tōrō) ----
// Each lantern is its own object with its own glow and flicker. Static fields belong to
// the class rather than to any one lantern: `brightness` is set once by day/night (see
// dayNight.js) and every lantern scales it by its own glow.
export class Lantern extends Feature {
  static BASE_INTENSITY = 8;
  static brightness = Lantern.BASE_INTENSITY;

  // `glow` scales the light it gives off; `paperMat` is the material of its glowing box.
  constructor(x, z, scale = 1, glow = 1, paperMat = M.paper, parent) {
    super(x, z, parent);
    this.group.scale.setScalar(scale);
    this.glow = glow;
    this.mesh(new THREE.CylinderGeometry(0.5, 0.6, 0.5, 6), M.stoneD, 0, 0.25, 0, { cast: true });
    this.mesh(new THREE.CylinderGeometry(0.28, 0.3, 1.4, 6), M.stone, 0, 1.0, 0, { cast: true });
    // glowing paper fire box (the lit part of the lantern)
    this.mesh(new THREE.BoxGeometry(0.9, 0.6, 0.9), paperMat, 0, 2.0, 0);
    // A 4-sided cone is a pyramid; turned 45° its edges line up with the box below.
    this.mesh(new THREE.ConeGeometry(1.1, 0.8, 4), M.stoneD, 0, 2.7, 0, { cast: true }).rotation.y = Math.PI / 4;
    // Physical light units (three r155+): intensity is in candela.
    // PointLight(color, intensity, distance, decay): light fades to zero at `distance`,
    // with decay 2 being physically correct inverse-square falloff. Every extra light
    // costs shading work on every lit pixel, so these don't cast shadows.
    this.light = new THREE.PointLight(0xffd27a, Lantern.BASE_INTENSITY * glow, 12 * scale, 2);
    this.light.position.y = 2.0;
    this.group.add(this.light);
    this.solidCircle(0, 0, 0.6 * scale, 3.1 * scale);
  }

  // Birds perch on the roof tip.
  perches() {
    return [{ parent: this.group, local: new THREE.Vector3(0, 3.1, 0), kind: 'lantern' }];
  }

  // Glow pulse: a gentle flicker, out of step between lanterns (each object's unique id
  // offsets its sine wave).
  update(dt, t) {
    this.light.intensity = Lantern.brightness * this.glow * (1 + Math.sin(t * 3 + this.group.id) * 0.25);
  }
}

class Lanterns extends Feature {
  constructor() {
    super();
    this.list = [];
    for (const [x, z] of LANTERN_SPOTS) this.list.push(new Lantern(x, z, 1, 1, M.paper, this.group));
    for (const [x, z] of PATH_LANTERN_SPOTS) {
      this.list.push(new Lantern(x, z, PATH_LANTERN_SCALE, PATH_LANTERN_GLOW, M.pathPaper, this.group));
    }
  }

  perches() {
    return this.list.flatMap((l) => l.perches());
  }

  update(dt, t) {
    for (const l of this.list) l.update(dt, t);
  }
}
export const lanterns = new Lanterns();
