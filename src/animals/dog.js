import * as THREE from 'three';
import { mat } from '../core/materials.js';
import { clamp } from '../core/random.js';
import { cameraGroup } from '../core/camera.js';
import { player } from '../core/state.js';
import { surfaceHeightAt, PLAYER_HEIGHT } from '../core/physics.js';
import { SFX, distVol } from '../audio/sfx.js';
import { Animal } from './animal.js';
import { hearts } from './hearts.js';

// ---- A friendly Shiba Inu ----
// Wanders between random spots, stops to sit or sniff, greets and follows the player,
// and can be petted. It keeps off the pond, bridge, gravel garden and tea house.
const DOG_SPEED = { walk: 2.2, trot: 4.5 };
const DOG_GREET_R = 8;                     // notices the player within this distance
const DOG_GIVE_UP_R = 16;                  // stops following beyond this
const DOG_SIT_DIST = 2;                    // how close it sits by the player

// The dog is a small state machine: 'wander' to a waypoint, 'rest' (sit or sniff),
// or 'follow' the player. Its logical state (x, z, heading, speed) is kept apart from
// the meshes; the pose code at the end of update() turns that state into rotations.
export class Dog extends Animal {
  static R = 0.45;    // collision radius
  static PET_R = 3;   // petting reach

  constructor(hearts, x = 7, z = 38) {
    super(x, z, { radius: Dog.R, height: 1.2 }); // so the player can't walk through it
    this.hearts = hearts;
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

  pet() {
    this.state = 'follow';
    this.happy = 3;
    this.hearts.spawn(this.head);
    SFX.yip(distVol(this.x, this.z, 30));
  }

  update(dt, t) {
    const p = cameraGroup.position;
    const toPlayer = Math.hypot(p.x - this.x, p.z - this.z);
    const playerAround = !player.flyMode && p.y - PLAYER_HEIGHT < 3; // on (or near) the ground
    this.cooldown -= dt;
    this.happy = Math.max(0, this.happy - dt);

    if (this.state !== 'follow' && playerAround && toPlayer < DOG_GREET_R && this.cooldown <= 0) {
      this.state = 'follow';
      this.happy = 2;
      SFX.bark(distVol(this.x, this.z, 40));
    } else if (this.state === 'follow' && (!playerAround || toPlayer > DOG_GIVE_UP_R)) {
      this.state = 'wander';
      this.target = null;
      this.cooldown = 12; // don't re-greet straight away
    }

    let goal = null, wantSpeed = 0, sitting = false;
    if (this.state === 'follow') {
      // If the player is somewhere the dog won't go (wading, on the gravel, in the
      // tea house), it sits at the edge and waits once it's reasonably close.
      const waitAtEdge = this.blocked(p.x, p.z) && (toPlayer < 6 || this.stuck > 0.5);
      if (waitAtEdge) {
        sitting = true;
      } else if (toPlayer > DOG_SIT_DIST + 0.6) {
        goal = { x: p.x, z: p.z };
        wantSpeed = toPlayer > 5 ? DOG_SPEED.trot : DOG_SPEED.walk;
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
    } else { // rest: sit, or stand and sniff the ground
      sitting = this.restSit;
      this.timer -= dt;
      if (this.timer <= 0) this.state = 'wander';
    }

    if (goal) {
      // Head for the goal, swerving around anything in the way, and keep swerving to
      // the same side as last time so it doesn't dither left and right.
      const desired = Math.atan2(goal.x - this.x, goal.z - this.z);
      const s = this.avoidSide;
      const free = this.freeHeading(desired, [0, s * 0.45, -s * 0.45, s * 0.9, -s * 0.9, s * 1.4, -s * 1.4, s * 2, -s * 2], 0.9);
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
      if (this.blocked(nx, nz)) { this.speed = 0; this.stuck += dt; }
      else { this.x = nx; this.z = nz; this.stuck = 0; }
    }
    this.syncSolid();
    this.pose(dt, t, sitting, toPlayer, p);
  }

  // `sit` eases between 0 (standing) and 1 (sitting); every joint angle is a blend of
  // its standing and sitting value, plus a walk cycle. One number drives the whole
  // transition, so the dog never pops between poses.
  pose(dt, t, sitting, toPlayer, p) {
    this.sit += ((sitting && this.speed < 0.3 ? 1 : 0) - this.sit) * Math.min(1, dt * 6);
    const sit = this.sit, moving = Math.min(1, this.speed / 2), legs = this.legs;
    // Walk cycle: the phase advances with distance travelled, so the legs never slide.
    this.phase += this.speed * dt * 6;
    const swing = Math.sin(this.phase) * 0.55 * moving * (1 - sit);
    const hipY = 0.52 + (0.24 - 0.52) * sit;
    this.group.position.set(this.x, surfaceHeightAt(this.x, this.z), this.z);
    this.group.rotation.y = this.heading;
    this.torso.position.y = hipY + Math.abs(Math.sin(this.phase)) * 0.03 * moving;
    this.torso.rotation.x = -0.55 * sit;                       // sitting tips the body up
    legs.fl.rotation.x = 0.55 * sit + swing;                   // front legs stay upright
    legs.fr.rotation.x = 0.55 * sit - swing;
    legs.hl.position.y = legs.hr.position.y = hipY;
    legs.hl.rotation.x = -1.05 * sit - swing;                  // hind legs fold forward
    legs.hr.rotation.x = -1.05 * sit + swing;
    // Look at the player when close, with a little head tilt while sitting with them.
    let look = 0;
    if (this.state === 'follow' && toPlayer < 7) {
      look = Math.atan2(p.x - this.x, p.z - this.z) - this.heading;
      look = clamp(Math.atan2(Math.sin(look), Math.cos(look)), -0.9, 0.9);
    }
    this.lookYaw += (look - this.lookYaw) * Math.min(1, dt * 5);
    this.head.rotation.y = this.lookYaw;
    const sniffing = this.state === 'rest' && !this.restSit;
    this.head.rotation.x = 0.45 * sit + (sniffing ? 0.45 + Math.sin(t * 7) * 0.06 : 0);
    this.head.rotation.z = this.state === 'follow' ? Math.sin(t * 1.3) * 0.15 * sit : 0;
    const excited = this.happy > 0 || this.state === 'follow';
    this.tail.rotation.y = Math.sin(t * (excited ? 16 : 6)) * (this.happy > 0 ? 0.6 : excited ? 0.4 : 0.2);
  }
}
export const dog = new Dog(hearts);
