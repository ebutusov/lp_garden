import * as THREE from 'three';
import { mat } from '../core/materials.js';
import { clamp } from '../core/random.js';
import { cameraGroup } from '../core/camera.js';
import { env } from '../core/state.js';
import { FENCE_R, WATER_LEVEL, inPond } from '../core/layout.js';
import { bridgeDeckTop } from '../core/physics.js';
import { Feature } from '../world/feature.js';
import { Animal } from './animal.js';

// ---- Butterflies ----
// Swallowtails, cabbage whites, sulphurs, little blues and orange commas flutter about
// the garden and land on the low things in it: flowers, stepping stones and rocks.
// They rest with their wings closed over their backs, open them now and then to bask,
// and take off when anything comes near. At night they settle and stay put.
//
// Two techniques are new here:
//  - STEERING. The birds fly along precomputed Bézier arcs, which suits a bird's
//    purposeful flight. A butterfly's flight is all wobble, so it is *steered* instead:
//    each frame it works out a "desired velocity" (towards its goal, plus a drifting
//    random flutter, minus a push away from obstacles) and eases its real velocity
//    towards it. Arrival is the same rule with the speed scaled down near the goal, so
//    it slows, calms its flutter, and settles exactly onto the spot.
//  - VERTEX COLOURS. Each wing is one small triangle fan whose corners carry their own
//    colour; the GPU blends colours across each triangle, so the wing shades from its
//    base colour at the body to a dark edge and a coloured spot. The colours live in
//    the geometry, so every species shares ONE white wing material.
//
// Landing spots come from each low feature's landings() method (see Feature.landingOn),
// just as the birds' perches come from perches().
const SPECIES = {
  swallowtail: { base: 0xf2d35b, edge: 0x1d1b1a, accent: 0x3b6fd1, scale: 1.35, tail: true, flap: 4.5, speed: 1.6 },
  white:       { base: 0xeeece2, edge: 0x5a595e, accent: 0xe4e0d0, scale: 0.95, flap: 6.5, speed: 1.3 },
  sulphur:     { base: 0xf0dc3c, edge: 0xc79a1e, accent: 0xf6e88a, scale: 0.9, flap: 6.5, speed: 1.3 },
  blue:        { base: 0x4f8fe6, edge: 0x1b2852, accent: 0xa8ccff, scale: 0.8, flap: 7, speed: 1.2 },
  orange:      { base: 0xe8822c, edge: 0x4a2412, accent: 0xf4d27a, scale: 1.1, flap: 5.5, speed: 1.5 },
  black:       { base: 0x2c2c36, edge: 0x141418, accent: 0xd0443a, scale: 1.4, tail: true, flap: 4.5, speed: 1.7 },
};
const FLOCK = ['swallowtail', 'white', 'white', 'sulphur', 'blue', 'blue', 'orange', 'orange', 'black', 'white', 'sulphur', 'swallowtail'];
const SCARE_R = 2.2;       // the player this close (horizontally) sends a resting butterfly off
const SCARE_ANIMAL_R = 1.2; // ...and the dog, a cat or the Gardener this close
const BODY_Y = 0.025;      // body height above whatever it stands on

// The right wing's outline, as (x, z, colour) with the hinge at the origin, x outwards
// and z towards the head: forewing first, then hindwing. A triangle fan from the hinge
// covers it, which works because every point is "visible" from the hinge (the outline
// is star-shaped around it). Swallowtails also get a tail on the hindwing.
const WING = [
  [0, 0.03, 'mid'], [0.07, 0.1, 'mid'], [0.15, 0.095, 'edge'], [0.17, 0.045, 'edge'], [0.09, 0.005, 'base'],
  [0.115, -0.045, 'mid'], [0.095, -0.095, 'edge'], [0.04, -0.11, 'accent'], [0, -0.05, 'mid'],
];
const TAIL = [0.075, -0.17, 'edge'];

function wingGeometry(sp) {
  const pts = sp.tail ? [...WING.slice(0, 7), TAIL, ...WING.slice(7)] : WING;
  // THREE.Color converts the sRGB hex into the linear values lighting works in.
  const base = new THREE.Color(sp.base), edge = new THREE.Color(sp.edge);
  const cols = { base, edge, accent: new THREE.Color(sp.accent), mid: base.clone().lerp(edge, 0.4) };
  const pos = [], col = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const [ax, az, ac] = pts[i], [bx, bz, bc] = pts[i + 1];
    pos.push(0, 0, 0, ax, 0, az, bx, 0, bz);
    for (const c of [base, cols[ac], cols[bc]]) col.push(c.r, c.g, c.b);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  geo.computeVertexNormals();
  return geo;
}

// Scratch objects, reused every frame (see birds.js).
const UP = new THREE.Vector3(0, 1, 0);
const tmpA = new THREE.Vector3(), tmpB = new THREE.Vector3(), desired = new THREE.Vector3();
const qUp = new THREE.Quaternion(), qYaw = new THREE.Quaternion();
const euler = new THREE.Euler(0, 0, 0, 'YXZ');

// Is (x, z) inside solid s, seen from above?
const insideSolid = (s, x, z) => (s.r !== undefined
  ? Math.hypot(x - s.x, z - s.z) < s.r
  : x >= s.minX && x <= s.maxX && z >= s.minZ && z <= s.maxZ);

// One butterfly: 'flying' (wandering, or coming in to land on `spot`) or 'landed'.
// Its group's position is its position: unlike the walkers it moves in 3D.
class Butterfly extends Animal {
  constructor(ctx, { species, flock, wingGeo, materials }) {
    super(ctx, { parent: flock.group });
    this.species = species;
    this.sp = SPECIES[species];
    this.flock = flock;
    this.build(wingGeo, materials);
    this.state = 'flying';
    this.vel = new THREE.Vector3();
    this.goal = new THREE.Vector3();  // the waypoint it's wandering to
    this.goalT = 0;                   // ...until it picks another
    this.spot = null;                 // the landing spot it's heading for, or sitting on
    this.lastSpot = null;
    this.bestD = Infinity;            // the closest it has come to `spot`...
    this.stallT = 0;                  // ...and how long since it last got closer
    this.landYaw = 0;                 // which way it faces on the spot
    this.timer = 0;                   // flying: until it looks for somewhere to land; landed: until it leaves
    this.targetQ = new THREE.Quaternion();
    this.flap = Math.random() * 6;    // wing-beat phase
    this.open = 1.4;                  // wing angle: 0 spread flat … ~1.5 closed above the back
    this.wob = Math.random() * 6.3;   // flutter direction, drifting at random
    this.seed = Math.random();
    this.basking = false;
    this.baskT = Math.random() * 3;
  }

  // Faces +Z with its feet at the origin. The body is a child group, so the wing-beat
  // bob doesn't move the butterfly's real position.
  build(wingGeo, { wing, body, antenna }) {
    const root = this.group;
    root.scale.setScalar(this.sp.scale);
    const b = this.body = new THREE.Group();
    b.position.y = BODY_Y;
    root.add(b);
    this.blob(body, 0.013, 0.013, 0.06, 0, 0, -0.01, b, false);    // thorax and abdomen
    this.blob(body, 0.016, 0.016, 0.016, 0, 0.004, 0.058, b, false); // head
    // Both antennae in one LineSegments: pairs of points, each pair one line. Lines are
    // always one pixel wide, which is just right for something this thin.
    const ant = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(0.006, 0.01, 0.068), new THREE.Vector3(0.03, 0.045, 0.13),
      new THREE.Vector3(-0.006, 0.01, 0.068), new THREE.Vector3(-0.03, 0.045, 0.13),
    ]);
    b.add(new THREE.LineSegments(ant, antenna));
    // The left wing is the right one mirrored: a scale of -1 on x. The pivot is the
    // hinge, along the body; turning it about z raises or lowers the wing.
    this.wings = [1, -1].map((s) => {
      const pivot = new THREE.Group();
      pivot.position.set(s * 0.008, 0.008, 0);
      pivot.scale.x = s;
      pivot.add(new THREE.Mesh(wingGeo, wing));
      b.add(pivot);
      return { pivot, s };
    });
  }

  // The orientation it rests in: its up along the surface normal (so it sits flat on a
  // sloping facet of rock), then turned to `landYaw` about that normal.
  landedQuat(out) {
    qUp.setFromUnitVectors(UP, this.spot.normal);
    qYaw.setFromAxisAngle(UP, this.landYaw);
    return out.multiplyQuaternions(qUp, qYaw);
  }

  // The lowest it will fly at (x, z): above the water, the bridge or the ground.
  floorAt(x, z) {
    const deck = bridgeDeckTop(x, z);
    if (deck !== null) return deck + 0.4;
    if (inPond(x, z)) return WATER_LEVEL + 0.5;
    return this.ctx.physics.surfaceHeightAt(x, z) + 0.3;
  }

  // A new waypoint: often over a flower, otherwise somewhere a few steps off. Never
  // inside the tea house, a collider, or over the fence.
  wander() {
    const p = this.group.position, { flowers, teaHouse } = this.flock;
    for (let i = 0; i < 12; i++) {
      let x, z;
      if (flowers.length && Math.random() < 0.4) {
        const f = flowers[Math.floor(Math.random() * flowers.length)].point;
        x = f.x + (Math.random() - 0.5) * 3; z = f.z + (Math.random() - 0.5) * 3;
        if (Math.hypot(x - p.x, z - p.z) > 25) continue;
      } else {
        const a = Math.random() * Math.PI * 2, d = 2 + Math.random() * 8;
        x = p.x + Math.cos(a) * d; z = p.z + Math.sin(a) * d;
      }
      if (Math.hypot(x, z) > FENCE_R - 4 || teaHouse.contains(x, z) || this.ctx.physics.hitsSolid(x, z, 0.5)) continue;
      this.goal.set(x, this.floorAt(x, z) + 0.4 + Math.random() * 1.6, z);
      this.goalT = 2 + Math.random() * 3;
      return;
    }
    this.goal.set(p.x * 0.8, p.y, p.z * 0.8); // boxed in: head back towards the middle
    this.goalT = 1;
  }

  // Pick a free spot to land on: flowers rather than stones, near rather than far,
  // not right next to the player. `nearest` (at nightfall) just takes the closest.
  chooseLanding(nearest) {
    const p = this.group.position, cam = cameraGroup.position;
    let best = null, bestW = 0;
    for (const s of this.flock.landings) {
      if (s.taken || s === this.lastSpot) continue;
      if (Math.hypot(s.point.x - cam.x, s.point.z - cam.z) < SCARE_R + 1) continue;
      const d = p.distanceTo(s.point);
      const w = nearest ? 1 / (1 + d) : (s.kind === 'flower' ? 3 : 1) / (1 + d * d / 60) * Math.random();
      if (w > bestW) { best = s; bestW = w; }
    }
    if (!best) { this.timer = 2; return; }
    this.claim(best);
  }

  // Make `spot` the one it's heading for (and keep anyone else off it).
  claim(spot) {
    spot.taken = this;
    this.spot = spot;
    this.landYaw = Math.random() * Math.PI * 2;
    this.bestD = Infinity;
    this.stallT = 0;
  }

  // Give up on the spot it was heading for (and don't pick it again straight away).
  abandon() {
    this.spot.taken = null;
    this.lastSpot = this.spot;
    this.spot = null;
    this.timer = 3 + Math.random() * 5;
    this.wander();
  }

  // Touch down: sit exactly on the spot.
  settle() {
    this.state = 'landed';
    this.group.position.copy(this.spot.point);
    this.vel.set(0, 0, 0);
    this.timer = 4 + Math.random() * 14;
    this.basking = false;
    this.baskT = 1 + Math.random() * 3;
  }

  // Leave the spot, darting up and away from `from` (or off in any direction).
  takeOff(from = null) {
    if (this.spot) { this.spot.taken = null; this.lastSpot = this.spot; this.spot = null; }
    this.state = 'flying';
    this.timer = 5 + Math.random() * 12;
    const p = this.group.position;
    const a = from ? Math.atan2(p.x - from.x, p.z - from.z) + (Math.random() - 0.5) : Math.random() * Math.PI * 2;
    const lift = from ? 1.6 : 0.8;
    this.vel.set(Math.sin(a) * 1.4, lift, Math.cos(a) * 1.4);
    this.goal.set(p.x + Math.sin(a) * 3, p.y + lift, p.z + Math.cos(a) * 3);
    this.goalT = 1.5;
  }

  update(dt, t) {
    // At night, or in the rain, they settle on the nearest free spot and stay there.
    const night = env.nightMix > 0.5 || env.rainMix > 0.5;
    if (this.state === 'landed') this.rest(dt, t, night);
    else this.fly(dt, t, night);
    this.x = this.group.position.x;
    this.z = this.group.position.z;
  }

  fly(dt, t, night) {
    const p = this.group.position, sp = this.sp;
    if (!this.spot) {
      this.timer -= dt;
      this.goalT -= dt;
      if (night || this.timer <= 0) this.chooseLanding(night);
      if (!this.spot && (this.goalT <= 0 || p.distanceTo(this.goal) < 0.5)) this.wander();
    }

    // Where it's steering for, and how calmly.
    let target, dist, calm = 1;
    if (this.spot) {
      const s = this.spot;
      dist = p.distanceTo(s.point);
      if (dist < 0.03) { this.settle(); return; }
      // Steering is a sum of pushes, and pushes can cancel out: the goal pulling one way,
      // a neighbouring rock pushing the other. Then it hovers in place forever. So it
      // watches its own progress and gives up on a spot it hasn't got closer to lately.
      if (dist < this.bestD - 0.05) { this.bestD = dist; this.stallT = 0; }
      else if ((this.stallT += dt) > 4) { this.abandon(); return; }
      // Aim above the spot, at a point that sinks onto it as the butterfly arrives,
      // so it comes down from above rather than skimming in sideways.
      target = tmpB.copy(s.point).addScaledVector(s.normal, Math.min(0.5, dist * 0.4));
      calm = clamp(dist - 0.2, 0, 1);
    } else {
      target = this.goal;
    }
    const toTarget = desired.copy(target).sub(p);
    const tDist = toTarget.length();
    // Arrival: full speed far off, slowing in proportion to the distance near the spot.
    const speed = this.spot ? clamp(dist * 1.8, 0.12, sp.speed) : sp.speed;
    if (tDist > 1e-4) toTarget.multiplyScalar(speed / tDist);
    // Flutter: a sideways drift whose direction wanders at random, and a slow rise and
    // fall, both fading out on the final approach.
    this.wob += (Math.random() - 0.5) * dt * 10;
    desired.x += Math.cos(this.wob) * 0.9 * calm;
    desired.z += Math.sin(this.wob) * 0.9 * calm;
    desired.y += Math.sin(t * 2.3 + this.seed * 9) * 0.6 * calm;
    // On the last stretch it's coming down from above onto its own rock, so it stops
    // shying away from the neighbouring ones (whose push would hold it off the spot).
    this.avoid(desired, target, this.spot ? clamp(dist - 0.3, 0, 1) : 1);
    // Ease the velocity towards the desired one: the lag is what makes it look like
    // a light body pushed about by its wings, rather than a point on a rail.
    this.vel.lerp(desired, Math.min(1, dt * 3));
    p.addScaledVector(this.vel, dt);
    this.pushOut(target);
    if (!(this.spot && dist < 1.5)) {
      const floor = this.floorAt(p.x, p.z);
      if (p.y < floor) { p.y = floor; this.vel.y = Math.max(0, this.vel.y); }
    }
    const r = Math.hypot(p.x, p.z);
    if (r > FENCE_R - 2) { p.x *= (FENCE_R - 2) / r; p.z *= (FENCE_R - 2) / r; }

    // Face the way it's going, nose up a little when climbing. Close to the spot, turn
    // into the resting pose instead. slerp eases between the two orientations.
    if (this.spot && dist < 0.4) {
      this.landedQuat(this.targetQ);
    } else {
      const v = this.vel, h = Math.hypot(v.x, v.z);
      if (h > 0.05) euler.set(clamp(-Math.atan2(v.y, h) * 0.5, -0.5, 0.5), Math.atan2(v.x, v.z), 0);
      this.targetQ.setFromEuler(euler);
    }
    this.group.quaternion.slerp(this.targetQ, Math.min(1, dt * 6));

    // Wing beats. Each downstroke lifts the body a touch, so it bobs as it flaps.
    this.flap += dt * sp.flap * Math.PI * 2;
    const beat = Math.sin(this.flap);
    this.open = 0.35 + beat * 1.05;
    this.body.position.y = BODY_Y - beat * 0.02 * Math.max(calm, 0.3);
    this.setWings();
  }

  // Steer around anything taller than it's flying, except the collider its target is
  // on (the rock it's landing on). The push grows as the gap closes; `strength` scales it.
  avoid(desired, target, strength = 1) {
    if (strength <= 0) return;
    const p = this.group.position;
    for (const s of this.ctx.physics.solids) {
      if (s.h < p.y - 0.1 || insideSolid(s, target.x, target.z)) continue;
      let dx, dz, gap;
      if (s.r !== undefined) {
        dx = p.x - s.x; dz = p.z - s.z;
        gap = Math.hypot(dx, dz) - s.r;
      } else {
        dx = p.x - clamp(p.x, s.minX, s.maxX); dz = p.z - clamp(p.z, s.minZ, s.maxZ);
        gap = Math.hypot(dx, dz);
      }
      if (gap > 1) continue;
      const d = Math.hypot(dx, dz);
      if (d < 1e-4) continue;
      const push = (1 - gap) * 3 * strength / d;
      desired.x += dx * push;
      desired.z += dz * push;
    }
  }

  // Steering is soft, so if it has still ended up inside a collider, put it back on the edge.
  pushOut(target) {
    const p = this.group.position;
    for (const s of this.ctx.physics.solids) {
      if (s.h < p.y || insideSolid(s, target.x, target.z) || !insideSolid(s, p.x, p.z)) continue;
      if (s.r === undefined) continue; // the tea house walls are thin; steering keeps it off them
      const dx = p.x - s.x, dz = p.z - s.z, d = Math.hypot(dx, dz) || 1;
      p.x = s.x + dx / d * (s.r + 0.02);
      p.z = s.z + dz / d * (s.r + 0.02);
    }
  }

  // Landed: wings closed over the back, opened flat now and then to bask in the sun;
  // off again when something comes near, or when it's had enough.
  rest(dt, t, night) {
    const p = this.group.position;
    p.copy(this.spot.point);
    this.group.quaternion.slerp(this.landedQuat(this.targetQ), Math.min(1, dt * 6));
    this.body.position.y = BODY_Y;
    let want = 1.45;
    if (!night) {
      this.baskT -= dt;
      if (this.baskT <= 0) {
        this.basking = !this.basking;
        this.baskT = this.basking ? 1.5 + Math.random() * 3 : 1.5 + Math.random() * 4;
      }
      if (this.basking) want = 0.2 + Math.sin(t * 1.3 + this.seed * 9) * 0.15;
    }
    this.open += (want - this.open) * Math.min(1, dt * 4);
    this.setWings();

    const cam = cameraGroup.position;
    if (Math.hypot(cam.x - p.x, cam.z - p.z) < SCARE_R && Math.abs(cam.y - p.y) < 3.5) { this.takeOff(cam); return; }
    const near = this.flock.scarers.find((a) => Math.hypot(a.x - p.x, a.z - p.z) < SCARE_ANIMAL_R);
    if (near) { this.takeOff(near); return; }
    if (night) return; // asleep till morning
    this.timer -= dt;
    if (this.timer <= 0) this.takeOff();
  }

  setWings() {
    for (const w of this.wings) w.pivot.rotation.z = w.s * this.open;
  }
}

// The whole flutter of them, and the landing spots they share. `landingSources` are
// the features with a landings() method; `scarers` are the animals (and the Gardener)
// that make a resting butterfly take off; `teaHouse` is kept out of their wanderings.
export class Butterflies extends Feature {
  constructor(ctx, { landingSources, teaHouse, scarers = [] }) {
    super(ctx);
    this.teaHouse = teaHouse;
    this.scarers = scarers;
    // The landing spots are found by raycasting, which needs current world matrices.
    ctx.scene.updateMatrixWorld(true);
    this.landings = landingSources.flatMap((source) => source.landings()).map((s) => ({ ...s, taken: null }));
    this.flowers = this.landings.filter((s) => s.kind === 'flower');
    // Shared by every butterfly: the wing colours are in each species' geometry.
    const materials = {
      wing: mat(0xffffff, { vertexColors: true, side: THREE.DoubleSide, roughness: 0.75 }),
      body: mat(0x2b241f, { roughness: 0.9 }),
      antenna: new THREE.LineBasicMaterial({ color: 0x2b241f }),
    };
    const wingGeos = {};
    this.list = FLOCK.map((species, i) => {
      wingGeos[species] ??= wingGeometry(SPECIES[species]);
      const b = new Butterfly(ctx, { species, flock: this, wingGeo: wingGeos[species], materials });
      // Start half of them resting and half already on the wing.
      const free = this.landings.filter((s) => !s.taken);
      if (!free.length) return b;
      b.claim(free[Math.floor(Math.random() * free.length)]);
      b.settle();
      b.group.quaternion.copy(b.landedQuat(b.targetQ));
      b.timer = Math.random() * 10;
      if (i % 2) b.takeOff();
      return b;
    });
  }

  update(dt, t) {
    for (const b of this.list) b.update(dt, t);
  }
}
