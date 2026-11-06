import * as THREE from 'three';
import { M, mat } from '../core/materials.js';
import { SFX, distVol } from '../audio/sfx.js';
import { showToast } from '../ui/toast.js';
import { Feature } from './feature.js';

// ---- A small temple bell (bonshō) in its bell house (shōrō) ----
// Japanese temple bells have no clapper inside. They're struck from outside with a
// wooden beam (shumoku) hung on ropes beside them: you draw it back, let it swing, and
// it hits the bell's striking seat (tsukiza), a raised lotus boss low on its side.
// The bell's body is a "lathe" shape: a profile line spun round the vertical axis,
// as a potter's wheel would turn it, which suits anything round like a bell or a vase.
//
// The house is open on all four sides, under a pyramid roof. The bell hangs from a
// beam across the middle, and the striker from a second beam just south of it, the
// side you come from along the tea path, so it swings along Z into the bell.
// Press E nearby to ring it (animals/interaction.js).
//
// The striker's swing is a small state machine (like the shishi-odoshi's): draw back,
// swing in under gravity, strike, bounce back off the bronze and settle. The bell
// sways a little after each strike, as a damped oscillation.
const POST = 1.1;          // posts at (±POST, ±POST)
const BEAM_Y = 3.1;        // underside of the beams the bell and striker hang from
const BELL_H = 1.0, BELL_R = 0.42;
const SEAT_Y = -0.66;      // the striking seat, below the bell's hanging point
const STRIKER_Z = 0.86;    // the striker's beam, south of the bell
const DRAW_BACK = -0.6;    // how far the striker is drawn back (radians about X)

const easeOut = (k) => 1 - (1 - k) * (1 - k);
const easeIn = (k) => k * k; // like a pendulum gathering speed

export class Bell extends Feature {
  static RING_R = 2.9;     // how close (to its centre) the player must be to ring it

  constructor(ctx, { x, z }) {
    super(ctx, { x, z });
    const wood = (w, h, d, px, py, pz, m = M.darkWood) =>
      this.mesh(new THREE.BoxGeometry(w, h, d), m, px, py, pz, { cast: true, receive: true });
    // Bronze with a green patina: a little metallic, fairly rough.
    const BRONZE = mat(0x56604a, { roughness: 0.5, metalness: 0.55, side: THREE.DoubleSide });
    const ROPE = mat(0xd8c9a0, { roughness: 1 });

    // Base: a flat stone pad, with a stone footing under each post.
    this.mesh(new THREE.BoxGeometry(POST * 2 + 0.7, 0.08, POST * 2 + 0.7), M.stoneD, 0, 0.04, 0, { receive: true });
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      this.mesh(new THREE.CylinderGeometry(0.2, 0.24, 0.2, 7), M.stone, sx * POST, 0.1, sz * POST, { cast: true, receive: true });
      wood(0.16, BEAM_Y + 0.2, 0.16, sx * POST, (BEAM_Y + 0.2) / 2 + 0.1, sz * POST);
    }
    // Top plates round the posts, the bell's beam across the middle, the striker's beside it.
    const SPAN = POST * 2 + 0.3, TOP = BEAM_Y + 0.3;
    for (const s of [-1, 1]) {
      wood(SPAN, 0.16, 0.18, 0, TOP, s * POST);
      wood(0.18, 0.16, SPAN, s * POST, TOP, 0);
    }
    wood(SPAN, 0.2, 0.2, 0, BEAM_Y + 0.1, 0);
    wood(SPAN, 0.14, 0.14, 0, BEAM_Y + 0.07, STRIKER_Z);
    // Pyramid roof, as on the tea house: a four-sided cone turned 45°, with a finial.
    const half = Math.SQRT1_2;
    this.mesh(new THREE.ConeGeometry(1, 1, 4).rotateY(Math.PI / 4), M.roof, 0, TOP + 0.65, 0, { cast: true })
      .scale.set(1.75 / half, 1.1, 1.75 / half);
    this.mesh(new THREE.SphereGeometry(0.1, 6, 4), M.darkWood, 0, TOP + 1.22, 0, { cast: true });
    this.peakY = TOP + 1.3;

    // ---- The bell, on a pivot at its hanging point so it can sway ----
    const bell = this.bellPivot = new THREE.Group();
    bell.position.set(0, BEAM_Y, 0);
    this.group.add(bell);
    const part = (geo, m, px, py, pz) => this.mesh(geo, m, px, py, pz, { cast: true, parent: bell });
    // The hanging loop (ryūzu) and the body, from the crown down to the flared lip.
    part(new THREE.TorusGeometry(0.08, 0.03, 5, 10), BRONZE, 0, -0.06, 0);
    const profile = [[0, -0.12], [0.26, -0.12], [0.32, -0.16], [0.34, -0.3], [0.36, -0.6],
      [0.39, -0.9], [BELL_R, -1.02], [BELL_R - 0.02, -1.02 - 0.03]].map(([r, y]) => new THREE.Vector2(r, y));
    part(new THREE.LatheGeometry(profile, 12), BRONZE, 0, 0, 0);
    // Raised bands round the body, and rows of bosses (chi) on the upper part.
    for (const [y, r] of [[-0.42, 0.352], [-0.84, 0.385]]) {
      part(new THREE.TorusGeometry(r, 0.012, 3, 16).rotateX(Math.PI / 2), BRONZE, 0, y, 0);
    }
    for (let row = 0; row < 3; row++) {
      for (let i = 0; i < 10; i++) {
        const a = (i / 10) * Math.PI * 2 + row * 0.31, y = -0.2 - row * 0.065, r = 0.335 + row * 0.004;
        part(new THREE.SphereGeometry(0.018, 4, 3), BRONZE, Math.cos(a) * r, y, Math.sin(a) * r);
      }
    }
    // The striking seat, a boss facing the striker (+Z).
    part(new THREE.CylinderGeometry(0.075, 0.085, 0.03, 8).rotateX(Math.PI / 2), BRONZE, 0, SEAT_Y, 0.37);

    // ---- The striker: a wooden beam along Z, hung by a V of rope from its own beam ----
    const striker = this.strikerPivot = new THREE.Group();
    striker.position.set(0, BEAM_Y, STRIKER_Z);
    this.group.add(striker);
    const logY = SEAT_Y, logLen = 0.9;
    this.mesh(new THREE.CylinderGeometry(0.07, 0.075, logLen, 7).rotateX(Math.PI / 2), M.wood, 0, logY, 0, { cast: true, parent: striker });
    // Each rope runs from the pivot to near one end of the log: a cylinder of unit
    // length, scaled to the distance and turned to point along it.
    for (const end of [-0.32, 0.32]) {
      const to = new THREE.Vector3(0, logY + 0.06, end), len = to.length();
      const rope = this.mesh(new THREE.CylinderGeometry(0.012, 0.012, 1, 4), ROPE, to.x / 2, to.y / 2, to.z / 2, { parent: striker });
      rope.scale.y = len;
      rope.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), to.normalize());
    }
    this.logFront = -logLen / 2; // the striking end, toward the bell

    // One box over the whole house: open sides would be hollows the animals' feeler
    // steering can get stuck in (see physics.pondBlocked), and the hanging striker
    // would be at head height for the player.
    this.solids = [this.solidBox(-POST - 0.15, POST + 0.15, -POST - 0.15, POST + 0.15, TOP + 0.2)];

    this.state = 'still';  // 'still', 'draw', 'swing', 'rebound'
    this.timer = 0;
    this.sway = 100;        // time since the last strike, for the bell's sway (long ago: still)
    this.rings = 0;
  }

  // The bell and the striker move: merge each on its own (one mesh per material
  // inside each pivot, which then moves as one), and the house round them.
  mergeStatic() {
    super.mergeStatic({ skip: [this.bellPivot, this.strikerPivot] });
    super.mergeStatic({ root: this.bellPivot });
    super.mergeStatic({ root: this.strikerPivot });
  }

  // The stone pad, for the grass to keep clear of (it reaches past the collider).
  footprints() {
    const p = this.group.position;
    return [{ x: p.x, z: p.z, r: POST + 0.9 }];
  }

  // A bird perch on the roof's finial.
  perches() {
    return [{ parent: this.group, local: new THREE.Vector3(0, this.peakY, 0), kind: 'bell house' }];
  }

  // Can the player at (x, z) reach the striker?
  inReach(x, z) {
    const p = this.group.position;
    return Math.hypot(x - p.x, z - p.z) < Bell.RING_R;
  }

  // Ring it (unless the striker is still swinging). Returns whether it was struck.
  ring() {
    if (this.state !== 'still') return false;
    this.go('draw');
    return true;
  }

  get busy() {
    return this.state !== 'still';
  }

  go(state) {
    this.state = state;
    this.timer = 0;
  }

  update(dt) {
    this.timer += dt;
    this.sway += dt;
    let angle = 0;
    if (this.state === 'draw') {
      const k = Math.min(1, this.timer / 1.1);
      angle = DRAW_BACK * easeOut(k);
      if (k >= 1 && this.timer > 1.4) this.go('swing'); // a held breath at the top
      else if (k >= 1) angle = DRAW_BACK;
    } else if (this.state === 'swing') {
      const k = Math.min(1, this.timer / 0.32);
      angle = DRAW_BACK * (1 - easeIn(k));
      if (k >= 1) this.strike();
    } else if (this.state === 'rebound') {
      // Bounces back off the bronze, less each time, and comes to rest.
      angle = -0.18 * Math.exp(-this.timer * 2.5) * Math.abs(Math.sin(this.timer * 4));
      if (this.timer > 2.2) this.go('still');
    }
    this.strikerPivot.rotation.x = angle;
    // Struck on its south face, the bell swings away north (about X) and rocks slightly
    // sideways (about Z), dying away over a few seconds.
    const fade = Math.exp(-this.sway * 0.9);
    this.bellPivot.rotation.x = 0.05 * fade * Math.sin(this.sway * 3.1);
    this.bellPivot.rotation.z = 0.012 * fade * Math.sin(this.sway * 2.3 + 1);
  }

  strike() {
    this.go('rebound');
    this.sway = 0;
    this.rings++;
    const p = this.group.position;
    SFX.bell(distVol(p.x, p.z, 120)); // a bell carries across the whole garden
    showToast('🔔 The bell rings out.');
  }
}
