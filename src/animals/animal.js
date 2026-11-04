import * as THREE from 'three';
import { Feature } from '../world/feature.js';

// ---- Animal: the base class of the dog, the cats and the birds ----
// An animal is a Feature whose group is the root of its body: moving or turning the
// group carries the whole animal along. On top of that it keeps its logical position
// (x, z) apart from the meshes, and can have a collision circle (`solid`) that the
// player and the other animals bump into.
//
// The helpers here are the parts the animals have in common, written once:
// blob() builds body parts, blocked() asks whether a spot is off limits, and
// freeHeading() is the obstacle-avoiding "feeler" steering of the dog and the cats.
// findMeal() and eatFrom() are how the dog and the cats use their bowls (world/bowls.js).

// Every body part is the same 20-faced low-poly "sphere", scaled into shape, so all
// of them share ONE geometry; only their transforms differ.
const blobGeo = new THREE.IcosahedronGeometry(1, 0);

export class Animal extends Feature {
  // `radius` > 0 gives the animal a collision circle `height` tall.
  constructor(ctx, { x = 0, z = 0, radius = 0, height = 0, parent } = {}) {
    super(ctx, { x, z, parent });
    this.x = x;
    this.z = z;
    this.radius = radius;
    this.solid = null;
    if (radius > 0) this.solid = ctx.physics.addCircleSolid(x, z, radius, height);
  }

  // A body part: a blob scaled to (sx, sy, sz) at (x, y, z) inside `parent`.
  blob(material, sx, sy, sz, x, y, z, parent = this.group, cast = true) {
    const mesh = new THREE.Mesh(blobGeo, material);
    mesh.scale.set(sx, sy, sz);
    mesh.position.set(x, y, z);
    mesh.castShadow = cast;
    parent.add(mesh);
    return mesh;
  }

  // Places this animal won't go (see groundBlocked in physics.js). Its own collision
  // circle doesn't count, or it would always be in its own way. Nor does `ignore`, a
  // collider it means to go right up to.
  blocked(x, z, ignore = null) {
    return this.ctx.physics.groundBlocked(x, z, this.radius, this.solid, ignore);
  }

  // Height of the ground it stands on at (x, z).
  groundAt(x, z) {
    return this.ctx.physics.surfaceHeightAt(x, z);
  }

  // "Feelers": probe a point `reach` ahead at each heading desired + offset, in the
  // order given, and return the first free one as { angle, off }, or null if every
  // direction is blocked. Far simpler than real path-finding, and good enough in an
  // open garden. `ignore` is a collider it means to go right up to (a bowl).
  freeHeading(desired, offsets, reach, ignore = null) {
    for (const off of offsets) {
      const angle = desired + off;
      if (!this.blocked(this.x + Math.sin(angle) * reach, this.z + Math.cos(angle) * reach, ignore)) return { angle, off };
    }
    return null;
  }

  // ---- Bowls ----
  // `hunger` and `thirst` creep up over time (each animal sets its own pace); at 1 it
  // wants its food or water bowl. Thirst comes first. Returns a meal, a seat at the
  // bowl ({ bowl, i, x, z, heading }, see Bowls.seat) plus `drink`, or null if it
  // isn't hungry or thirsty, or the bowl is empty or taken. `reach`: how far ahead of
  // its body its mouth is.
  // If its last trip came to nothing, it doesn't try again for a while (`mealWait`).
  findMeal(reach, dt) {
    const bowls = this.bowls;
    if (!bowls || (this.mealWait = (this.mealWait ?? 0) - dt) > 0) return null;
    const wants = [];
    if (this.thirst >= 1) wants.push(bowls.water);
    if (this.hunger >= 1) wants.push(bowls.foodFor(this));
    for (const bowl of wants) {
      const seat = bowls.seat(bowl, this, reach);
      if (seat) {
        return {
          ...seat, drink: bowl === bowls.water, path: bowls.route(this.x, this.z, bowl),
          t: 0, eating: false, got: 0, best: Infinity, since: 0,
        };
      }
    }
    return null;
  }

  // One frame of the trip to the bowl. Returns the point to head for: the next
  // waypoint, then the seat. Once it's within `arrive` of the seat it sets
  // meal.eating and returns null. A progress check, like the Gardener's: if it hasn't
  // got any nearer for a while it's stuck somewhere, so it gives up (meal.failed, and
  // returns null) and leaves the bowls alone for a bit; so it does if the bowl is emptied.
  mealGoal(dt, arrive) {
    const m = this.meal;
    while (m.path.length && Math.hypot(m.path[0].x - this.x, m.path[0].z - this.z) < 1) {
      m.path.shift();
      m.best = Infinity;
    }
    const g = m.path[0] ?? m, d = Math.hypot(g.x - this.x, g.z - this.z);
    if (!m.path.length && d < arrive) { m.eating = true; return null; }
    if (d < m.best - 0.3) { m.best = d; m.since = 0; } else m.since += dt;
    if (m.since > 6 || m.bowl.level <= 0) {
      m.failed = true;
      this.mealWait = 15 + Math.random() * 20;
      return null;
    }
    return g;
  }

  // One frame of eating or drinking `meal`: `portion` of the bowl over `duration`
  // seconds. Returns true once it's had its fill or the bowl is empty. If the bowl ran
  // out first, it's still partly hungry (or thirsty), so it's back sooner.
  eatFrom(meal, dt, portion, duration) {
    meal.t += dt;
    meal.got += this.bowls.take(meal.bowl, portion * dt / duration);
    const done = meal.t >= duration || meal.bowl.level <= 0;
    if (done) this[meal.drink ? 'thirst' : 'hunger'] = Math.max(0, 1 - meal.got / portion);
    return done;
  }

  // Paw prints in the raked gravel. The walk cycle `phase` passes a multiple of π
  // once a step, so a paw comes down whenever floor(phase / π) changes since `before`;
  // on the gravel (`this.zenGarden`, if it has one) that leaves a mark, alternately
  // left and right of its path (its left, +X, is (cos h, -sin h) in the world).
  stepPrint(before, size, side) {
    const zen = this.zenGarden, step = Math.floor(this.phase / Math.PI);
    if (!zen || step === Math.floor(before / Math.PI)) return;
    const h = this.heading, off = (step % 2 ? 1 : -1) * side;
    const x = this.x + Math.cos(h) * off, z = this.z - Math.sin(h) * off;
    if (zen.contains(x, z)) zen.footprint(x, z, h, size, true);
  }

  // Move the collision circle to where the animal now is.
  syncSolid() {
    this.solid.x = this.x;
    this.solid.z = this.z;
  }
}
