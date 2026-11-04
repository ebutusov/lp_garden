import * as THREE from 'three';
import { M, mat } from '../core/materials.js';
import { clamp } from '../core/random.js';
import { cameraGroup } from '../core/camera.js';
import { env, player } from '../core/state.js';
import { BRIDGE_WIDTH, BRIDGE_SPAN } from '../core/layout.js';
import { PLAYER_HEIGHT } from '../core/physics.js';
import { SFX, distVol } from '../audio/sfx.js';
import { showToast } from '../ui/toast.js';
import { Animal } from '../animals/animal.js';

// ---- The Gardener ----
// An old man who looks after the garden. He takes tea in the tea house (and spends the
// night there), strolls over to admire the trees and flowers, feeds the koi, rakes the
// gravel garden, pets the dog and the cats, fills their bowls by the tea house, and
// bows when you greet him.
//
// Three techniques carry him:
//
//  1. COROUTINES. Each activity is a generator function (function*). Calling one
//     doesn't run it; it returns an iterator, and every call to .next() runs it up to
//     its next `yield`. update() calls .next() once per frame, so a `yield` means
//     "wait for the next frame". An activity can then be written as a plain script
//     (walk there, kneel, wait three seconds, sip), instead of a state machine with a
//     state for every step. `yield*` runs another generator to completion inside this
//     one, so small steps (walkTo, wait, face) compose into whole routines. Calling
//     .return() on a generator stops it early but still runs its `finally` blocks:
//     that is how an activity is interrupted (at nightfall) and tidied up.
//
//  2. POSE BLENDING. A pose is a table of joint angles (POSES). Each frame every joint
//     eases toward its target pose, plus an `overlay` of offsets for gestures (raise
//     the cup, throw the food), plus a bow. Easing gives smooth transitions for free:
//     an activity just names the pose it wants. The walk cycle is added on top
//     afterwards, un-eased, because easing an oscillation would damp it and make it lag.
//
//  3. FEET ON THE GROUND. The hips' height isn't animated: it's worked out from the
//     leg angles (forward kinematics: thigh and shin lengths times the cosines of
//     their angles), so whatever the legs do, standing, kneeling or crouching, the
//     feet end up on the floor.
//
// He's an Animal (animals/animal.js) in all but name: the same blob body parts,
// collision circle and feeler steering. His own blocked() lets him on the gravel and
// into the tea house, where the animals don't go, but never onto the bridge.
const SPEED = 1.3;          // walking pace, units/second
const RAKE_SPEED = 0.45;    // stepping backwards while raking
const REACH = 1.2;          // how far ahead of his feet the rake's head drags
const GREET_DUR = 2.6;      // seconds a greeting (turn and bow) takes
const FEELERS = [0, 0.4, -0.4, 0.8, -0.8, 1.3, -1.3, 1.9, -1.9, 2.5, -2.5];
const L_THIGH = 0.5, L_SHIN = 0.48; // leg segment lengths
const SOLE = 0.06;          // ankle pivot down to the sole
const SEAT = 0.26;          // lowest the hips go: kneeling, sitting back on his heels

// Joint angles in radians. The body faces +Z with its left side toward +X.
//  lean: torso forward. headX: head down (negative looks up).
//  ShX: shoulder (negative swings the arm forward). ShZ: shoulder out from the side.
//  El: elbow (negative bends the forearm forward). ElZ: forearm out (negative: inward).
//  Th: hip (negative swings the thigh forward). Kn: knee (positive folds the shin back).
// The Z angles are given for the left side; the right side mirrors them.
const STAND = {
  lean: 0.12, headX: 0.05,
  lShX: 0, lShZ: 0.08, lEl: -0.15, lElZ: 0, rShX: 0, rShZ: 0.08, rEl: -0.15, rElZ: 0,
  lTh: 0, lKn: 0, rTh: 0, rKn: 0,
};
const POSES = {
  stand: STAND,
  // Hands clasped behind his back: upper arms back, forearms swung in across the back.
  behind: { ...STAND, lean: 0.15, lShX: 0.45, rShX: 0.45, lShZ: 0.12, rShZ: 0.12, lEl: 0, rEl: 0, lElZ: -1.35, rElZ: -1.3 },
  // Seiza: kneeling, thighs forward, shins folded back under them, hands on his thighs.
  seiza: {
    ...STAND, lean: 0.05, headX: 0.1, lTh: -1.57, rTh: -1.57, lKn: 3, rKn: 3,
    lShX: -0.35, rShX: -0.35, lEl: -0.8, rEl: -0.8, lElZ: -0.25, rElZ: -0.25,
  },
  crouch: { ...STAND, lean: 0.5, headX: 0.3, lTh: -1.3, rTh: -1, lKn: 2.2, rKn: 2.3, lShX: -0.5, rShX: -0.3, lEl: -0.5, rEl: -0.6 },
  // Both hands forward on the rake's handle, one foot ahead of the other.
  rake: {
    ...STAND, lean: 0.3, headX: 0.35, lTh: -0.15, lKn: 0.25, rTh: 0.15, rKn: 0.1,
    lShX: -0.75, rShX: -0.45, lEl: -0.55, rEl: -0.75, lElZ: -0.35, rElZ: -0.2,
  },
};
// Gesture overlays: offsets added to whatever pose he's in.
const REACH_CUP = { rShX: -0.9, rEl: -0.5, rShZ: 0.1, lean: 0.25 };
const SIP = { rShX: -0.95, rEl: -1.75, rElZ: -0.55, headX: -0.25 };
const HOLD_POUCH = { lShX: -0.6, lEl: -0.9, lElZ: -0.3 };
const WIND_UP = { rShX: 0.4, rEl: -1 };
const THROW = { rShX: -1.4, rEl: -0.2, rShZ: 0.2 };
const TOUCH = { rShX: -0.7, rEl: -0.2, rShZ: -0.1 };
const LOOK_UP = { headX: -0.55, lean: -0.05 };
const CARRY = { rShX: -0.25, rEl: -0.5, rShZ: 0.15 }; // right hand on the upright rake
const POUR_POUCH = { lShX: -1.05, lEl: -0.35, lElZ: -0.2 };  // kibble out of the bag, into a bowl
const POUR_BUCKET = { rShX: -0.55, rEl: -0.45, rShZ: 0.05 }; // the bucket held out over the bowl

const tmp = new THREE.Vector3();
const tmpQ = new THREE.Quaternion();
const tmpE = new THREE.Euler();

export class Gardener extends Animal {
  static R = 0.35;        // collision radius
  static GREET_R = 2.8;   // how close the player must be to greet him

  constructor(ctx, {
    teaHouse, teaThings, bowls, zenGarden, pond, feeding, trees, flowers, fuji, dog, cats, fenceR, x = -20, z = 4,
  }) {
    super(ctx, { x, z, radius: Gardener.R, height: 2 });
    Object.assign(this, { teaHouse, teaThings, bowls, zenGarden, pond, feeding, trees, flowers, fuji, dog, cats, fenceR });
    this.y = 0;             // height of the ground under him, eased
    this.build();
    this.buildRake();
    this.heading = Math.PI / 2;
    this.speed = 0;         // signed: negative steps backwards (raking)
    this.moved = 0;         // distance actually covered this frame (see move())
    this.wantSpeed = 0;
    this.avoidSide = 1;
    this.stuck = 0;
    this.scripted = false;  // following a hand-made path (in the tea house): ignore colliders
    this.poseName = 'stand';
    this.overlay = null;
    this.joints = { ...STAND };
    this.phase = 0;         // walk cycle
        this.lookYaw = 0;
    this.lookAt = null;     // something to keep his eyes on ({ x, z })
    this.greetT = 0;
    this.held = null;       // a tea cup in his hand: { cup, w, want, tilt, tiltNow }
    this.bucketHeld = null; // the water bucket, likewise: { w, want, tilt, tiltNow }
    this.rakeHeld = false;
    this.rakeMode = 'carry';
    this.activity = null;
    this.task = null;
    this.lastActivity = null;
    this.lastPlant = null;
    this.dt = 0;
    if (this.blocked(this.x, this.z)) Object.assign(this, this.openSpot(this, 0, 30) ?? {});
    this.y = this.groundAt(this.x, this.z);
    this.syncSolid();
  }

  // ---- The body ----
  // A joint hierarchy like the dog's, only upright:
  //   root (position + heading) → hips (height from the legs) → thighs → knees
  //                                hips → torso (leans) → head, shoulders → elbows → hands
  build() {
    const SKIN = mat(0xd9a77f, { roughness: 0.8 }), HAIR = mat(0xeeeae2, { roughness: 1 });
    const JACKET = mat(0x2e3d63, { roughness: 0.95 }), TROUSERS = mat(0x3b3a3f, { roughness: 0.95 });
    const SASH = mat(0x8c7b5c), SANDAL = mat(0x5a4632), DARK = mat(0x1c1c1c);
    const blob = this.blob.bind(this);
    const cyl = (rt, rb, len, m, parent, y) =>
      this.mesh(new THREE.CylinderGeometry(rt, rb, len, 6), m, 0, y, 0, { cast: true, parent });

    const hips = this.hips = new THREE.Group();
    this.group.add(hips);
    blob(TROUSERS, 0.2, 0.12, 0.14, 0, 0.02, 0, hips);
    // Each leg hangs from a hip pivot, with a knee pivot at the end of the thigh. Every
    // segment is shifted down by half its length, so it swings from its top end.
    this.legs = [1, -1].map((s) => {
      const thigh = new THREE.Group();
      thigh.position.set(s * 0.11, 0, 0);
      hips.add(thigh);
      cyl(0.085, 0.075, L_THIGH, TROUSERS, thigh, -L_THIGH / 2);
      const knee = new THREE.Group();
      knee.position.y = -L_THIGH;
      thigh.add(knee);
      cyl(0.072, 0.062, L_SHIN, TROUSERS, knee, -L_SHIN / 2);
      blob(SANDAL, 0.07, 0.035, 0.13, 0, -L_SHIN - 0.025, 0.05, knee);
      return { thigh, knee };
    });

    const torso = this.torso = new THREE.Group();
    torso.position.y = 0.04;
    hips.add(torso);
    blob(JACKET, 0.23, 0.14, 0.16, 0, 0.06, 0, torso);    // jacket skirt over the hips
    blob(JACKET, 0.22, 0.32, 0.15, 0, 0.42, 0, torso);    // body
    blob(SASH, 0.215, 0.05, 0.15, 0, 0.16, 0, torso);     // sash
    blob(JACKET, 0.27, 0.08, 0.15, 0, 0.62, 0, torso);    // shoulders
    blob(SKIN, 0.07, 0.05, 0.03, 0, 0.66, 0.125, torso);  // the V of the collar

    this.arms = [1, -1].map((s) => {
      const shoulder = new THREE.Group();
      shoulder.position.set(s * 0.26, 0.6, 0);
      torso.add(shoulder);
      cyl(0.065, 0.06, 0.34, JACKET, shoulder, -0.17);
      const elbow = new THREE.Group();
      elbow.position.y = -0.34;
      shoulder.add(elbow);
      cyl(0.06, 0.07, 0.26, JACKET, elbow, -0.13);        // wide sleeve
      const hand = new THREE.Group();
      hand.position.y = -0.33;
      elbow.add(hand);
      blob(SKIN, 0.045, 0.055, 0.035, 0, 0, 0, hand);
      return { shoulder, elbow, hand };
    });
    this.hands = { l: this.arms[0].hand, r: this.arms[1].hand };
    // A small bag of koi food, shown only while feeding.
    this.pouch = blob(mat(0xc9b48a, { roughness: 1 }), 0.06, 0.07, 0.05, 0, -0.06, 0.03, this.hands.l);
    this.pouch.visible = false;

    // The head turns (Y) and nods (X). Euler angles are applied in a fixed order;
    // 'YXZ' turns first and nods second, so a nod stays a nod when the head is turned.
    const head = this.head = new THREE.Group();
    head.position.set(0, 0.7, 0.03);
    head.rotation.order = 'YXZ';
    torso.add(head);
    cyl(0.05, 0.055, 0.12, SKIN, head, 0.02);                           // neck
    blob(SKIN, 0.12, 0.14, 0.13, 0, 0.17, 0.01, head);
    blob(HAIR, 0.11, 0.08, 0.07, 0, 0.15, -0.08, head);                 // white hair round the back
    for (const s of [1, -1]) {
      blob(HAIR, 0.04, 0.06, 0.07, s * 0.105, 0.15, -0.02, head);       // ...and over the ears
      blob(SKIN, 0.02, 0.035, 0.03, s * 0.12, 0.16, 0, head);           // ears
      blob(HAIR, 0.035, 0.012, 0.015, s * 0.045, 0.215, 0.12, head);    // bushy eyebrows
      blob(DARK, 0.012, 0.01, 0.008, s * 0.045, 0.18, 0.123, head);     // eyes
      this.mesh(new THREE.TorusGeometry(0.032, 0.005, 4, 10), DARK, s * 0.047, 0.18, 0.135, { parent: head }); // round glasses
    }
    this.mesh(new THREE.BoxGeometry(0.03, 0.006, 0.006), DARK, 0, 0.183, 0.137, { parent: head });
    blob(SKIN, 0.022, 0.032, 0.03, 0, 0.15, 0.13, head);                // nose
    blob(HAIR, 0.085, 0.09, 0.07, 0, 0.06, 0.07, head);                 // beard
    blob(HAIR, 0.06, 0.016, 0.025, 0, 0.115, 0.12, head);               // moustache
  }

  // The bamboo rake, kept lying in the grass by the gravel's west edge. Its origin is
  // the middle of its head, with the handle along its +Y.
  buildRake() {
    const zen = this.zenGarden;
    const rake = this.rakeTool = new THREE.Group();
    this.mesh(new THREE.CylinderGeometry(0.022, 0.022, 1.8, 5), M.bamboo, 0, 0.9, 0, { cast: true, parent: rake });
    this.mesh(new THREE.BoxGeometry(0.9, 0.05, 0.06), M.wood, 0, 0.07, 0, { cast: true, parent: rake });
    for (let i = 0; i < 9; i++) this.mesh(new THREE.BoxGeometry(0.02, 0.07, 0.02), M.wood, -0.4 + i * 0.1, 0.02, 0, { parent: rake });
    rake.position.copy(zen.toWorld(-zen.w / 2 - 1.3, -zen.d / 2 + 1.5)).setY(0.04);
    rake.rotation.x = Math.PI / 2; // lying flat, handle toward +Z
    this.ctx.scene.add(rake);
    this.rakeRest = { position: rake.position.clone(), quaternion: rake.quaternion.clone() };
  }

  // ---- Where he may go ----
  // Like the animals he keeps out of the pond and away from the fence, and walks round
  // anything solid; unlike them he may walk on the gravel and into the tea house. He
  // never sets foot on the bridge. `ignore` is a collider he means to walk up to.
  blocked(x, z, ignore = null) {
    const c = this.pond.group.position;
    if (Math.hypot(x - c.x, z - c.z) < this.pond.radius + 1.2) return true;
    if (Math.abs(x - c.x) < BRIDGE_WIDTH / 2 + 1 && Math.abs(z - c.z) < BRIDGE_SPAN / 2 + 1) return true;
    if (Math.hypot(x, z) > this.fenceR - 2) return true;
    if (this.ctx.physics.hitsSolid(x, z, this.radius, this.solid, ignore)) return true;
    return this.playerAt(x, z);
  }

  // Is the player standing at (x, z)? He waits for them to step aside.
  playerAt(x, z) {
    const p = cameraGroup.position;
    return !player.flyMode && p.y - PLAYER_HEIGHT < this.y + 2 && Math.hypot(p.x - x, p.z - z) < this.radius + 0.5;
  }

  // A free spot between minD and maxD from `near`, or null.
  openSpot(near, minD, maxD) {
    for (let i = 0; i < 30; i++) {
      const a = Math.random() * Math.PI * 2, d = minD + Math.random() * (maxD - minD);
      const x = near.x + Math.cos(a) * d, z = near.z + Math.sin(a) * d;
      if (!this.blocked(x, z)) return { x, z };
    }
    return null;
  }

  // ---- The player ----
  greet() {
    if (this.greetT > 0) return;
    this.greetT = GREET_DUR;
    showToast('The Gardener bows.');
  }

  // 0…1: how far into his bow he is. He turns to face you first, then bows, holds it
  // and straightens up.
  bowAmount() {
    if (this.greetT <= 0) return 0;
    return clamp(Math.min(GREET_DUR - this.greetT - 0.5, this.greetT - 0.1) / 0.5, 0, 1);
  }

  // Can he turn on the spot right now? Not while kneeling, crouching or raking.
  canTurn() {
    return this.poseName === 'stand' || this.poseName === 'behind';
  }

  // ---- Each frame ----
  update(dt, t) {
    this.dt = dt;
    if (this.greetT > 0) {
      // Greeting the player pauses whatever he's doing: the activity's coroutine
      // simply isn't resumed until he's done.
      this.greetT -= dt;
      this.wantSpeed = 0;
      const p = cameraGroup.position;
      if (this.canTurn()) this.turnToward(Math.atan2(p.x - this.x, p.z - this.z), 3);
    } else {
      if (env.nightMix > 0.5 && this.activity !== 'tea') this.start('tea'); // nightfall: to the tea house
      if (!this.task) this.start(this.pickActivity());
      if (this.task.next().done) this.task = null;
    }
    this.move(dt);
    this.syncSolid();
    this.animate(dt, t);
  }

  // Step along `heading` at `speed`, unless something's in the way.
  // Sets `moved`: how far he actually got this frame (negative backwards), which drives
  // the walk cycle, so his legs stop when he does.
  move(dt) {
    this.moved = 0;
    this.speed += clamp(this.wantSpeed - this.speed, -4 * dt, 3 * dt);
    if (Math.abs(this.speed) < 0.01) return;
    const dx = Math.sin(this.heading) * this.speed * dt, dz = Math.cos(this.heading) * this.speed * dt;
    let nx = this.x + dx, nz = this.z + dz;
    if (this.playerAt(nx, nz)) { this.speed = 0; return; }   // wait for them, without counting it as stuck
    if (!this.scripted && this.blocked(nx, nz)) {
      // Slide along whatever's in the way: keep whichever half of the step (along X or
      // along Z) is still free, as long as it actually gets him somewhere. Brushing past
      // an edge then doesn't stop him dead.
      const step = Math.abs(this.speed * dt);
      if (Math.abs(dx) > step * 0.2 && !this.blocked(nx, this.z)) nz = this.z;
      else if (Math.abs(dz) > step * 0.2 && !this.blocked(this.x, nz)) nx = this.x;
      else { this.speed = 0; this.stuck += dt; return; }
    }
    this.moved = Math.sign(this.speed) * Math.hypot(nx - this.x, nz - this.z);
    this.x = nx;
    this.z = nz;
    this.stuck = 0;
  }

  // Turn toward `angle` at up to `rate` radians/second; returns how far off he still is.
  turnToward(angle, rate) {
    let diff = angle - this.heading;
    diff = Math.atan2(Math.sin(diff), Math.cos(diff));
    this.heading += clamp(diff, -rate * this.dt, rate * this.dt);
    return diff;
  }

  // One frame of walking toward (x, z), stopping `stop` short of it: feelers pick a
  // free heading (as for the dog), and like an old man he turns on the spot before he
  // walks. (Creeping forward while turning hard would send him round in circles.)
  steer(x, z, speed, stop = 0) {
    const via = this.detour(x, z);
    if (via) { x = via.x; z = via.z; stop = 0; }
    const d = Math.hypot(x - this.x, z - this.z), s = this.avoidSide, reach = clamp(d - stop, 0.25, 0.8);
    // Each feeler checks a point close by as well as one further out: brushing past the
    // corner of a box, the far point can be clear while the very next step isn't.
    const desired = Math.atan2(x - this.x, z - this.z);
    const free = FEELERS.map((o) => o * s).map((off) => ({ angle: desired + off, off })).find(({ angle }) =>
      [0.25, reach].every((r) => !this.blocked(this.x + Math.sin(angle) * r, this.z + Math.cos(angle) * r)));
    if (!free) { this.wantSpeed = 0; return; }
    if (free.off !== 0) this.avoidSide = Math.sign(free.off);
    const diff = this.turnToward(free.angle, 2.5);
    this.wantSpeed = Math.abs(diff) > 1 ? 0 : Math.min(speed, d - stop + 0.2);
  }

  // Feelers only see a step ahead, so they handle round obstacles but get trapped in
  // hollows. The one big hollow here is where the bridge meets the pond: the pond and
  // the bridge together are a long barrier across the middle of the garden. So if the
  // straight line to (x, z) would cross the bridge's line within that barrier, he
  // heads first for a point just past whichever end of the bridge is the shorter way
  // round. Once he's there, the line no longer crosses, and he carries on to (x, z).
  detour(x, z) {
    const c = this.pond.group.position, half = BRIDGE_SPAN / 2 + 1; // the bridge's no-go box reaches this far
    const ax = this.x - c.x, bx = x - c.x;
    if (ax * bx >= 0) return null;                                  // doesn't cross the bridge's line
    const zc = this.z + (z - this.z) * (ax / (ax - bx));
    if (Math.abs(zc - c.z) > half + 0.5) return null;               // crosses beyond its ends
    const ends = [{ x: c.x, z: c.z + half + 2 }, { x: c.x, z: c.z - half - 2 }];
    const len = (e) => Math.hypot(e.x - this.x, e.z - this.z) + Math.hypot(x - e.x, z - e.z);
    return len(ends[0]) <= len(ends[1]) ? ends[0] : ends[1];
  }

  // ---- Activities ----
  pickActivity() {
    if (env.nightMix > 0.5) return 'tea';
    const weights = {
      admire: 3, view: 1, tea: 1.5,
      feed: this.feeding.pellets.length ? 0 : 2,
      rake: this.zenGarden.prints >= 8 ? 4 : 1,      // a good few footprints in the gravel? Off to rake them
      pet: this.petCandidate() ? 2.5 : 0,
      // A bowl running low? It soon becomes the thing to do.
      fill: this.bowls.lowest() < 0.25 ? 5 : this.bowls.lowest() < 0.6 ? 0.8 : 0,
    };
    delete weights[this.lastActivity];               // something different each time
    const total = Object.values(weights).reduce((a, b) => a + b, 0);
    let r = Math.random() * total;
    for (const [name, w] of Object.entries(weights)) if ((r -= w) < 0) return name;
    return 'admire';
  }

  // Start an activity, dropping whatever he was doing.
  start(name) {
    this.task?.return(); // runs the old activity's `finally`, which tidies up
    this.activity = this.lastActivity = name;
    this.task = this.run(name);
  }

  *run(name) {
    try {
      // Anything but tea starts by leaving the tea house, if he's in it.
      if (name !== 'tea' && this.teaHouse.contains(this.x, this.z)) yield* this.leaveHouse();
      yield* this[name]();
    } finally {
      this.overlay = null;
      this.poseName = 'stand';
      this.scripted = false;
      this.wantSpeed = 0;
      this.lookAt = null;
      this.pouch.visible = false;
      if (this.held) this.held.want = 0;
      if (this.rakeHeld) this.putRakeDown(true);
      if (this.bucketHeld) this.putBucketDown(true);
      this.activity = null;
    }
  }

  // -- Small steps that activities are made of. Each is a generator: `yield* step()`.
  *wait(seconds) {
    for (let t = 0; t < seconds; t += this.dt) yield;
  }

  // Walk to `goal` ({ x, z }, or a function returning one, for a moving target).
  // Returns true on arrival, false if he gave up (stuck, or too long).
  *walkTo(goal, { tol = 0.4, timeout = 60, speed = SPEED } = {}) {
    const at = typeof goal === 'function' ? goal : () => goal;
    this.stuck = 0;
    // Progress check: if he hasn't got nearer (to where he's heading, detours included)
    // for a while, he's going round in circles somewhere, and gives up.
    let best = Infinity, sinceBest = 0, aiming = null;
    for (let time = 0; ; time += this.dt) {
      const g = at();
      const d = Math.hypot(g.x - this.x, g.z - this.z);
      if (d < tol) { this.wantSpeed = 0; return true; }
      const via = this.detour(g.x, g.z), aim = via ?? g, ad = Math.hypot(aim.x - this.x, aim.z - this.z);
      const key = via ? via.z : 'goal';
      if (key !== aiming) { aiming = key; best = Infinity; }     // a new target: start counting afresh
      if (ad < best - 0.5) { best = ad; sinceBest = 0; } else sinceBest += this.dt;
      if (time > timeout || this.stuck > 3 || sinceBest > 12) { this.wantSpeed = 0; return false; }
      this.steer(g.x, g.z, speed, tol * 0.5);
      yield;
    }
  }

  *face(angle) {
    this.wantSpeed = 0;
    while (Math.abs(this.turnToward(angle, 2.5)) > 0.04) yield;
  }

  // Walk exactly through `points` (world { x, z }), ignoring colliders: for paths laid
  // out by hand, like the way through the tea house door and round the table.
  *followPath(points) {
    this.scripted = true;
    try {
      for (const q of points) {
        for (let d = Infinity; (d = Math.hypot(q.x - this.x, q.z - this.z)) > 0.08;) {
          const diff = this.turnToward(Math.atan2(q.x - this.x, q.z - this.z), 3);
          this.wantSpeed = Math.abs(diff) > 0.6 ? 0 : Math.min(SPEED * 0.8, d * 2 + 0.1);
          yield;
        }
      }
    } finally {
      this.scripted = false;
      this.wantSpeed = 0;
    }
  }

  // The tea house's visiting path in world coordinates, and which of its points he's nearest.
  housePath() {
    const house = this.teaHouse;
    const path = house.visitPath.map(([x, z]) => house.toWorld(x, z).clone());
    const d = (q) => Math.hypot(q.x - this.x, q.z - this.z);
    return { path, nearest: path.indexOf(path.reduce((a, b) => (d(a) <= d(b) ? a : b))) };
  }

  *leaveHouse() {
    const { path, nearest } = this.housePath();
    yield* this.wait(1); // get up
    yield* this.followPath(path.slice(0, nearest + 1).reverse());
  }

  // -- Tea: in through the door, kneel at the table, sip now and then. At night he
  // stays (the lamp is lit), until morning comes.
  *tea() {
    const { seat } = this.teaHouse;
    const { path, nearest } = this.housePath();
    if (this.teaHouse.contains(this.x, this.z)) {
      yield* this.followPath(path.slice(nearest));
    } else {
      if (!(yield* this.walkTo(path[0], { tol: 0.5 }))) return;
      yield* this.followPath(path.slice(1));
    }
    yield* this.face(seat.heading);
    this.poseName = 'seiza';
    yield* this.wait(1.5);
    const cup = this.teaThings.nearestCup(seat.x + 0.8, seat.z + 0.25); // the one by his right hand
    let sips = 2 + Math.floor(Math.random() * 2);
    while (sips > 0 || env.nightMix > 0.3) {
      const night = env.nightMix > 0.3;
      this.overlay = night ? { headX: 0.25 } : null; // at night, eyes down, in thought
      yield* this.wait(night ? 8 + Math.random() * 10 : 4 + Math.random() * 5);
      yield* this.sip(cup);
      if (!night) sips--;
    }
    yield* this.wait(2);
    this.poseName = 'stand';
    yield* this.wait(1.2);
    yield* this.followPath(path.slice(0, -1).reverse());
  }

  // Reach for the cup, lift it, drink, put it back. The cup isn't re-parented to his
  // hand: animate() places it between its spot on the table and the hand, by `w`, and
  // keeps it upright, which is simpler than working out a grip in the hand's frame.
  *sip(cup) {
    this.overlay = REACH_CUP;
    yield* this.wait(0.9);
    this.held = { cup, w: 0, want: 1, tilt: 0, tiltNow: 0 };
    yield* this.wait(0.4);
    this.overlay = SIP;
    yield* this.wait(1);
    this.held.tilt = 0.6;
    SFX.sip(distVol(this.x, this.z, 15));
    yield* this.wait(1.4);
    this.held.tilt = 0;
    this.overlay = REACH_CUP;
    yield* this.wait(0.9);
    this.held.want = 0;
    yield* this.wait(0.5);
    this.overlay = null;
  }

  // -- Feed the koi: walk to the nearest free spot on the bank, throw a few handfuls.
  *feed() {
    const c = this.pond.group.position, R = this.pond.radius + 1.7;
    let best = null, bestD = Infinity;
    for (let i = 0; i < 24; i++) {
      const a = Math.random() * Math.PI * 2, x = c.x + Math.cos(a) * R, z = c.z + Math.sin(a) * R;
      const d = Math.hypot(x - this.x, z - this.z) * (0.7 + Math.random() * 0.6);
      if (d < bestD && !this.blocked(x, z)) { best = { x, z }; bestD = d; }
    }
    if (!best || !(yield* this.walkTo(best))) return;
    yield* this.face(Math.atan2(c.x - this.x, c.z - this.z));
    this.lookAt = c;
    this.pouch.visible = true;
    this.overlay = HOLD_POUCH;
    yield* this.wait(1);
    const handfuls = 2 + Math.floor(Math.random() * 2);
    for (let i = 0; i < handfuls; i++) {
      this.overlay = { ...HOLD_POUCH, ...WIND_UP };
      yield* this.wait(0.6);
      this.overlay = { ...HOLD_POUCH, ...THROW };
      yield* this.wait(0.25);
      // The food lands a few units out, toward the middle (pond-local coordinates).
      const dx = this.x - c.x, dz = this.z - c.z, k = (this.pond.radius - 3.5) / Math.hypot(dx, dz);
      this.feeding.drop(dx * k + Math.random() - 0.5, dz * k + Math.random() - 0.5);
      SFX.plop(distVol(this.x, this.z, 30));
      yield* this.wait(0.6);
      this.overlay = HOLD_POUCH;
      yield* this.wait(1.5 + Math.random() * 1.5);
    }
    this.pouch.visible = false;
    this.poseName = 'behind';           // and watch them eat
    this.overlay = { headX: 0.35 };
    yield* this.wait(6 + Math.random() * 4);
  }

  // -- Admire a tree (stand back and look up) or a flower (crouch and touch it).
  *admire() {
    const spot = this.plantSpot();
    if (!spot) return;
    if (!(yield* this.walkTo(spot, { tol: 0.45 }))) return;
    yield* this.face(Math.atan2(spot.look.x - this.x, spot.look.z - this.z));
    this.lookAt = spot.look;
    if (spot.low) {
      this.poseName = 'crouch';
      yield* this.wait(1.2);
      this.overlay = TOUCH;
      yield* this.wait(2 + Math.random() * 2);
      this.overlay = null;
      yield* this.wait(1.5 + Math.random() * 2);
    } else {
      this.poseName = 'behind';
      this.overlay = LOOK_UP;
      yield* this.wait(3 + Math.random() * 3);
      this.overlay = { headX: -0.25 }; // and down along the branches
      yield* this.wait(2 + Math.random() * 3);
    }
    this.overlay = null;
    this.poseName = 'stand';
    this.lookAt = null;
    yield* this.wait(0.8);
  }

  // Somewhere to stand by one of the nearest few plants (not the one he just visited).
  plantSpot() {
    const plants = [
      ...this.trees.list.map((tr) => {
        const g = tr.group.position;
        return { x: g.x, z: g.z, r: tr.constructor.TRUNK_R * tr.group.scale.x + 1.4, low: false };
      }),
      ...this.flowers.spots.map((f) => ({ x: f.x, z: f.z, r: 0.95, low: true })),
    ].filter((pl) => pl.x !== this.lastPlant?.x || pl.z !== this.lastPlant?.z);
    const dist = (pl) => Math.hypot(pl.x - this.x, pl.z - this.z);
    const choices = plants.sort((a, b) => dist(a) - dist(b)).slice(0, 8);
    for (let i = 0; i < 12 && choices.length; i++) {
      const pl = choices[Math.floor(Math.random() * choices.length)];
      const a = Math.random() * Math.PI * 2, x = pl.x + Math.cos(a) * pl.r, z = pl.z + Math.sin(a) * pl.r;
      if (!this.blocked(x, z)) {
        this.lastPlant = pl;
        return { x, z, look: { x: pl.x, z: pl.z }, low: pl.low };
      }
    }
    return null;
  }

  // -- Stand a while, hands behind his back, looking out at the mountain.
  *view() {
    const spot = this.openSpot(this, 6, 16);
    if (!spot || !(yield* this.walkTo(spot))) return;
    const f = this.fuji.group.position;
    yield* this.face(Math.atan2(f.x - this.x, f.z - this.z));
    this.poseName = 'behind';
    this.overlay = { headX: -0.1 };
    yield* this.wait(8 + Math.random() * 6);
  }

  // -- Pet the dog or a cat.
  // Who's available: the dog, unless it's with the player, and any settled cat nearby.
  petCandidate() {
    const near = (a) => Math.hypot(a.x - this.x, a.z - this.z);
    const options = this.cats.list.filter((c) => c.settled);
    if (!(this.dog.state === 'follow' && !this.dog.leader) && this.dog.state !== 'bowl') options.push(this.dog); // not while it eats
    return options.filter((a) => near(a) < 30).sort((a, b) => near(a) - near(b))[0] ?? null;
  }

  *pet() {
    const animal = this.petCandidate();
    if (!animal) return;
    const isDog = animal === this.dog;
    const available = () => (isDog ? !(this.dog.state === 'follow' && !this.dog.leader) : animal.settled);
    const reach = isDog ? 1.25 : 1;
    this.stuck = 0;
    // Walk up to it; once close, ask it to stay put.
    for (let time = 0; ; time += this.dt) {
      if (!available() || time > 45 || this.stuck > 3) { this.wantSpeed = 0; return; }
      const d = Math.hypot(animal.x - this.x, animal.z - this.z);
      if (d < 5) { if (isDog) this.dog.hold(this, 8); else animal.hold(8); }
      if (d < reach) break;
      this.steer(animal.x, animal.z, SPEED, reach);
      yield;
    }
    yield* this.face(Math.atan2(animal.x - this.x, animal.z - this.z));
    this.lookAt = animal;
    this.poseName = 'crouch';
    yield* this.wait(1);
    const liked = isDog ? (animal.pet(this), true) : animal.pet(this);
    if (liked) {
      for (let t = 0; t < 3.5; t += this.dt) {
        this.overlay = { rShX: -0.5 + Math.sin(t * 5) * 0.18, rEl: -0.1, lean: 0.1 }; // stroking
        yield;
      }
    } else {
      this.overlay = { headX: -0.1 }; // the cat walks off; he watches it go
      yield* this.wait(2);
    }
    this.overlay = null;
    this.poseName = 'stand';
    yield* this.wait(1.5);
  }

  // -- Fill the pets' bowls: kibble from the bin into the dog's and the cats' bowls,
  // then water from the bucket. Then he stands back a while, to see who comes.
  *fill() {
    const bowls = this.bowls;
    const food = bowls.list.filter((b) => b !== bowls.water && b.level < 0.7);
    if (food.length) {
      if (!(yield* this.walkTo(bowls.binStand, { tol: 0.35 }))) return;
      yield* this.faceRow();
      this.poseName = 'crouch';            // lift the lid and fill the bag
      yield* this.wait(0.8);
      this.overlay = TOUCH;
      yield* this.wait(1.2);
      this.pouch.visible = true;
      this.overlay = HOLD_POUCH;
      this.poseName = 'stand';
      yield* this.wait(0.6);
      for (const bowl of food) yield* this.fillBowl(bowl, POUR_POUCH, HOLD_POUCH);
      this.pouch.visible = false;
      this.overlay = null;
    }
    if (bowls.water.level < 0.7) {
      if (!(yield* this.walkTo(bowls.bucketStand, { tol: 0.35 }))) return;
      yield* this.faceRow();
      this.poseName = 'crouch';
      yield* this.wait(0.8);
      this.bucketHeld = { w: 0, want: 1, tilt: 0, tiltNow: 0 };
      yield* this.wait(0.6);
      this.poseName = 'stand';
      yield* this.wait(0.6);
      yield* this.fillBowl(bowls.water, POUR_BUCKET, null);
      if (yield* this.walkTo(bowls.bucketStand, { tol: 0.35 })) {
        yield* this.faceRow();
        this.poseName = 'crouch';
        yield* this.wait(0.8);
      }
      this.putBucketDown(false);
      yield* this.wait(0.6);
      this.poseName = 'stand';
    }
    // Step back and watch, hands behind his back.
    const p = bowls.group.position, spot = { x: p.x + 1, z: p.z + 3.2 };
    if (yield* this.walkTo(spot, { tol: 0.6, timeout: 15 })) {
      yield* this.face(Math.atan2(p.x - this.x, p.z - this.z));
      this.lookAt = p;
      this.poseName = 'behind';
      this.overlay = { headX: 0.2 };
      yield* this.wait(5 + Math.random() * 4);
    }
  }

  // The bowls stand in a row along the tea house wall, which lies to the north (-Z).
  *faceRow() {
    yield* this.face(Math.PI);
  }

  // Walk up to a bowl (on whichever side is free), crouch, and pour: the `pour` gesture,
  // then back to `after`. The bowl fills over a second or two (Bowls.update).
  *fillBowl(bowl, pour, after) {
    const spot = [0, 0.9, -0.9].map((a) => ({ x: bowl.x + Math.sin(a), z: bowl.z + Math.cos(a) }))
      .find((q) => !this.blocked(q.x, q.z));
    if (!spot || !(yield* this.walkTo(spot, { tol: 0.3, timeout: 30 }))) return;
    yield* this.face(Math.atan2(bowl.x - this.x, bowl.z - this.z));
    this.lookAt = bowl;
    this.poseName = 'crouch';
    yield* this.wait(0.8);
    this.overlay = after ? { ...after, ...pour } : pour;
    yield* this.wait(0.5);
    if (this.bucketHeld) this.bucketHeld.tilt = 1.1;
    this.bowls.fill(bowl);
    if (this.bucketHeld) SFX.pour(distVol(this.x, this.z, 20)); else SFX.kibble(distVol(this.x, this.z, 20));
    yield* this.wait(1.8);
    if (this.bucketHeld) this.bucketHeld.tilt = 0;
    this.overlay = after;
    yield* this.wait(0.5);
    this.poseName = 'stand';
    this.lookAt = null;
    yield* this.wait(0.5);
  }

  // Let go of the bucket: animateBucket() eases it back onto its stone (or `snap` puts
  // it straight there, if he's interrupted somewhere else).
  putBucketDown(snap) {
    if (!this.bucketHeld) return;
    this.bucketHeld.want = 0;
    this.bucketHeld.tilt = 0;
    if (snap) {
      this.bowls.bucket.position.copy(this.bowls.bucketRest);
      this.bowls.bucket.rotation.set(0, 0, 0);
      this.bucketHeld = null;
    }
  }

  // -- Rake the gravel: fetch the rake, make a few slow passes along the raked lines,
  // and put the rake back. The raking itself is symbolic: as he sets to work, every
  // footprint is smoothed away at once (zenGarden.smooth()), rather than strip by strip
  // under the rake.
  *rake() {
    if (!(yield* this.fetchRake())) return;
    this.zenGarden.smooth();
    const zen = this.zenGarden, p = zen.group.position;
    const passes = 2 + Math.floor(Math.random() * 2);
    for (let i = 0; i < passes; i++) {
      const z = p.z - zen.d / 2 + 0.6 + Math.random() * (zen.d - 1.2);
      const dir = Math.random() < 0.5 ? 1 : -1;
      // The longest stretch of that line that's clear of the rocks.
      const seg = this.rakeSegments(z, dir).sort((u, v) => (v[1] - v[0]) - (u[1] - u[0]))[0];
      if (seg && !(yield* this.rakeSegment(seg, z, dir))) break;
    }
    yield* this.returnRake();
  }

  // Where to stand to pick up (or put down) the rake: beside its handle.
  rakeStand() {
    const r = this.rakeRest.position;
    for (const [dx, dz] of [[-0.7, 0.6], [0.7, 0.6], [-0.7, -0.3], [0.7, 1.4]]) {
      if (!this.blocked(r.x + dx, r.z + dz)) return { x: r.x + dx, z: r.z + dz };
    }
    return { x: r.x - 0.7, z: r.z + 0.6 };
  }

  *fetchRake() {
    if (!(yield* this.walkTo(this.rakeStand(), { tol: 0.35 }))) return false;
    const r = this.rakeRest.position;
    yield* this.face(Math.atan2(r.x - this.x, r.z + 0.6 - this.z));
    this.poseName = 'crouch';
    yield* this.wait(0.7);
    // attach() re-parents an object but keeps where it is in the world (add() would
    // keep its local position instead, and it would jump). animate() then eases it
    // from there into his hand.
    this.group.attach(this.rakeTool);
    this.rakeHeld = true;
    this.rakeMode = 'carry';
    this.poseName = 'stand';
    yield* this.wait(0.6);
    return true;
  }

  *returnRake() {
    if (yield* this.walkTo(this.rakeStand(), { tol: 0.35 })) {
      const r = this.rakeRest.position;
      yield* this.face(Math.atan2(r.x - this.x, r.z + 0.6 - this.z));
      this.poseName = 'crouch';
      yield* this.wait(0.6);
    }
    this.putRakeDown(false);
    this.poseName = 'stand';
    yield* this.wait(0.5);
  }

  // Back to the scene; animate() eases it to its resting place (or `snap` puts it straight there).
  putRakeDown(snap) {
    this.ctx.scene.attach(this.rakeTool);
    this.rakeHeld = false;
    this.rakeMode = 'carry';
    if (snap) {
      this.rakeTool.position.copy(this.rakeRest.position);
      this.rakeTool.quaternion.copy(this.rakeRest.quaternion);
    }
  }

  // The stretches of the line z (across the gravel, along X) that the rake's head can
  // travel: the head must clear the rocks, and his feet, REACH behind it, must have
  // room too. Returned as [x0, x1] pairs. dir 1 faces +X and steps back west, dir -1
  // the reverse.
  rakeSegments(z, dir) {
    const zen = this.zenGarden, p = zen.group.position;
    const x0 = p.x - zen.w / 2 + 0.1, x1 = p.x + zen.w / 2 - 0.1;
    const ok = (hx) => !this.blocked(hx - dir * REACH, z) && !this.ctx.physics.hitsSolid(hx, z, 0.3, this.solid);
    const segs = [];
    let start = null;
    for (let hx = x0; hx <= x1 + 1e-6; hx += 0.1) {
      if (ok(hx)) {
        if (start === null) start = hx;
      } else if (start !== null) {
        if (hx - 0.1 - start > 2) segs.push([start, hx - 0.1]);
        start = null;
      }
    }
    if (start !== null && x1 - start > 2) segs.push([start, x1]);
    return segs;
  }

  // Rake one stretch: face along the line, then step slowly backwards, drawing the
  // rake through the gravel ahead of him, which is how it's really done.
  *rakeSegment([a, b], z, dir) {
    const facing = dir * Math.PI / 2;
    const from = dir > 0 ? b : a, to = dir > 0 ? a : b; // the head travels from → to
    if (!(yield* this.walkTo({ x: from - dir * REACH, z }, { tol: 0.2 }))) return false;
    yield* this.face(facing);
    this.rakeMode = 'work';
    this.poseName = 'rake';
    yield* this.wait(0.7);
    const headX = () => this.x + Math.sin(this.heading) * REACH;
    let scrape = 0;
    this.stuck = 0;
    while ((headX() - to) * dir > 0 && this.stuck < 2) {
      this.turnToward(facing, 2);
      this.wantSpeed = -RAKE_SPEED;
      if ((scrape -= this.dt) <= 0) { scrape = 1.1; SFX.rake(distVol(this.x, this.z, 25)); }
      yield;
    }
    this.wantSpeed = 0;
    this.rakeMode = 'carry';
    this.poseName = 'stand';
    yield* this.wait(0.6);
    return true;
  }

  // ---- Turning the state into a pose ----
  animate(dt, t) {
    const ease = Math.min(1, dt * 5), J = this.joints;
    // Ease every joint toward pose + gesture + bow.
    const want = { ...POSES[this.poseName] };
    if (this.overlay) for (const k in this.overlay) want[k] += this.overlay[k];
    if (this.rakeHeld && this.rakeMode === 'carry') for (const k in CARRY) want[k] += CARRY[k];
    const bow = this.bowAmount();
    want.lean += bow * (this.poseName === 'seiza' ? 0.7 : 0.85);
    want.headX += bow * 0.35;
    for (const k in want) J[k] += (want[k] - J[k]) * ease;

    // Walk cycle on top. The phase advances with distance walked, so the feet don't
    // slide; walking backwards (raking) runs it in reverse. A knee bends while its
    // leg swings forward, to lift the foot clear.
    const vel = dt > 0 ? this.moved / dt : 0;
    const moving = clamp(Math.abs(vel) / 0.9, 0, 1);
    this.phase += this.moved * 4;
    const swing = Math.sin(this.phase) * 0.38 * moving, c = Math.cos(this.phase);
    const lTh = J.lTh + swing, rTh = J.rTh - swing;
    const lKn = J.lKn + Math.max(0, -c) * 0.7 * moving, rKn = J.rKn + Math.max(0, c) * 0.7 * moving;
    const armSwing = this.poseName === 'stand' ? swing * 0.6 : 0;
    const work = this.rakeHeld && this.rakeMode === 'work';
    const stroke = work ? Math.sin(t * 2.4) * 0.1 * Math.min(1, Math.abs(this.speed) / RAKE_SPEED) : 0;

    this.torso.rotation.x = J.lean;
    this.head.rotation.x = J.headX;
    this.legs[0].thigh.rotation.x = lTh;
    this.legs[0].knee.rotation.x = lKn;
    this.legs[1].thigh.rotation.x = rTh;
    this.legs[1].knee.rotation.x = rKn;
    const [L, R] = this.arms;
    L.shoulder.rotation.set(J.lShX - armSwing - stroke * 1.2, 0, J.lShZ);
    L.elbow.rotation.set(J.lEl, 0, J.lElZ);
    R.shoulder.rotation.set(J.rShX + (this.rakeHeld || this.bucketHeld ? 0 : armSwing) - stroke * 1.2, 0, -J.rShZ);
    R.elbow.rotation.set(J.rEl, 0, -J.rElZ);

    // Hip height from the legs: how far down each foot reaches (thigh and shin
    // projected onto the vertical), so the lower foot rests on the ground.
    const drop = (th, kn) => L_THIGH * Math.cos(th) + L_SHIN * Math.cos(th + kn);
    this.hips.position.y = Math.max(Math.max(drop(lTh, lKn), drop(rTh, rKn)) + SOLE, SEAT);
    // Step up onto the doorstep, the tea house floor or the gravel's edging smoothly.
    this.y += (this.groundAt(this.x, this.z) - this.y) * Math.min(1, dt * 10);
    this.group.position.set(this.x, this.y, this.z);
    this.group.rotation.y = this.heading;

    // Eyes on the player when they're near, else on whatever he's busy with.
    const p = cameraGroup.position;
    const near = !player.flyMode && Math.hypot(p.x - this.x, p.z - this.z) < 6;
    const target = near ? p : this.lookAt;
    let look = 0;
    if (target) {
      look = Math.atan2(target.x - this.x, target.z - this.z) - this.heading;
      look = clamp(Math.atan2(Math.sin(look), Math.cos(look)), -1.1, 1.1);
    }
    this.lookYaw += (look - this.lookYaw) * ease * 0.6;
    this.head.rotation.y = this.lookYaw;

    this.animateRake(ease, stroke);
    this.animateCup(dt);
    this.animateBucket(dt);
  }

  // In his hands the rake eases to where the activity wants it: upright at his side,
  // or out in front with its teeth in the gravel. Put down, it eases back to its spot.
  animateRake(ease, stroke) {
    const r = this.rakeTool;
    if (this.rakeHeld) {
      const work = this.rakeMode === 'work';
      tmp.set(work ? 0 : -0.36, work ? 0.03 : 0.1, work ? REACH + stroke : 0.2);
      tmpQ.setFromEuler(tmpE.set(work ? -0.73 : -0.08, 0, 0)); // handle tilted back to his hands
    } else {
      tmp.copy(this.rakeRest.position);
      tmpQ.copy(this.rakeRest.quaternion);
    }
    r.position.lerp(tmp, ease);
    r.quaternion.slerp(tmpQ, ease); // slerp: the rotation version of lerp
  }

  // A held cup sits between its home on the table (w = 0) and his right hand (w = 1),
  // upright, tipped toward him by `tilt` while he drinks. Positions are in the tea
  // things' frame, so the hand's world position is converted into it.
  animateCup(dt) {
    const h = this.held;
    if (!h) return;
    const k = Math.min(1, dt * 4);
    h.w += (h.want - h.w) * k;
    h.tiltNow += (h.tilt - h.tiltNow) * k;
    const g = h.cup.group;
    this.hands.r.getWorldPosition(tmp);
    this.teaThings.group.worldToLocal(tmp);
    tmp.y -= 0.05;
    g.position.lerpVectors(h.cup.home, tmp, h.w);
    // Tip the rim toward him: he faces (sin h, cos h), so tilt about the axis across that.
    const tilt = h.tiltNow * h.w;
    g.rotation.set(-tilt * Math.cos(this.heading), 0, tilt * Math.sin(this.heading));
    if (h.want === 0 && h.w < 0.01) {
      g.position.copy(h.cup.home);
      g.rotation.set(0, 0, 0);
      this.held = null;
    }
  }

  // The bucket works the same way, between its stone (w = 0) and his right hand
  // (w = 1), in the bowls' frame. It hangs from its handle, and pouring tips its rim
  // away from him, toward the bowl.
  animateBucket(dt) {
    const h = this.bucketHeld;
    if (!h) return;
    const k = Math.min(1, dt * 4), b = this.bowls.bucket;
    h.w += (h.want - h.w) * k;
    h.tiltNow += (h.tilt - h.tiltNow) * k;
    this.hands.r.getWorldPosition(tmp);
    this.bowls.group.worldToLocal(tmp);
    b.position.lerpVectors(this.bowls.bucketRest, tmp, h.w);
    const tilt = h.tiltNow * h.w;
    b.rotation.set(tilt * Math.cos(this.heading), 0, -tilt * Math.sin(this.heading));
    if (h.want === 0 && h.w < 0.01) {
      b.position.copy(this.bowls.bucketRest);
      b.rotation.set(0, 0, 0);
      this.bucketHeld = null;
    }
  }
}
