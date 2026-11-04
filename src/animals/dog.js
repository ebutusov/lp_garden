import * as THREE from 'three';
import { mat } from '../core/materials.js';
import { clamp } from '../core/random.js';
import { cameraGroup } from '../core/camera.js';
import { player } from '../core/state.js';
import { PLAYER_HEIGHT } from '../core/physics.js';
import { SFX, distVol } from '../audio/sfx.js';
import { Animal } from './animal.js';

// ---- A friendly Shiba Inu ----
// Wanders between random spots, stops to sit or sniff, greets and follows the player,
// and can be petted. It keeps off the pond, bridge and tea house; on the raked
// gravel it leaves paw prints. When it's hungry or thirsty it goes to its bowl by the
// tea house (world/bowls.js).
// The Gardener can pet it too, and then it trots after him for a while.
const DOG_SPEED = { walk: 2.2, trot: 4.5 };
const DOG_HUNGER = 1 / 150, DOG_THIRST = 1 / 100; // per second; at 1 it heads for a bowl
const DOG_REACH = 0.7;                     // body centre to muzzle, with its head down
const DOG_GREET_R = 8;                     // notices the player within this distance
const DOG_GIVE_UP_R = 16;                  // stops following beyond this
const DOG_SIT_DIST = 2;                    // how close it sits by the player

// The dog is a small state machine: 'wander' to a waypoint, 'rest' (sit or sniff),
// 'bowl' (go to a bowl and eat or drink), or 'follow' someone: the player, or a `leader` (anyone with x and z, e.g. the Gardener). Its logical state (x, z, heading, speed) is kept apart from
// the meshes; the pose code at the end of update() turns that state into rotations.
export class Dog extends Animal {
  static R = 0.45;    // collision radius
  static PET_R = 3;   // petting reach

  // It starts at (x, z), or somewhere else if that's blocked. `hearts` shows its joy;
  // `zenGarden` is the gravel it leaves paw prints in; `bowls`, where it eats and drinks.
  constructor(ctx, { hearts, zenGarden, bowls, x = 7, z = 38 }) {
    super(ctx, { x, z, radius: Dog.R, height: 1.2 }); // so the player can't walk through it
    this.hearts = hearts;
    this.zenGarden = zenGarden;
    this.bowls = bowls;
    this.bowlKind = 'dog';
    this.hunger = 0.3 + Math.random() * 0.5;
    this.thirst = Math.random() * 0.6;
    this.meal = null;    // the bowl and seat it's going to (see Animal.findMeal)
    this.eat = 0;        // 0 head up … 1 head down in the bowl
    this.chewT = 0;      // until the next crunch (or lap)
    this.build();
    this.heading = Math.PI;
    this.speed = 0;
    this.state = 'wander';
    this.target = null;
    this.timer = 0;
    this.restSit = false;
    this.sit = 0;        // 0 standing … 1 sitting
    this.phase = 0;      // walk cycle
    this.happy = 0;      // seconds of extra tail wagging left
    this.cooldown = 0;   // before it greets the player again
    this.stuck = 0;      // seconds spent bumping into something
    this.avoidSide = 1;  // which way it last swerved
    this.lookYaw = 0;
    this.leader = null;  // whom it follows when not the player
    this.followT = 0;    // seconds it keeps following the leader
    this.watch = null;   // someone it sits watching while resting
    if (this.blocked(this.x, this.z)) Object.assign(this, this.pickWaypoint());
    this.syncSolid();
  }

  // The model is a hierarchy of groups acting as joints, a hand-built "skeleton":
  //   root (position + heading) → torso (pivots at the hips, to sit) → head, tail, front legs
  //   root → hind legs
  // The root is the dog's own group. Animating is then just setting a few rotations
  // each frame; every child follows its parent. Each body part is a blob scaled into shape.
  build() {
    const COAT = mat(0xd9894a), CREAM = mat(0xf3e3c8), DARK = mat(0x2a2220);
    const blob = this.blob.bind(this);
    // Dog faces +Z. The torso pivots at the hips so it can sit.
    const root = this.group;
    root.scale.setScalar(1.1);
    const torso = this.torso = new THREE.Group();
    torso.position.set(0, 0.52, -0.28);
    root.add(torso);
    blob(COAT, 0.22, 0.2, 0.44, 0, 0, 0.3, torso);        // body
    blob(CREAM, 0.15, 0.13, 0.18, 0, -0.07, 0.6, torso);  // chest
    const head = this.head = new THREE.Group();
    head.position.set(0, 0.2, 0.72);
    torso.add(head);
    blob(COAT, 0.19, 0.18, 0.2, 0, 0, 0, head);
    blob(CREAM, 0.1, 0.08, 0.13, 0, -0.06, 0.17, head);   // muzzle
    blob(DARK, 0.035, 0.03, 0.03, 0, -0.03, 0.3, head);   // nose
    for (const s of [1, -1]) {
      blob(DARK, 0.025, 0.03, 0.02, s * 0.09, 0.05, 0.16, head);  // eyes
      blob(CREAM, 0.07, 0.06, 0.06, s * 0.1, -0.06, 0.08, head);  // cheeks
      this.mesh(new THREE.ConeGeometry(0.075, 0.16, 4), COAT, s * 0.11, 0.19, 0, { cast: true, parent: head })
        .rotation.z = -s * 0.25;                                  // ears
    }
    // Curled tail over the back; the pivot swings it side to side.
    // A partial torus (1.6π of a full ring) makes the curl.
    const tail = this.tail = new THREE.Group();
    tail.position.set(0, 0.16, -0.08);
    torso.add(tail);
    this.mesh(new THREE.TorusGeometry(0.1, 0.04, 5, 10, Math.PI * 1.6), COAT, 0, 0.08, 0, { cast: true, parent: tail })
      .rotation.y = Math.PI / 2;
    // Legs hang from pivots at the shoulders (on the torso) and hips (on the root).
    // The leg mesh is shifted down by half its length, so the pivot is at its top end.
    const leg = (parent, x, y, z, len) => {
      const pivot = new THREE.Group();
      pivot.position.set(x, y, z);
      this.mesh(new THREE.CylinderGeometry(0.05, 0.04, len, 5), COAT, 0, -len / 2, 0, { cast: true, parent: pivot });
      blob(CREAM, 0.055, 0.035, 0.07, 0, -len, 0.02, pivot); // paw
      parent.add(pivot);
      return pivot;
    };
    this.legs = {
      fl: leg(torso, 0.12, -0.08, 0.6, 0.42), fr: leg(torso, -0.12, -0.08, 0.6, 0.42),
      hl: leg(root, 0.12, 0.52, -0.28, 0.5), hr: leg(root, -0.12, 0.52, -0.28, 0.5),
    };
  }

  pickWaypoint() {
    for (let i = 0; i < 40; i++) {
      const a = Math.random() * Math.PI * 2, d = 6 + Math.random() * 36;
      const x = Math.cos(a) * d, z = Math.sin(a) * d;
      if (!this.blocked(x, z)) return { x, z };
    }
    return { x: this.x, z: this.z };
  }

  // Petted by the player, or by `by` (the Gardener), whom it then follows for a while.
  pet(by = null) {
    this.state = 'follow';
    this.leader = by;
    this.followT = 20 + Math.random() * 20;
    this.watch = null;
    this.happy = 3;
    this.hearts.spawn(this.head);
    SFX.yip(distVol(this.x, this.z, 30));
  }

  // Someone (`by`, the Gardener) is coming over to pet it: sit and wait for them. Not
  // while it's with the player, who comes first. False if it won't wait.
  hold(by, seconds) {
    if (this.state === 'follow' && !this.leader) return false;
    this.timer = Math.max(this.state === 'rest' ? this.timer : 0, seconds);
    this.state = 'rest';
    this.restSit = true;
    this.watch = by;
    this.target = null;
    return true;
  }

  update(dt, t) {
    const p = cameraGroup.position;
    const toPlayer = Math.hypot(p.x - this.x, p.z - this.z);
    const playerAround = !player.flyMode && p.y - PLAYER_HEIGHT < 3; // on (or near) the ground
    const withPlayer = this.state === 'follow' && !this.leader;
    this.cooldown -= dt;
    this.happy = Math.max(0, this.happy - dt);
    this.hunger += dt * DOG_HUNGER;
    this.thirst += dt * DOG_THIRST;

    // The player always wins: it leaves whatever it's doing (or whoever it's following).
    if (!withPlayer && playerAround && toPlayer < DOG_GREET_R && this.cooldown <= 0) {
      this.state = 'follow';
      this.leader = null;
      this.watch = null;
      this.happy = 2;
      SFX.bark(distVol(this.x, this.z, 40));
    } else if (withPlayer && (!playerAround || toPlayer > DOG_GIVE_UP_R)) {
      this.state = 'wander';
      this.target = null;
      this.cooldown = 12; // don't re-greet straight away
    } else if (this.state === 'follow' && this.leader && (this.followT -= dt) <= 0) {
      this.state = 'wander';
      this.target = null;
      this.leader = null;
    }

    // Hungry or thirsty, and nobody to be with? Off to the bowls.
    if (this.state === 'wander' || (this.state === 'rest' && !this.watch)) {
      const meal = this.findMeal(DOG_REACH, dt);
      if (meal) { this.state = 'bowl'; this.meal = meal; this.stuck = 0; this.watch = null; }
    }

    // Whom it's following, if anyone: the leader, or else the player.
    const lead = this.state === 'follow' ? (this.leader ?? p) : null;
    const toLead = lead ? Math.hypot(lead.x - this.x, lead.z - this.z) : Infinity;
    let goal = null, wantSpeed = 0, sitting = false, ignore = null;
    if (this.state === 'follow') {
      // If they're somewhere the dog won't go (wading, in the tea house),
      // it sits at the edge and waits once it's reasonably close. (A leader's own
      // collision circle doesn't count as "somewhere it won't go".)
      const waitAtEdge = this.blocked(lead.x, lead.z, lead.solid) && (toLead < 6 || this.stuck > 0.5);
      if (waitAtEdge) {
        sitting = true;
      } else if (toLead > DOG_SIT_DIST + 0.6) {
        goal = { x: lead.x, z: lead.z };
        wantSpeed = toLead > 5 ? DOG_SPEED.trot : DOG_SPEED.walk;
      } else {
        sitting = true;
      }
    } else if (this.state === 'wander') {
      if (!this.target) { this.target = this.pickWaypoint(); this.stuck = 0; }
      if (Math.hypot(this.target.x - this.x, this.target.z - this.z) < 0.6 || this.stuck > 1.5) {
        this.state = 'rest';
        this.timer = 2 + Math.random() * 4;
        this.restSit = Math.random() < 0.5;
        this.target = null;
      } else {
        goal = this.target;
        wantSpeed = DOG_SPEED.walk;
      }
    } else if (this.state === 'bowl') {
      const m = this.meal, g = m.eating ? null : this.mealGoal(dt, 0.3);
      if (m.eating) {
        // Face the bowl and tuck in: a few seconds for water, longer for food.
        let diff = m.heading - this.heading;
        this.heading += clamp(Math.atan2(Math.sin(diff), Math.cos(diff)), -4 * dt, 4 * dt);
        this.chewT -= dt;
        if (this.chewT <= 0 && this.eat > 0.7) {
          this.chewT = m.drink ? 0.3 : 0.45;
          SFX[m.drink ? 'lap' : 'munch'](distVol(this.x, this.z, 18));
        }
        if (this.eat > 0.7 && this.eatFrom(m, dt, m.drink ? 0.3 : 0.45, m.drink ? 4 : 7)) {
          this.state = 'rest';
          this.timer = 3 + Math.random() * 3;
          this.restSit = Math.random() < 0.6;
          this.happy = 1.5;
        }
      } else if (m.failed) {
        this.state = 'wander'; // can't get there, or someone else finished it
        this.target = null;
      } else {
        const d = Math.hypot(g.x - this.x, g.z - this.z);
        goal = g;
        ignore = m.bowl.solid; // it means to walk right up to the bowl
        wantSpeed = d > 6 ? DOG_SPEED.trot : m.path.length ? DOG_SPEED.walk : Math.min(DOG_SPEED.walk, d * 2 + 0.3);
      }
    } else { // rest: sit, or stand and sniff the ground
      sitting = this.restSit;
      this.timer -= dt;
      if (this.timer <= 0) { this.state = 'wander'; this.watch = null; }
    }

    if (goal) {
      // Head for the goal, swerving around anything in the way, and keep swerving to
      // the same side as last time so it doesn't dither left and right.
      const desired = Math.atan2(goal.x - this.x, goal.z - this.z);
      const s = this.avoidSide;
      const reach = ignore ? clamp(Math.hypot(goal.x - this.x, goal.z - this.z), 0.3, 0.9) : 0.9;
      const free = this.freeHeading(desired, [0, s * 0.45, -s * 0.45, s * 0.9, -s * 0.9, s * 1.4, -s * 1.4, s * 2, -s * 2], reach, ignore);
      if (!free) {
        wantSpeed = 0; // nowhere to go (e.g. the player is in the pond): wait
        if (this.state === 'follow') sitting = true;
      } else {
        if (free.off !== 0) this.avoidSide = Math.sign(free.off);
        let diff = free.angle - this.heading;
        diff = Math.atan2(Math.sin(diff), Math.cos(diff));
        this.heading += clamp(diff, -5 * dt, 5 * dt);
      }
    }
    this.speed += clamp(wantSpeed - this.speed, -8 * dt, 6 * dt);
    if (this.speed > 0.01) {
      const nx = this.x + Math.sin(this.heading) * this.speed * dt;
      const nz = this.z + Math.cos(this.heading) * this.speed * dt;
      if (this.blocked(nx, nz, ignore)) { this.speed = 0; this.stuck += dt; }
      else { this.x = nx; this.z = nz; this.stuck = 0; }
    }
    this.syncSolid();
    // It looks at whoever it's with, when they're close.
    const lookAt = lead && toLead < 7 ? lead : this.state === 'rest' ? this.watch : null;
    this.pose(dt, t, sitting, lookAt);
  }

  // `sit` eases between 0 (standing) and 1 (sitting); every joint angle is a blend of
  // its standing and sitting value, plus a walk cycle. One number drives the whole
  // transition, so the dog never pops between poses.
  pose(dt, t, sitting, lookAt) {
    this.sit += ((sitting && this.speed < 0.3 ? 1 : 0) - this.sit) * Math.min(1, dt * 6);
    const sit = this.sit, moving = Math.min(1, this.speed / 2), legs = this.legs;
    // Walk cycle: the phase advances with distance travelled, so the legs never slide.
    const before = this.phase;
    this.phase += this.speed * dt * 6;
    this.stepPrint(before, 0.5, 0.12);
    const swing = Math.sin(this.phase) * 0.55 * moving * (1 - sit);
    const hipY = 0.52 + (0.24 - 0.52) * sit;
    this.group.position.set(this.x, this.groundAt(this.x, this.z), this.z);
    this.group.rotation.y = this.heading;
    this.torso.position.y = hipY + Math.abs(Math.sin(this.phase)) * 0.03 * moving;
    this.torso.rotation.x = -0.55 * sit;                       // sitting tips the body up
    legs.fl.rotation.x = 0.55 * sit + swing;                   // front legs stay upright
    legs.fr.rotation.x = 0.55 * sit - swing;
    legs.hl.position.y = legs.hr.position.y = hipY;
    legs.hl.rotation.x = -1.05 * sit - swing;                  // hind legs fold forward
    legs.hr.rotation.x = -1.05 * sit + swing;
    // Look at whoever it's with, with a little head tilt while sitting with them.
    let look = 0;
    if (lookAt) {
      look = Math.atan2(lookAt.x - this.x, lookAt.z - this.z) - this.heading;
      look = clamp(Math.atan2(Math.sin(look), Math.cos(look)), -0.9, 0.9);
    }
    this.lookYaw += (look - this.lookYaw) * Math.min(1, dt * 5);
    this.head.rotation.y = this.lookYaw;
    const sniffing = this.state === 'rest' && !this.restSit;
    // Eating: the head (the neck, really) drops forward into the bowl, and chews or laps.
    const eating = this.state === 'bowl' && this.meal.eating;
    this.eat += ((eating ? 1 : 0) - this.eat) * Math.min(1, dt * 4);
    const eat = this.eat, chew = eating ? Math.sin(t * (this.meal.drink ? 18 : 11)) * 0.07 : 0;
    this.head.position.set(0, 0.2 - 0.32 * eat, 0.72 + 0.1 * eat);
    this.head.rotation.x = 0.45 * sit + (sniffing ? 0.45 + Math.sin(t * 7) * 0.06 : 0) + (0.9 + chew) * eat;
    this.head.rotation.z = this.state === 'follow' ? Math.sin(t * 1.3) * 0.15 * sit : 0;
    const excited = this.happy > 0 || this.state === 'follow';
    this.tail.rotation.y = Math.sin(t * (excited ? 16 : 6)) * (this.happy > 0 ? 0.6 : excited ? 0.4 : 0.2);
  }
}
