import * as THREE from 'three';
import { scene } from '../core/scene.js';
import { mat } from '../core/materials.js';
import { clamp } from '../core/random.js';
import { cameraGroup } from '../core/camera.js';
import { env } from '../core/state.js';
import { FENCE_R, FENCE_GAP } from '../core/layout.js';
import { surfaceHeightAt } from '../core/physics.js';
import { trees } from '../world/trees.js';
import { lanterns } from '../world/lanterns.js';
import { torii } from '../world/torii.js';
import { teaHouse } from '../world/teaHouse.js';
import { SFX, distVol } from '../audio/sfx.js';
import { dog, dogBlocked } from './dog.js';

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

// Bird faces +Z, standing on its feet at the origin.
function makeBird(sp) {
  const m = (c, opts) => mat(c, { roughness: 0.8, ...opts });
  const BODY = m(sp.body), WING = m(sp.wing, { side: THREE.DoubleSide }), DARK = m(0x111111);
  const blob = (material, sx, sy, sz, x, y, z, parent) => {
    const mesh = new THREE.Mesh(new THREE.IcosahedronGeometry(1, 0), material);
    mesh.scale.set(sx, sy, sz);
    mesh.position.set(x, y, z);
    parent.add(mesh);
    return mesh;
  };
  const root = new THREE.Group();
  // Euler angles are applied in a fixed order. 'YXZ' means: turn to the heading (Y)
  // first, then pitch nose up/down (X) about the bird's own sideways axis. With the
  // default 'XYZ' order, pitching while facing sideways would roll the bird instead.
  root.rotation.order = 'YXZ'; // heading first, then pitch in flight
  root.scale.setScalar(sp.scale);
  blob(BODY, 0.065, 0.065, 0.1, 0, 0.075, 0, root).castShadow = true;
  blob(m(sp.belly), 0.05, 0.045, 0.07, 0, 0.055, 0.02, root);
  const head = new THREE.Group();
  head.position.set(0, 0.12, 0.075);
  root.add(head);
  blob(m(sp.head), 0.05, 0.05, 0.05, 0, 0, 0, head);
  const beak = new THREE.Mesh(new THREE.ConeGeometry(0.014, 0.045, 4).rotateX(Math.PI / 2), m(sp.beak));
  beak.position.set(0, -0.005, 0.06);
  head.add(beak);
  for (const s of [1, -1]) {
    if (sp.eyeRing) blob(m(0xffffff), 0.016, 0.016, 0.016, s * 0.031, 0.012, 0.03, head);
    blob(DARK, 0.01, 0.01, 0.01, s * 0.036, 0.012, 0.031, head);
    const legM = new THREE.Mesh(new THREE.CylinderGeometry(0.005, 0.005, 0.04, 3), DARK);
    legM.position.set(s * 0.02, 0.02, 0);
    root.add(legM);
  }
  const tail = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.01, 0.08), WING);
  tail.position.set(0, 0.085, -0.12);
  root.add(tail);
  // Wings hinge at the shoulders: folded back along the body, or spread to flap.
  const wings = [1, -1].map((s) => {
    const pivot = new THREE.Group();
    pivot.position.set(s * 0.05, 0.1, 0.01);
    const w = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.01, 0.07), WING);
    w.position.x = s * 0.065;
    pivot.add(w);
    root.add(pivot);
    return { pivot, s };
  });
  scene.add(root);
  return { root, head, tail, wings };
}

// Perches are points on (and moving with) objects, so birds on a tree sway with its crown.
// Each perch is stored in its parent's LOCAL coordinates and converted to world space
// whenever it's needed, so it automatically follows the parent's current transform.
const perches = [];
const perchWorld = (perch, out) => {
  out.copy(perch.local);
  return perch.parent ? perch.parent.localToWorld(out) : out;
};
{
  // Make sure every object's world matrix is current before converting coordinates.
  scene.updateMatrixWorld(true);
  const tmp = new THREE.Vector3();
  const addPerch = (parent, x, y, z) => {
    const perch = { parent, local: new THREE.Vector3(x, y, z), bird: null };
    perch.high = perchWorld(perch, tmp).y > BIRD_HIGH;
    perches.push(perch);
  };
  for (const l of lanterns) addPerch(l, 0, 3.1, 0);                 // roof tip
  for (const tr of trees) {
    const kids = tr.crown.children;
    if (kids[0].geometry.type === 'ConeGeometry') {                 // pine: the top cone's tip
      const top = kids.reduce((a, b) => (a.position.y > b.position.y ? a : b));
      addPerch(tr.crown, 0, top.position.y + top.geometry.parameters.height / 2 - 0.05, 0);
    } else {                                                        // blob crown: the two highest blobs
      const top = (c) => c.position.y + c.geometry.parameters.radius * 0.8;
      for (const c of [...kids].sort((a, b) => top(b) - top(a)).slice(0, 2)) {
        addPerch(tr.crown, c.position.x, top(c), c.position.z);
      }
    }
  }
  for (const x of [-5.5, -2.75, 0, 2.75, 5.5]) addPerch(torii, x, 7.65, 0);            // top beam
  addPerch(teaHouse.group, 0, teaHouse.floorY + 2.8 + 0.8 + 2.6, 0);                    // roof peak
  const gapA = Math.asin(FENCE_GAP / FENCE_R);
  for (let i = 0; i < 10; i++) {                                                        // top fence rail
    const a = gapA + 0.1 + (Math.PI * 2 - 2 * gapA - 0.2) * Math.random();
    addPerch(null, FENCE_R * Math.sin(a), 1.65, FENCE_R * Math.cos(a));
  }
}
// A spot on open grass for pecking (a one-off perch, not in the list).
function groundSpot() {
  for (let i = 0; i < 20; i++) {
    const a = Math.random() * Math.PI * 2, d = 8 + Math.random() * 32;
    const x = Math.cos(a) * d, z = Math.sin(a) * d;
    if (!dogBlocked(x, z)) {
      return { parent: null, local: new THREE.Vector3(x, surfaceHeightAt(x, z), z), ground: true, high: false, bird: null };
    }
  }
  return null;
}

export const birds = BIRD_FLOCK.map((name) => {
  const sp = BIRD_SPECIES[name];
  const b = {
    ...makeBird(sp), species: name, sp,
    state: 'perched', perch: null, flight: null, fold: 1,
    timer: 3 + Math.random() * 12, lookT: 0, lookYaw: 0, peckT: 1, phase: Math.random() * 6,
  };
  const free = perches.filter((p) => !p.bird && (!sp.highOnly || p.high));
  b.perch = free[Math.floor(Math.random() * free.length)];
  b.perch.bird = b;
  b.root.rotation.y = Math.random() * Math.PI * 2;
  return b;
});

// Scratch vectors, reused every frame: allocating new ones in a per-frame loop
// would create garbage for the collector to clean up, causing hitches.
const bTmpA = new THREE.Vector3(), bTmpB = new THREE.Vector3(), bTmpC = new THREE.Vector3(), bTmpD = new THREE.Vector3();
// Fly to another perch (or to the grass). `scaredBy` is a position to get away from.
export function takeOff(b, scaredBy = null) {
  const here = perchWorld(b.perch, bTmpA).clone();
  const night = env.nightMix > 0.5;
  let target = null;
  if (!scaredBy && !night && !b.sp.highOnly && Math.random() < 0.25) target = groundSpot();
  if (!target) {
    const options = perches.filter((p) => {
      if (p.bird || p === b.perch || (b.sp.highOnly && !p.high)) return false;
      const w = perchWorld(p, bTmpB);
      const d = w.distanceTo(here);
      if (d < 5 || d > 55) return false;
      return !scaredBy || Math.hypot(w.x - scaredBy.x, w.z - scaredBy.z) > 8;
    });
    if (!options.length) { b.timer = 2; return; }
    target = options[Math.floor(Math.random() * options.length)];
  }
  b.perch.bird = null;
  target.bird = b;
  b.perch = target;
  const dist = perchWorld(target, bTmpB).distanceTo(here);
  const arc = 2 + dist * 0.25;
  b.flight = { from: here, arc, t: 0, dur: (dist + arc) / b.sp.speed + 0.4 };
  b.state = 'flying';
  SFX.flutter(distVol(here.x, here.z, 25) * (b.sp.highOnly ? 1 : 0.6));
}

// `cats` is passed in by the caller rather than imported, because cats.js imports this
// module (cats stalk birds) and modules importing each other is best avoided.
export function updateBirds(dt, t, cats) {
  const p = cameraGroup.position;
  const night = env.nightMix > 0.5;
  for (const b of birds) {
    if (b.state === 'flying') {
      const f = b.flight;
      f.t += dt / f.dur;
      // Smoothstep 3k² − 2k³: an S-curve, so the bird eases out of take-off and into landing.
      const k = Math.min(1, f.t), e = k * k * (3 - 2 * k);
      // The target is re-read every frame, so a bird landing on a swaying tree follows it.
      const to = perchWorld(b.perch, bTmpB);
      const ctrl = bTmpC.copy(f.from).add(to).multiplyScalar(0.5);
      ctrl.y += f.arc;
      // Quadratic Bézier from → ctrl → to: B(e) = (1−e)²·from + 2(1−e)e·ctrl + e²·to.
      // The control point, raised above the midpoint, bends the path into an arc.
      // Its derivative 2(1−e)(ctrl − from) + 2e(to − ctrl) is the flight direction,
      // used for heading and pitch.
      const u = 1 - e;
      b.root.position.copy(f.from).multiplyScalar(u * u)
        .addScaledVector(ctrl, 2 * u * e).addScaledVector(to, e * e);
      const dir = bTmpD.copy(ctrl).sub(f.from).multiplyScalar(2 * u).addScaledVector(bTmpA.copy(to).sub(ctrl), 2 * e);
      if (dir.lengthSq() > 1e-6) {
        b.root.rotation.y = Math.atan2(dir.x, dir.z);
        b.root.rotation.x = clamp(-Math.atan2(dir.y, Math.hypot(dir.x, dir.z)) * 0.6, -0.6, 0.6);
      }
      b.fold += (0 - b.fold) * Math.min(1, dt * 12);
      const flap = k > 0.85 ? 0.35 : Math.sin(t * 28 + b.phase) * 0.9; // glide in to land
      for (const w of b.wings) {
        w.pivot.rotation.y = w.s * 1.45 * b.fold;
        w.pivot.rotation.z = w.s * flap * (1 - b.fold);
      }
      b.head.rotation.set(0, 0, 0);
      if (k >= 1) {
        b.state = 'perched';
        b.root.rotation.x = 0;
        b.timer = 6 + Math.random() * 14;
      }
      continue;
    }

    // Perched: sit on the perch, fold the wings, look about (or sleep).
    const w = perchWorld(b.perch, bTmpA);
    b.root.position.copy(w);
    b.fold += (1 - b.fold) * Math.min(1, dt * 8);
    for (const wing of b.wings) {
      wing.pivot.rotation.y = wing.s * 1.45 * b.fold;
      wing.pivot.rotation.z = 0;
    }
    if (night) {
      b.head.rotation.set(0.7, 0, 0); // head tucked in
    } else {
      b.lookT -= dt;
      if (b.lookT <= 0) {
        b.lookT = 0.4 + Math.random() * 1.4;
        b.lookYaw = (Math.random() - 0.5) * 1.6;
        if (Math.random() < 0.25) b.root.rotation.y += (Math.random() - 0.5) * 2; // hop round
      }
      b.head.rotation.y += (b.lookYaw - b.head.rotation.y) * Math.min(1, dt * 12);
      if (b.perch.ground) { // peck at the grass now and then
        b.peckT -= dt;
        if (b.peckT <= 0) b.peckT = 0.6 + Math.random() * 1.5;
        b.head.rotation.x = b.peckT < 0.25 ? Math.sin(b.peckT / 0.25 * Math.PI) * 0.9 : 0;
      } else {
        b.head.rotation.x = 0;
      }
      b.tail.rotation.x = -0.35 + Math.max(0, Math.sin(t * 3 + b.phase)) * 0.15;
    }

    // Too close? Off it goes — unless it's up out of reach.
    const near = Math.hypot(p.x - w.x, p.z - w.z) < BIRD_SCARE_R && Math.abs(p.y - w.y) < 3.5;
    const touching = p.distanceTo(w) < 2;
    const dogNear = w.y < 2 && Math.hypot(dog.x - w.x, dog.z - w.z) < 2.5;
    // A stalking cat creeps up unnoticed; any other cat this close is spotted.
    const catNear = w.y < 2 && cats.find((c) => c.state !== 'stalk' && Math.hypot(c.x - w.x, c.z - w.z) < 2);
    if (((near && !b.perch.high) || touching)) { takeOff(b, p); continue; }
    if (dogNear) { takeOff(b, { x: dog.x, z: dog.z }); continue; }
    if (catNear) { takeOff(b, { x: catNear.x, z: catNear.z }); continue; }
    if (night && b.perch.ground) { takeOff(b); continue; } // roost for the night
    b.timer -= dt;
    if (b.timer <= 0 && !night) { takeOff(b); continue; }
    if (!night && Math.random() < dt * (b.sp.call === 'caw' ? 0.03 : 0.1)) {
      SFX[b.sp.call](distVol(w.x, w.z, 35));
    }
  }
}
