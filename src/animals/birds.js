import * as THREE from 'three';
import { mat } from '../core/materials.js';
import { clamp } from '../core/random.js';
import { cameraGroup } from '../core/camera.js';
import { env } from '../core/state.js';
import { SFX, distVol } from '../audio/sfx.js';
import { Feature } from '../world/feature.js';
import { Animal } from './animal.js';

// ---- Birds ----
// Sparrows, Japanese white-eyes (mejiro) and a couple of crows fly between perches:
// lantern roofs, tree tops, the torii beam, the tea house roof and the fence rail. Small
// birds also land on the grass to peck. They take off when you (or the dog) come close,
// unless they're perched out of reach, and sleep at night.
const BIRD_SPECIES = {
  sparrow:  { body: 0x8a6a4a, belly: 0xe9dcc4, wing: 0x6b4f37, head: 0x7a4f30, beak: 0x3a3330, scale: 1.4, speed: 7, call: 'bird' },
  whiteEye: { body: 0x8fae3a, belly: 0xd8d98a, wing: 0x6f8a2c, head: 0x8fae3a, beak: 0x3a3330, scale: 1.3, speed: 7, call: 'bird', eyeRing: true },
  crow:     { body: 0x1e1f24, belly: 0x2a2b31, wing: 0x15161a, head: 0x1e1f24, beak: 0x111111, scale: 3.0, speed: 5.5, call: 'caw', highOnly: true },
};
const BIRD_FLOCK = ['sparrow', 'sparrow', 'sparrow', 'sparrow', 'sparrow', 'whiteEye', 'whiteEye', 'whiteEye', 'crow', 'crow'];
const BIRD_SCARE_R = 4;   // flies off when you get this close...
const BIRD_HIGH = 4.5;    // ...unless its perch is higher than this (out of reach)

// A perch is a point stored in its parent's LOCAL coordinates (see the features'
// perches() methods) and converted to world space whenever it's needed, so it follows
// the parent's current transform: birds on a tree sway with its crown.
const perchWorld = (perch, out) => {
  out.copy(perch.local);
  return perch.parent ? perch.parent.localToWorld(out) : out;
};

// Scratch vectors, reused every frame: allocating new ones in a per-frame loop
// would create garbage for the collector to clean up, causing hitches.
const bTmpA = new THREE.Vector3(), bTmpB = new THREE.Vector3(), bTmpC = new THREE.Vector3(), bTmpD = new THREE.Vector3();

// One bird: 'perched' (on a perch, or pecking on the grass) or 'flying' to its next perch.
class Bird extends Animal {
  constructor(ctx, { species, flock }) {
    super(ctx, { parent: flock.group });
    this.species = species;
    this.sp = BIRD_SPECIES[species];
    this.flock = flock;
    this.build();
    this.state = 'perched';
    this.perch = null;
    this.flight = null;
    this.fold = 1;                            // wings: 1 folded … 0 spread
    this.timer = 3 + Math.random() * 12;      // until it moves on by itself
    this.lookT = 0;
    this.lookYaw = 0;
    this.peckT = 1;
    this.phase = Math.random() * 6;
  }

  // Bird faces +Z, standing on its feet at the origin.
  build() {
    const sp = this.sp;
    const m = (c, opts) => mat(c, { roughness: 0.8, ...opts });
    const BODY = m(sp.body), WING = m(sp.wing, { side: THREE.DoubleSide }), DARK = m(0x111111);
    const blob = (material, sx, sy, sz, x, y, z, parent = this.group) => this.blob(material, sx, sy, sz, x, y, z, parent, false);
    const root = this.group;
    // Euler angles are applied in a fixed order. 'YXZ' means: turn to the heading (Y)
    // first, then pitch nose up/down (X) about the bird's own sideways axis. With the
    // default 'XYZ' order, pitching while facing sideways would roll the bird instead.
    root.rotation.order = 'YXZ'; // heading first, then pitch in flight
    root.scale.setScalar(sp.scale);
    blob(BODY, 0.065, 0.065, 0.1, 0, 0.075, 0).castShadow = true;
    blob(m(sp.belly), 0.05, 0.045, 0.07, 0, 0.055, 0.02);
    const head = this.head = new THREE.Group();
    head.position.set(0, 0.12, 0.075);
    root.add(head);
    blob(m(sp.head), 0.05, 0.05, 0.05, 0, 0, 0, head);
    this.mesh(new THREE.ConeGeometry(0.014, 0.045, 4).rotateX(Math.PI / 2), m(sp.beak), 0, -0.005, 0.06, { parent: head });
    for (const s of [1, -1]) {
      if (sp.eyeRing) blob(m(0xffffff), 0.016, 0.016, 0.016, s * 0.031, 0.012, 0.03, head);
      blob(DARK, 0.01, 0.01, 0.01, s * 0.036, 0.012, 0.031, head);
      this.mesh(new THREE.CylinderGeometry(0.005, 0.005, 0.04, 3), DARK, s * 0.02, 0.02, 0); // leg
    }
    this.tail = this.mesh(new THREE.BoxGeometry(0.045, 0.01, 0.08), WING, 0, 0.085, -0.12);
    // Wings hinge at the shoulders: folded back along the body, or spread to flap.
    this.wings = [1, -1].map((s) => {
      const pivot = new THREE.Group();
      pivot.position.set(s * 0.05, 0.1, 0.01);
      this.mesh(new THREE.BoxGeometry(0.13, 0.01, 0.07), WING, s * 0.065, 0, 0, { parent: pivot });
      root.add(pivot);
      return { pivot, s };
    });
  }

  land(perch) {
    if (this.perch) this.perch.bird = null;
    perch.bird = this;
    this.perch = perch;
  }

  // Fly to another perch (or to the grass). `scaredBy` is a position to get away from.
  takeOff(scaredBy = null) {
    const here = perchWorld(this.perch, bTmpA).clone();
    const night = env.nightMix > 0.5;
    let target = null;
    // Never down onto the grass at night, nor in the rain: perches only.
    if (!scaredBy && !night && env.rainMix < 0.5 && !this.sp.highOnly && Math.random() < 0.25) target = this.flock.groundSpot();
    if (!target) {
      const options = this.flock.perches.filter((p) => {
        if (p.bird || p === this.perch || (this.sp.highOnly && !p.high)) return false;
        const w = perchWorld(p, bTmpB);
        const d = w.distanceTo(here);
        if (d < 5 || d > 55) return false;
        return !scaredBy || Math.hypot(w.x - scaredBy.x, w.z - scaredBy.z) > 8;
      });
      if (!options.length) { this.timer = 2; return; }
      target = options[Math.floor(Math.random() * options.length)];
    }
    this.land(target);
    const dist = perchWorld(target, bTmpB).distanceTo(here);
    const arc = 2 + dist * 0.25;
    this.flight = { from: here, arc, t: 0, dur: (dist + arc) / this.sp.speed + 0.4 };
    this.state = 'flying';
    SFX.flutter(distVol(here.x, here.z, 25) * (this.sp.highOnly ? 1 : 0.6));
  }

  update(dt, t) {
    if (this.state === 'flying') this.fly(dt, t);
    else this.sitOnPerch(dt, t);
  }

  fly(dt, t) {
    const f = this.flight, root = this.group;
    f.t += dt / f.dur;
    // Smoothstep 3k² − 2k³: an S-curve, so the bird eases out of take-off and into landing.
    const k = Math.min(1, f.t), e = k * k * (3 - 2 * k);
    // The target is re-read every frame, so a bird landing on a swaying tree follows it.
    const to = perchWorld(this.perch, bTmpB);
    const ctrl = bTmpC.copy(f.from).add(to).multiplyScalar(0.5);
    ctrl.y += f.arc;
    // Quadratic Bézier from → ctrl → to: B(e) = (1−e)²·from + 2(1−e)e·ctrl + e²·to.
    // The control point, raised above the midpoint, bends the path into an arc.
    // Its derivative 2(1−e)(ctrl − from) + 2e(to − ctrl) is the flight direction,
    // used for heading and pitch.
    const u = 1 - e;
    root.position.copy(f.from).multiplyScalar(u * u)
      .addScaledVector(ctrl, 2 * u * e).addScaledVector(to, e * e);
    const dir = bTmpD.copy(ctrl).sub(f.from).multiplyScalar(2 * u).addScaledVector(bTmpA.copy(to).sub(ctrl), 2 * e);
    if (dir.lengthSq() > 1e-6) {
      root.rotation.y = Math.atan2(dir.x, dir.z);
      root.rotation.x = clamp(-Math.atan2(dir.y, Math.hypot(dir.x, dir.z)) * 0.6, -0.6, 0.6);
    }
    this.fold += (0 - this.fold) * Math.min(1, dt * 12);
    const flap = k > 0.85 ? 0.35 : Math.sin(t * 28 + this.phase) * 0.9; // glide in to land
    for (const w of this.wings) {
      w.pivot.rotation.y = w.s * 1.45 * this.fold;
      w.pivot.rotation.z = w.s * flap * (1 - this.fold);
    }
    this.head.rotation.set(0, 0, 0);
    if (k >= 1) {
      this.state = 'perched';
      root.rotation.x = 0;
      this.timer = 6 + Math.random() * 14;
    }
  }

  // Perched: sit on the perch, fold the wings, look about (or sleep), and take off
  // when something comes too close.
  sitOnPerch(dt, t) {
    const night = env.nightMix > 0.5;
    const w = perchWorld(this.perch, bTmpA);
    this.group.position.copy(w);
    this.fold += (1 - this.fold) * Math.min(1, dt * 8);
    for (const wing of this.wings) {
      wing.pivot.rotation.y = wing.s * 1.45 * this.fold;
      wing.pivot.rotation.z = 0;
    }
    if (night) {
      this.head.rotation.set(0.7, 0, 0); // head tucked in
    } else {
      this.lookT -= dt;
      if (this.lookT <= 0) {
        this.lookT = 0.4 + Math.random() * 1.4;
        this.lookYaw = (Math.random() - 0.5) * 1.6;
        if (Math.random() < 0.25) this.group.rotation.y += (Math.random() - 0.5) * 2; // hop round
      }
      this.head.rotation.y += (this.lookYaw - this.head.rotation.y) * Math.min(1, dt * 12);
      if (this.perch.ground) { // peck at the grass now and then
        this.peckT -= dt;
        if (this.peckT <= 0) this.peckT = 0.6 + Math.random() * 1.5;
        this.head.rotation.x = this.peckT < 0.25 ? Math.sin(this.peckT / 0.25 * Math.PI) * 0.9 : 0;
      } else {
        this.head.rotation.x = 0;
      }
      this.tail.rotation.x = -0.35 + Math.max(0, Math.sin(t * 3 + this.phase)) * 0.15;
    }

    // Too close? Off it goes — unless it's up out of reach.
    const p = cameraGroup.position, { dog, cats } = this.flock;
    const near = Math.hypot(p.x - w.x, p.z - w.z) < BIRD_SCARE_R && Math.abs(p.y - w.y) < 3.5;
    const touching = p.distanceTo(w) < 2;
    const dogNear = w.y < 2 && Math.hypot(dog.x - w.x, dog.z - w.z) < 2.5;
    // A stalking cat creeps up unnoticed; any other cat this close is spotted.
    const catNear = w.y < 2 && cats?.list.find((c) => c.state !== 'stalk' && Math.hypot(c.x - w.x, c.z - w.z) < 2);
    if ((near && !this.perch.high) || touching) { this.takeOff(p); return; }
    if (dogNear) { this.takeOff({ x: dog.x, z: dog.z }); return; }
    if (catNear) { this.takeOff({ x: catNear.x, z: catNear.z }); return; }
    if (night && this.perch.ground) { this.takeOff(); return; } // roost for the night
    this.timer -= dt;
    if (this.timer <= 0 && !night) { this.takeOff(); return; }
    if (!night && Math.random() < dt * (this.sp.call === 'caw' ? 0.03 : 0.1)) {
      SFX[this.sp.call](distVol(w.x, w.z, 35));
    }
  }
}

// The flock and the perches it shares. Every object that birds can sit on offers
// its perches through a perches() method, so the flock doesn't need to know how a
// lantern or a tree is built: it just asks each of its `perchSources`.
// The birds flee the player, the `dog` and the cats.
export class Birds extends Feature {
  constructor(ctx, { perchSources, dog }) {
    super(ctx);
    this.dog = dog;
    this.cats = null; // set once the cats exist (they're made after the birds; see garden.js)
    // Make sure every object's world matrix is current before converting coordinates.
    ctx.scene.updateMatrixWorld(true);
    const tmp = new THREE.Vector3();
    this.perches = perchSources.flatMap((source) => source.perches()).map((perch) => {
      perch.bird = null;
      perch.high = perchWorld(perch, tmp).y > BIRD_HIGH;
      return perch;
    });
    this.list = BIRD_FLOCK.map((species) => {
      const b = new Bird(ctx, { species, flock: this });
      const free = this.perches.filter((p) => !p.bird && (!b.sp.highOnly || p.high));
      b.land(free[Math.floor(Math.random() * free.length)]);
      b.group.rotation.y = Math.random() * Math.PI * 2;
      return b;
    });
  }

  // A spot on open grass for pecking (a one-off perch, not in the list).
  groundSpot() {
    for (let i = 0; i < 20; i++) {
      const a = Math.random() * Math.PI * 2, d = 8 + Math.random() * 32;
      const x = Math.cos(a) * d, z = Math.sin(a) * d;
      if (!this.dog.blocked(x, z)) {
        return { parent: null, local: new THREE.Vector3(x, this.ctx.physics.surfaceHeightAt(x, z), z), kind: 'grass', ground: true, high: false, bird: null };
      }
    }
    return null;
  }

  update(dt, t) {
    for (const b of this.list) b.update(dt, t);
  }
}
