import * as THREE from 'three';
import { env } from '../core/state.js';
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
// findMeal() and eatFrom() are how the dog and the cats use their bowls (world/bowls.js),
// and startShelter() / shelterGoal() how they wait out the rain in the tea house.

// Every body part is the same 20-faced low-poly "sphere", scaled into shape, so all
// of them share ONE geometry; only their transforms differ.
const blobGeo = new THREE.IcosahedronGeometry(1, 0);

// dropTinyShadows(): parts smaller than this (bounding radius, world units) cast none.
const TINY_SHADOW_R = 0.06;
const tmpScale = new THREE.Vector3();

// freeHeading(): how far ahead the first probe of each feeler looks, about one
// frame's step at a trot.
const STEP_PROBE = 0.05;

// The swerves the dog and the cats try (radians off the way to their goal), all of
// them to the side they swerved last (`side`, ±1) before any to the other. Trying left
// and right in turn instead (0.45, -0.45, 0.9, -0.9, ...), an animal flips sides
// whenever its own side is blocked a little earlier than the other. Against a long
// curved wall like the pond's rim that happens every second or so, and it walks in
// little circles instead of round the obstacle. Keeping to one side is "wall
// following": with a hand on the wall, you get round anything convex.
const SWERVES = [0.45, 0.9, 1.4, 2];
export function feelers(side) {
  return [0, ...SWERVES.map((o) => o * side), ...SWERVES.map((o) => -o * side)];
}

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

  // Shadows from parts smaller than the shadow map can show. The sun's shadow map is
  // 2048 texels across 160 units (lights.js), about 0.08 units a texel, so an eye or a
  // whisker darkens a texel or less, inside the shadow its head casts anyway. Each
  // caster is one more draw call in the shadow pass, so those stop casting. Called once
  // the garden is built (garden.js); it covers hidden parts too (the Gardener's pouch).
  dropTinyShadows(minRadius = TINY_SHADOW_R) {
    this.group.updateWorldMatrix(true, true);
    this.group.traverse((o) => {
      if (!o.isMesh || !o.castShadow) return;
      if (!o.geometry.boundingSphere) o.geometry.computeBoundingSphere();
      const s = o.getWorldScale(tmpScale);
      if (o.geometry.boundingSphere.radius * Math.max(s.x, s.y, s.z) < minRadius) o.castShadow = false;
    });
  }

  // Places this animal won't go (see groundBlocked in physics.js). Its own collision
  // circle doesn't count, or it would always be in its own way. Nor does `ignore`, a
  // collider it means to go right up to.
  // At a bowl it stands partly inside the bowl's collider (it had to, to reach it), so
  // once it stops eating (it's had enough, or the dog turned up) every step from there
  // would count as blocked and it would be stuck. So the bowl doesn't count while the
  // animal still overlaps it, as long as the step doesn't take it any further in.
  // That goes for any bowl, not just the one it ate from: the seats are close
  // together, and drinking at the water bowl it can brush the cat bowl beside it.
  blocked(x, z, ignore = null) {
    if (!ignore && this.bowls) {
      for (const { solid: s } of this.bowls.list) {
        const now = Math.hypot(this.x - s.x, this.z - s.z);
        if (now < s.r + this.radius && Math.hypot(x - s.x, z - s.z) >= now) { ignore = s; break; }
      }
    }
    // The tea house is open to it while it's sheltering, and also while it's still
    // inside, whatever it's doing: otherwise every step would be blocked, and it
    // would be shut in.
    const physics = this.ctx.physics;
    const house = this.state === 'shelter' || physics.nearTeaHouse(this.x, this.z);
    return physics.groundBlocked(x, z, this.radius, this.solid, ignore, house);
  }

  // Height of the ground it stands on at (x, z).
  groundAt(x, z) {
    return this.ctx.physics.surfaceHeightAt(x, z);
  }

  // "Feelers": probe a point `reach` ahead at each heading desired + offset, in the
  // order given, and return the first free one as { angle, off }, or null if every
  // direction is blocked. Far simpler than real path-finding, and good enough in an
  // open garden. `ignore` is a collider it means to go right up to (a bowl).
  // Each feeler checks a point close by as well as the one `reach` ahead (as the
  // Gardener's do): brushing past a tree trunk, the far point can be clear while the
  // very next step isn't, and the animal would keep picking a heading it can't take.
  // And one a single step ahead (STEP_PROBE): skirting the pond's rim, a heading that
  // just grazes the circle can dip into it for the first few centimetres and be out
  // again by the near point, so every step would be refused while every feeler said
  // the way was clear.
  freeHeading(desired, offsets, reach, ignore = null) {
    const near = Math.min(0.2, reach);
    for (const off of offsets) {
      const angle = desired + off, sx = Math.sin(angle), cz = Math.cos(angle);
      if (!this.blocked(this.x + sx * STEP_PROBE, this.z + cz * STEP_PROBE, ignore) &&
          !this.blocked(this.x + sx * near, this.z + cz * near, ignore) &&
          !this.blocked(this.x + sx * reach, this.z + cz * reach, ignore)) return { angle, off };
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

  // ---- Shelter from the rain ----
  // When it rains the dog and the cats go into the tea house (`this.house`), each to
  // a spot of its own (TeaHouse.claimShelter), and wait there till it stops. The trip
  // is a list of waypoints in (round the pond and the house, then through the door)
  // and later a list out. `this.shelter` is { spot, path, phase, best, since }, where
  // phase is 'in', 'stay' or 'out'.
  get raining() {
    return env.isRaining && !!this.house;
  }

  // Off to the tea house (back in, if it was on its way out). False if there's no
  // spot left for it.
  startShelter() {
    if (this.shelter) this.house.releaseShelter(this.shelter.spot, this);
    const spot = this.house.claimShelter(this);
    if (!spot) return false;
    this.shelter = { spot, phase: 'in', path: this.house.shelterRoute(this.x, this.z, spot), best: Infinity, since: 0, tries: 0 };
    this.state = 'shelter';
    this.target = null;
    return true;
  }

  // The rain has stopped: back out through the door (or straight off, if it never got in).
  leaveShelter() {
    const s = this.shelter;
    this.house.releaseShelter(s.spot, this);
    Object.assign(s, { phase: 'out', path: this.house.exitRoute(this.x, this.z), best: Infinity, since: 0 });
  }

  // One frame of the trip. Returns the point to head for; null once it's at its spot
  // (phase 'stay'); or 'done' when it's back outside after the rain, and should get
  // on with its day. Like mealGoal, it watches its progress: stuck on the way in for a
  // while, it stays where it is (a tree is some shelter); stuck on the way out, it
  // tries the door again while it's still indoors, and once outside just carries on.
  shelterGoal(dt, arrive) {
    const s = this.shelter;
    if (s.phase === 'stay') return null;
    while (s.path.length > 1 && Math.hypot(s.path[0].x - this.x, s.path[0].z - this.z) < 0.6) {
      s.path.shift();
      s.best = Infinity;
    }
    let g = s.path[0];
    const d = g ? Math.hypot(g.x - this.x, g.z - this.z) : 0;
    if (d < s.best - 0.3) { s.best = d; s.since = 0; } else s.since += dt;
    // Held up on the way out (the Gardener in the doorway, say) but still indoors:
    // giving up there would leave it wandering about inside, so try the door again.
    // Held up on the way in, outside: plan the route afresh from here, twice, before
    // settling for wherever it's got to.
    const indoors = this.ctx.physics.nearTeaHouse(this.x, this.z); // the whole no-go box, doorstep too
    if (s.since > 8 && (s.phase === 'out' ? indoors : !indoors && s.tries < 2)) {
      if (s.phase === 'in') s.tries++;
      const path = s.phase === 'out' ? this.house.exitRoute(this.x, this.z) : this.house.shelterRoute(this.x, this.z, s.spot);
      Object.assign(s, { path, best: Infinity, since: 0 });
      g = s.path[0];
    }
    if (!g || (s.path.length === 1 && d < arrive) || s.since > 8) {
      if (s.phase === 'out') return 'done';
      s.phase = 'stay';
      return null;
    }
    return g;
  }

  // The rain is over and it's out of the door: on with its day.
  endShelter() {
    this.shelter = null;
    this.state = 'wander';
    this.target = null;
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
