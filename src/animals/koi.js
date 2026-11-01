import * as THREE from 'three';
import { mat } from '../core/materials.js';
import { rand, clamp } from '../core/random.js';
import { POND_Z, POND_R } from '../core/layout.js';
import { pondGroup } from '../world/pond.js';
import { spawnRipple } from '../world/ripples.js';
import { SFX, distVol } from '../audio/sfx.js';
import { pellets, nearestPellet, removePellet } from './feeding.js';

// ---- Koi fish under the water ----
// Classic varieties: base body colour + the colours its patches can take.
const KOI_TYPES = [
  { body: 0xf4f1ea, spots: [0xe2471f] },            // kohaku: white, red
  { body: 0xf4f1ea, spots: [0xe2471f, 0x1c1c1c] },  // sanke: white, red, black
  { body: 0xff7a2e, spots: [0xf4f1ea] },            // orange with white
  { body: 0xf2b23a, spots: [] },                    // ogon: plain gold
  { body: 0xf4f1ea, spots: [], tancho: true },      // tancho: single red crown
];
// Deep enough that the largest fish stays under the bobbing surface (-0.2 at its lowest).
const KOI_DEPTH = -0.48;

// Flat horizontal fin from 2D (x, z) points, readable from above the water.
function finGeometry(points) {
  const shape = new THREE.Shape(points.map(([x, z]) => new THREE.Vector2(x, -z)));
  return new THREE.ShapeGeometry(shape).rotateX(-Math.PI / 2);
}
const tailGeo = finGeometry([[0, 0], [-0.32, -0.5], [0, -0.36], [0.32, -0.5]]);
const pectoralGeo = finGeometry([[0, 0], [0.32, -0.12], [0.22, 0.08]]);
const eyeGeo = new THREE.IcosahedronGeometry(0.035, 0);
const eyeMat = mat(0x111111);

// Fish faces +Z with its tail toward -Z. Building every model facing +Z means
// rotation.y = atan2(dx, dz) turns it to face any direction (dx, dz).
function makeKoi(type) {
  const fish = new THREE.Group();
  // A little emissive colour keeps them vivid seen through the darkening water.
  const koiMat = (color, opts = {}) =>
    mat(color, { roughness: 0.5, emissive: color, emissiveIntensity: 0.25, ...opts });
  const bodyMat = koiMat(type.body);
  const finMat = koiMat(type.body, { side: THREE.DoubleSide });

  // A sphere scaled unevenly becomes an ellipsoid: a fish-shaped body for free.
  const body = new THREE.Mesh(new THREE.IcosahedronGeometry(1, 1), bodyMat);
  body.scale.set(0.24, 0.16, 0.7);
  fish.add(body);

  // patches sit on the back as flattened blobs
  const patches = type.tancho
    ? [{ color: 0xe2471f, z: 0.42, size: 0.14 }]
    : Array.from({ length: type.spots.length ? 3 : 0 }, (_, j) => ({
        color: type.spots[j % type.spots.length],
        z: -0.4 + rand() * 0.85,
        size: 0.1 + rand() * 0.08,
      }));
  for (const p of patches) {
    const spot = new THREE.Mesh(new THREE.IcosahedronGeometry(1, 0), koiMat(p.color));
    spot.scale.set(p.size, 0.05, p.size * 1.4);
    spot.position.set((rand() - 0.5) * 0.12, 0.12, p.z);
    fish.add(spot);
  }

  for (const side of [1, -1]) {
    const eye = new THREE.Mesh(eyeGeo, eyeMat);
    eye.position.set(side * 0.13, 0.05, 0.52);
    fish.add(eye);
    // A scale of -1 mirrors the mesh, so one fin shape serves both sides.
    const fin = new THREE.Mesh(pectoralGeo, finMat);
    fin.scale.x = side;
    fin.position.set(side * 0.16, -0.04, 0.25);
    fish.add(fin);
  }

  // tail hangs off a pivot at the back of the body so it can wag
  const tailPivot = new THREE.Group();
  tailPivot.position.z = -0.62;
  tailPivot.add(new THREE.Mesh(tailGeo, finMat));
  fish.add(tailPivot);

  fish.userData.tail = tailPivot;
  return fish;
}

// Koi steer toward a target: normally a point gliding around their own loop,
// or the nearest food pellet when there is food on the water.
const KOI_BODY_R = 0.42;   // collision radius at scale 1 (the body is ~1.4 long, ~0.5 wide)
const KOI_PERSONAL = 1.8;  // neighbours closer than this make a fish steer away
export const koi = [];
for (let i = 0; i < 7; i++) {
  const fish = makeKoi(KOI_TYPES[i % KOI_TYPES.length]);
  const scale = 0.9 + rand() * 0.4;
  fish.scale.setScalar(scale);
  fish.userData.r = KOI_BODY_R * scale; // collision radius
  const orbit = rand() * Math.PI * 2;
  const radius = 2.5 + rand() * 5.5;
  Object.assign(fish.userData, {
    x: Math.cos(orbit) * radius, z: Math.sin(orbit) * radius,
    heading: rand() * Math.PI * 2, speed: 1,
    orbit, radius, dir: rand() < 0.5 ? 1 : -1,
    cruise: 1 + rand() * 0.8,                 // units/sec
    offset: rand() * Math.PI * 2,
    rippleCooldown: rand() * 3,
  });
  pondGroup.add(fish);
  koi.push(fish);
}

// Keep a fish inside the pond.
function keepInPond(d) {
  const r = Math.hypot(d.x, d.z), maxR = POND_R - 1;
  if (r > maxR) { d.x *= maxR / r; d.z *= maxR / r; }
}

// Steering behaviours (as in Craig Reynolds' "boids"): each fish adds up a few desire
// vectors (toward its target, away from neighbours) and turns gradually toward the
// sum. Limiting the turn rate is what makes the motion look like swimming rather than
// teleporting between directions.
export function updateKoi(dt, t) {
  // 1. Steer and swim: toward the target, and away from crowding neighbours.
  for (const k of koi) {
    const d = k.userData;
    let tx, tz, targetSpeed, turnRate;
    d.food = nearestPellet(d.x, d.z);
    if (d.food) {
      tx = d.food.x; tz = d.food.z; targetSpeed = 2.6; turnRate = 3.2;
    } else {
      d.orbit += d.dir * d.cruise / d.radius * dt;
      const rr = d.radius * (0.65 + 0.35 * Math.sin(t * 0.3 + d.offset));
      tx = Math.cos(d.orbit) * rr; tz = Math.sin(d.orbit) * rr;
      targetSpeed = d.cruise; turnRate = 1.6;
    }
    let sx = tx - d.x, sz = tz - d.z;
    const len = Math.hypot(sx, sz) || 1;
    sx /= len; sz /= len;
    for (const o of koi) {
      if (o === k) continue;
      const ox = d.x - o.userData.x, oz = d.z - o.userData.z, dist = Math.hypot(ox, oz);
      if (dist > 1e-4 && dist < KOI_PERSONAL) {
        const push = 1.5 * (KOI_PERSONAL - dist) / KOI_PERSONAL; // stronger the closer they are
        sx += ox / dist * push;
        sz += oz / dist * push;
      }
    }
    // Heading h swims along (sin h, cos h), which is also the fish's rotation.y.
    // atan2(sin, cos) of the difference wraps it into -π..π, so the fish turns the
    // short way round instead of spinning almost a full circle.
    let diff = Math.atan2(sx, sz) - d.heading;
    diff = Math.atan2(Math.sin(diff), Math.cos(diff));
    d.turn = diff;
    d.heading += clamp(diff, -turnRate * dt, turnRate * dt);
    // Exponential smoothing: close a fraction of the gap each frame. Scaling the
    // fraction by dt keeps it roughly frame-rate independent.
    d.speed += (targetSpeed - d.speed) * Math.min(1, dt * 2);
    d.x += Math.sin(d.heading) * d.speed * dt;
    d.z += Math.cos(d.heading) * d.speed * dt;
    keepInPond(d);
  }

  // 2. Bodies can't overlap: push any touching pair apart equally. Steering alone is
  //    "soft" and loses when several fish chase the same pellet, so this hard
  //    constraint pass runs after it.
  for (let pass = 0; pass < 2; pass++) {
    for (let i = 0; i < koi.length; i++) {
      for (let j = i + 1; j < koi.length; j++) {
        const a = koi[i].userData, b = koi[j].userData;
        const dx = b.x - a.x, dz = b.z - a.z, dist = Math.hypot(dx, dz), min = a.r + b.r;
        if (dist >= min) continue;
        const nx = dist > 1e-4 ? dx / dist : 1, nz = dist > 1e-4 ? dz / dist : 0;
        const half = (min - dist) / 2;
        a.x -= nx * half; a.z -= nz * half;
        b.x += nx * half; b.z += nz * half;
        keepInPond(a); keepInPond(b);
      }
    }
  }

  // 3. Eat, ripple and pose.
  for (const k of koi) {
    const d = k.userData;
    const food = d.food;
    // Mouth reach: the food just needs to be at the fish's nose, not its centre.
    if (food && pellets.includes(food) && Math.hypot(food.x - d.x, food.z - d.z) < d.r + 0.3) {
      removePellet(food);
      spawnRipple(food.x, food.z, 0.6, 1.2);
      SFX.plop(0.6 * distVol(food.x, food.z + POND_Z, 30));
    }
    // A sharp turn, or now and then a nose at the surface, ripples the water.
    d.rippleCooldown -= dt;
    if (d.rippleCooldown <= 0 && (Math.abs(d.turn) > 1.2 || Math.random() < 0.15 * dt)) {
      spawnRipple(d.x, d.z, 0.8, 1.4);
      d.rippleCooldown = 2 + Math.random() * 3;
    }

    // Procedural animation: a sine wave drives both the body wiggle and the tail,
    // beating faster the faster the fish swims.
    const wag = Math.sin(t * (4 + d.speed * 4) + d.offset);
    k.position.set(d.x, KOI_DEPTH + Math.sin(t * 0.8 + d.offset) * 0.04, d.z);
    k.rotation.y = d.heading + wag * 0.08;
    d.tail.rotation.y = wag * (0.35 + 0.15 * d.speed);
  }
}
