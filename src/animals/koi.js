import * as THREE from 'three';
import { mat } from '../core/materials.js';
import { rand, clamp } from '../core/random.js';
import { POND_Z, POND_R } from '../core/layout.js';
import { pond } from '../world/pond.js';
import { ripples } from '../world/ripples.js';
import { SFX, distVol } from '../audio/sfx.js';
import { feeding } from './feeding.js';
import { Feature } from '../world/feature.js';

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

// Koi steer toward a target: normally a point gliding around their own loop,
// or the nearest food pellet when there is food on the water.
const KOI_BODY_R = 0.42;   // collision radius at scale 1 (the body is ~1.4 long, ~0.5 wide)
const KOI_PERSONAL = 1.8;  // neighbours closer than this make a fish steer away
const KOI_COUNT = 7;

// One fish. Its group is the fish's body; its swimming state lives on the object.
// Fish faces +Z with its tail toward -Z. Building every model facing +Z means
// rotation.y = atan2(dx, dz) turns it to face any direction (dx, dz).
class Koi extends Feature {
  constructor(type, parent) {
    super(0, 0, parent);
    // A little emissive colour keeps them vivid seen through the darkening water.
    const koiMat = (color, opts = {}) =>
      mat(color, { roughness: 0.5, emissive: color, emissiveIntensity: 0.25, ...opts });
    const bodyMat = koiMat(type.body);
    const finMat = koiMat(type.body, { side: THREE.DoubleSide });

    // A sphere scaled unevenly becomes an ellipsoid: a fish-shaped body for free.
    this.mesh(new THREE.IcosahedronGeometry(1, 1), bodyMat).scale.set(0.24, 0.16, 0.7);

    // patches sit on the back as flattened blobs
    const patches = type.tancho
      ? [{ color: 0xe2471f, z: 0.42, size: 0.14 }]
      : Array.from({ length: type.spots.length ? 3 : 0 }, (_, j) => ({
          color: type.spots[j % type.spots.length],
          z: -0.4 + rand() * 0.85,
          size: 0.1 + rand() * 0.08,
        }));
    for (const p of patches) {
      this.mesh(new THREE.IcosahedronGeometry(1, 0), koiMat(p.color), (rand() - 0.5) * 0.12, 0.12, p.z)
        .scale.set(p.size, 0.05, p.size * 1.4);
    }

    for (const side of [1, -1]) {
      this.mesh(eyeGeo, eyeMat, side * 0.13, 0.05, 0.52);
      // A scale of -1 mirrors the mesh, so one fin shape serves both sides.
      this.mesh(pectoralGeo, finMat, side * 0.16, -0.04, 0.25).scale.x = side;
    }

    // tail hangs off a pivot at the back of the body so it can wag
    this.tail = new THREE.Group();
    this.tail.position.z = -0.62;
    this.mesh(tailGeo, finMat, 0, 0, 0, { parent: this.tail });
    this.group.add(this.tail);

    // Size and swimming loop. (Keep the order of these rand() calls: see random.js.)
    const scale = 0.9 + rand() * 0.4;
    this.group.scale.setScalar(scale);
    this.r = KOI_BODY_R * scale; // collision radius
    this.orbit = rand() * Math.PI * 2;
    this.radius = 2.5 + rand() * 5.5;
    this.x = Math.cos(this.orbit) * this.radius;
    this.z = Math.sin(this.orbit) * this.radius;
    this.heading = rand() * Math.PI * 2;
    this.speed = 1;
    this.dir = rand() < 0.5 ? 1 : -1;
    this.cruise = 1 + rand() * 0.8;           // units/sec
    this.offset = rand() * Math.PI * 2;
    this.rippleCooldown = rand() * 3;
    this.food = null;
    this.turn = 0;
  }

  // Keep the fish inside the pond.
  keepInPond() {
    const r = Math.hypot(this.x, this.z), maxR = POND_R - 1;
    if (r > maxR) { this.x *= maxR / r; this.z *= maxR / r; }
  }
}

// The school, inside the pond's group, so the fish swim in pond-local coordinates.
export class KoiSchool extends Feature {
  constructor(pond, ripples, feeding) {
    super(0, 0, pond.group);
    this.ripples = ripples;
    this.feeding = feeding;
    this.list = Array.from({ length: KOI_COUNT }, (_, i) => new Koi(KOI_TYPES[i % KOI_TYPES.length], this.group));
  }

  // Steering behaviours (as in Craig Reynolds' "boids"): each fish adds up a few desire
  // vectors (toward its target, away from neighbours) and turns gradually toward the
  // sum. Limiting the turn rate is what makes the motion look like swimming rather than
  // teleporting between directions.
  update(dt, t) {
    const koi = this.list, { feeding, ripples } = this;
    // 1. Steer and swim: toward the target, and away from crowding neighbours.
    for (const k of koi) {
      let tx, tz, targetSpeed, turnRate;
      k.food = feeding.nearest(k.x, k.z);
      if (k.food) {
        tx = k.food.x; tz = k.food.z; targetSpeed = 2.6; turnRate = 3.2;
      } else {
        k.orbit += k.dir * k.cruise / k.radius * dt;
        const rr = k.radius * (0.65 + 0.35 * Math.sin(t * 0.3 + k.offset));
        tx = Math.cos(k.orbit) * rr; tz = Math.sin(k.orbit) * rr;
        targetSpeed = k.cruise; turnRate = 1.6;
      }
      let sx = tx - k.x, sz = tz - k.z;
      const len = Math.hypot(sx, sz) || 1;
      sx /= len; sz /= len;
      for (const o of koi) {
        if (o === k) continue;
        const ox = k.x - o.x, oz = k.z - o.z, dist = Math.hypot(ox, oz);
        if (dist > 1e-4 && dist < KOI_PERSONAL) {
          const push = 1.5 * (KOI_PERSONAL - dist) / KOI_PERSONAL; // stronger the closer they are
          sx += ox / dist * push;
          sz += oz / dist * push;
        }
      }
      // Heading h swims along (sin h, cos h), which is also the fish's rotation.y.
      // atan2(sin, cos) of the difference wraps it into -π..π, so the fish turns the
      // short way round instead of spinning almost a full circle.
      let diff = Math.atan2(sx, sz) - k.heading;
      diff = Math.atan2(Math.sin(diff), Math.cos(diff));
      k.turn = diff;
      k.heading += clamp(diff, -turnRate * dt, turnRate * dt);
      // Exponential smoothing: close a fraction of the gap each frame. Scaling the
      // fraction by dt keeps it roughly frame-rate independent.
      k.speed += (targetSpeed - k.speed) * Math.min(1, dt * 2);
      k.x += Math.sin(k.heading) * k.speed * dt;
      k.z += Math.cos(k.heading) * k.speed * dt;
      k.keepInPond();
    }

    // 2. Bodies can't overlap: push any touching pair apart equally. Steering alone is
    //    "soft" and loses when several fish chase the same pellet, so this hard
    //    constraint pass runs after it.
    for (let pass = 0; pass < 2; pass++) {
      for (let i = 0; i < koi.length; i++) {
        for (let j = i + 1; j < koi.length; j++) {
          const a = koi[i], b = koi[j];
          const dx = b.x - a.x, dz = b.z - a.z, dist = Math.hypot(dx, dz), min = a.r + b.r;
          if (dist >= min) continue;
          const nx = dist > 1e-4 ? dx / dist : 1, nz = dist > 1e-4 ? dz / dist : 0;
          const half = (min - dist) / 2;
          a.x -= nx * half; a.z -= nz * half;
          b.x += nx * half; b.z += nz * half;
          a.keepInPond(); b.keepInPond();
        }
      }
    }

    // 3. Eat, ripple and pose.
    for (const k of koi) {
      const food = k.food;
      // Mouth reach: the food just needs to be at the fish's nose, not its centre.
      if (food && feeding.pellets.includes(food) && Math.hypot(food.x - k.x, food.z - k.z) < k.r + 0.3) {
        feeding.remove(food);
        ripples.spawn(food.x, food.z, 0.6, 1.2);
        SFX.plop(0.6 * distVol(food.x, food.z + POND_Z, 30));
      }
      // A sharp turn, or now and then a nose at the surface, ripples the water.
      k.rippleCooldown -= dt;
      if (k.rippleCooldown <= 0 && (Math.abs(k.turn) > 1.2 || Math.random() < 0.15 * dt)) {
        ripples.spawn(k.x, k.z, 0.8, 1.4);
        k.rippleCooldown = 2 + Math.random() * 3;
      }

      // Procedural animation: a sine wave drives both the body wiggle and the tail,
      // beating faster the faster the fish swims.
      const wag = Math.sin(t * (4 + k.speed * 4) + k.offset);
      k.group.position.set(k.x, KOI_DEPTH + Math.sin(t * 0.8 + k.offset) * 0.04, k.z);
      k.group.rotation.y = k.heading + wag * 0.08;
      k.tail.rotation.y = wag * (0.35 + 0.15 * k.speed);
    }
  }
}
export const koi = new KoiSchool(pond, ripples, feeding);
