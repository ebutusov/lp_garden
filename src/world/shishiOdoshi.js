import * as THREE from 'three';
import { M } from '../core/materials.js';
import { SFX, distVol } from '../audio/sfx.js';
import { Feature } from './feature.js';

// ---- Bamboo water spout (shishi-odoshi) on the pond rim ----
// A feeder pipe trickles into a pivoting bamboo tube. When full it tips, pours into
// the pond, then swings back and its closed end knocks against a stone.
const SHISHI_REST = 0.35;   // tube angle with the mouth up
const SHISHI_TIP = -0.55;   // mouth down, pouring
const SHISHI_LEN = 2.2, SHISHI_PIVOT_Y = 1.2, SHISHI_MOUTH = 1.2; // mouth's distance from the pivot
const SHISHI_FILL = 4.5;
const tmpV = new THREE.Vector3(); // reused every time, to avoid allocating per frame
const ease = (a, b, k) => a + (b - a) * k * k; // ease-in: starts slow, speeds up (gravity)

// It stands at (x, z) on the rim of `pond` and pours into it, making `ripples`.
export class ShishiOdoshi extends Feature {
  constructor(ctx, { x, z, pond, ripples }) {
    super(ctx, { x, z });
    this.pond = pond;
    this.ripples = ripples;
    // local +X points at the pond centre
    const centre = pond.group.position;
    this.group.rotation.y = Math.atan2(-(centre.z - z), centre.x - x);

    for (const z of [0.45, -0.45]) this.mesh(new THREE.DodecahedronGeometry(0.35, 0), M.stoneD, -0.3, 0.15, z);
    this.mesh(new THREE.DodecahedronGeometry(0.3, 0), M.stone, -0.95, 0.45, 0); // the stone it knocks
    for (const z of [0.3, -0.3]) {
      this.bamboo(0.07, SHISHI_PIVOT_Y + 0.15, M.bambooD, 0, (SHISHI_PIVOT_Y + 0.15) / 2, z);
    }
    this.mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.75, 6).rotateX(Math.PI / 2), M.darkWood, 0, SHISHI_PIVOT_Y, 0);

    // The tube hangs on an empty pivot group at the axle. The tube is offset inside it so
    // the axle sits off-centre along the tube; rotating the pivot then see-saws the tube
    // about that point, like the real thing.
    this.pivot = new THREE.Group();
    this.pivot.position.y = SHISHI_PIVOT_Y;
    const tube = this.bamboo(0.12, SHISHI_LEN, M.bamboo, SHISHI_MOUTH - SHISHI_LEN / 2, 0, 0, this.pivot);
    tube.rotation.z = Math.PI / 2; // cylinders stand along Y; lay it along X
    tube.castShadow = true;
    for (const x of [-0.45, 0.55]) {
      this.mesh(new THREE.CylinderGeometry(0.135, 0.135, 0.06, 8), M.bambooD, x, 0, 0, { parent: this.pivot })
        .rotation.z = Math.PI / 2;
    }
    this.mesh(new THREE.CircleGeometry(0.1, 8).rotateY(Math.PI / 2), M.darkWood, SHISHI_MOUTH + 0.001, 0, 0, { parent: this.pivot });
    this.pivot.rotation.z = SHISHI_REST;
    this.group.add(this.pivot);

    // feeder pipe on its own post, ending above the mouth's resting position
    // (the mouth rotated by SHISHI_REST around the pivot: basic trigonometry).
    const mouthX = SHISHI_MOUTH * Math.cos(SHISHI_REST);
    const mouthY = SHISHI_PIVOT_Y + SHISHI_MOUTH * Math.sin(SHISHI_REST);
    const FEED_Y = mouthY + 0.45;
    this.bamboo(0.08, FEED_Y + 0.1, M.bambooD, -1.5, (FEED_Y + 0.1) / 2, 0);
    this.bamboo(0.06, mouthX + 1.5, M.bamboo, (mouthX - 1.5) / 2, FEED_Y, 0).rotation.z = Math.PI / 2;
    this.mesh(
      new THREE.CylinderGeometry(0.025, 0.025, FEED_Y - mouthY, 6),
      new THREE.MeshStandardMaterial({ color: 0x9fd3e6, transparent: true, opacity: 0.55, roughness: 0.2 }),
      mouthX, (FEED_Y + mouthY) / 2, 0,
    );
    this.solidCircle(0, 0, 1.1, 2.4);

    this.state = 'fill';
    this.timer = 0;
    this.angle = SHISHI_REST;
  }

  bamboo(r, len, m, x, y, z, parent = this.group) {
    return this.mesh(new THREE.CylinderGeometry(r, r, len, 8), m, x, y, z, { parent });
  }

  go(state) {
    this.state = state;
    this.timer = 0;
  }

  // ---- Shishi-odoshi cycle: fill → tip → pour → swing back → knock ----
  // A finite state machine: the object is always in exactly one named state, each state
  // has its own behaviour, and a timer or event moves it on to the next.
  update(dt) {
    this.timer += dt;
    if (this.state === 'fill') {
      this.angle = SHISHI_REST - 0.12 * Math.min(1, this.timer / SHISHI_FILL); // sags as it fills
      if (this.timer >= SHISHI_FILL) this.go('tip');
    } else if (this.state === 'tip') {
      const k = Math.min(1, this.timer / 0.35);
      this.angle = ease(SHISHI_REST - 0.12, SHISHI_TIP, k);
      if (k >= 1) {
        this.go('pour');
        // Where is the mouth in the world right now? localToWorld runs a point through
        // the pivot's and all its parents' transforms. Matrices are normally refreshed
        // just before rendering, so force an update first.
        this.group.updateMatrixWorld(true);
        const m = this.pivot.localToWorld(tmpV.set(SHISHI_MOUTH, 0, 0));
        // Ripples are pond-local: subtract the pond's position.
        const c = this.pond.group.position;
        this.ripples.spawn(m.x - c.x, m.z - c.z, 1.2, 1.8);
        this.ripples.spawn(m.x - c.x, m.z - c.z, 0.6, 1.2);
        SFX.splash(0.5 * distVol(m.x, m.z, 40));
      }
    } else if (this.state === 'pour') {
      if (this.timer >= 0.6) this.go('return');
    } else if (this.state === 'return') {
      const k = Math.min(1, this.timer / 0.2);
      this.angle = ease(SHISHI_TIP, SHISHI_REST, k);
      if (k >= 1) {
        this.go('fill');
        SFX.clack(distVol(this.group.position.x, this.group.position.z, 45));
      }
    }
    // After the knock the tube rebounds briefly off the stone: a damped oscillation
    // (a fast sine wave scaled by a decaying exponential).
    const rebound = this.state === 'fill' ? 0.06 * Math.exp(-this.timer * 9) * Math.abs(Math.sin(this.timer * 30)) : 0;
    this.pivot.rotation.z = this.angle - rebound;
  }
}
