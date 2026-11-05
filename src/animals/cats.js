import * as THREE from 'three';
import { mat } from '../core/materials.js';
import { clamp } from '../core/random.js';
import { cameraGroup } from '../core/camera.js';
import { env } from '../core/state.js';
import { SFX, distVol } from '../audio/sfx.js';
import { Feature } from '../world/feature.js';
import { Animal } from './animal.js';

// ---- Cats ----
// Three cats with their own routines: they wander, sit, groom, curl up for a nap, stalk
// birds on the grass (and pounce, always a moment too late), and bolt when the dog comes
// near. You can pet them, if they're in the mood. Their eyes shine in the dark, and
// they leave paw prints on the raked gravel. When they're hungry or thirsty they go to
// the bowls by the tea house, as long as the dog isn't there. In the rain they go
// into the tea house and curl up till it stops; it's a truce: nobody runs from the
// dog in there.
const CAT_SPEED = { wander: 1.1, stalk: 0.7, flee: 4.5, pounce: 5 };
const CAT_HUNGER = 1 / 200, CAT_THIRST = 1 / 130; // per second; at 1 it heads for a bowl
const CAT_REACH = 0.48;                            // body centre to mouth, crouched over a bowl
const CAT_DOG_CLEAR = 6;                           // won't go to a bowl with the dog this close to it
const CAT_FEELERS = [0, 0.45, -0.45, 0.9, -0.9, 1.4, -1.4, 2, -2];
// marks: flattened blobs on the back [colour, x, y, z, sizeX, sizeZ]; headMarks likewise on the head.
const CAT_COATS = [
  { // Mike: calico, the classic Japanese lucky cat
    name: 'Mike', base: 0xf3efe6, chest: 0xffffff, eye: 0xd8a63a, tailTip: 0xd9832f,
    marks: [[0xd9832f, 0.03, 0.125, 0.28, 0.11, 0.12], [0x2a2624, -0.05, 0.125, 0.1, 0.09, 0.09], [0xd9832f, 0, 0.12, 0.42, 0.07, 0.06]],
    headMarks: [[0x2a2624, -0.06, 0.07, -0.01, 0.07, 0.07]],
  },
  { // Kuro: black, yellow eyes
    name: 'Kuro', base: 0x1d1c1f, chest: 0x2a292d, eye: 0xd9c235, marks: [], headMarks: [],
  },
  { // Tora: orange tabby
    name: 'Tora', base: 0xd88a3c, chest: 0xf1dcb8, eye: 0x8fbf3a, tailTip: 0xa8582a,
    marks: [0.04, 0.14, 0.24, 0.34].map((z) => [0xa8582a, 0, 0.125, z, 0.15, 0.025]),
    headMarks: [[0xa8582a, 0, 0.11, -0.01, 0.06, 0.02]],
  },
];

// One cat: a state machine ('wander', 'sit', 'groom', 'loaf', 'stalk', 'pounce',
// 'flee', 'bowl', 'shelter'), like the dog. `dog` and `birds` are what it reacts to.
class Cat extends Animal {
  static R = 0.3;       // collision radius
  static PET_R = 2.4;   // petting reach

  constructor(ctx, { coat, parent, dog, birds, hearts, zenGarden, bowls, house }) {
    super(ctx, { radius: Cat.R, height: 0.8, parent }); // the player (and the dog) can't walk through a cat
    Object.assign(this, { dog, birds, hearts, zenGarden, bowls, house });
    this.shelter = null; // its trip to the tea house and back (see Animal.startShelter)
    this.cozy = 'loaf';  // what it does at its shelter spot: 'loaf', 'sit' or 'groom'
    this.bowlKind = 'cat';
    this.hunger = Math.random() * 0.9;
    this.thirst = Math.random() * 0.9;
    this.meal = null;   // the bowl and seat it's going to (see Animal.findMeal)
    this.lapT = 0;      // until the next lap (or nibble)
    this.name = coat.name;
    this.build(coat);
    this.heading = Math.random() * Math.PI * 2;
    this.speed = 0;
    this.state = 'wander';
    this.target = null;
    this.timer = 0;
    this.stuck = 0;
    this.avoidSide = 1; // which way it last swerved round something
    this.prey = null;
    this.pounceT = 0;
    this.stalkCheck = 2 + Math.random() * 3;
    this.pose = { sit: 0, lie: 0, crouch: 0, groom: 0, eat: 0 };
    this.phase = 0;
    this.blink = 3;
    this.lookYaw = 0;
    this.meowT = 10 + Math.random() * 20;
    this.curlSide = Math.random() < 0.5 ? 1 : -1;
    Object.assign(this, this.openSpot());
    this.syncSolid();
  }

  // Cat faces +Z. Like the dog, the torso pivots at the hips so it can sit.
  build(coat) {
    const m = (c) => mat(c, { roughness: 0.85 });
    const BASE = m(coat.base), CHEST = m(coat.chest), DARK = m(0x111111);
    const blob = this.blob.bind(this);
    const root = this.group;
    const torso = this.torso = new THREE.Group();
    torso.position.set(0, 0.34, -0.2);
    root.add(torso);
    blob(BASE, 0.15, 0.14, 0.3, 0, 0, 0.2, torso);
    blob(CHEST, 0.1, 0.1, 0.1, 0, -0.04, 0.42, torso);
    for (const [c, x, y, z, sx, sz] of coat.marks) blob(m(c), sx, 0.03, sz, x, y, z, torso);
    const head = this.head = new THREE.Group();
    head.position.set(0, 0.13, 0.5);
    torso.add(head);
    blob(BASE, 0.13, 0.12, 0.12, 0, 0, 0, head);
    blob(CHEST, 0.055, 0.04, 0.045, 0, -0.04, 0.1, head);               // muzzle
    blob(m(0xd88a8a), 0.014, 0.01, 0.01, 0, -0.02, 0.142, head);        // nose
    for (const [c, x, y, z, sx, sz] of coat.headMarks) blob(m(c), sx, 0.03, sz, x, y, z, head);
    // Eyes glow at night (eyeshine); they close (squash flat) when asleep or blinking.
    // Each cat gets its own eye material so its glow can be set on its own.
    this.eyeMat = new THREE.MeshStandardMaterial({
      color: coat.eye, emissive: coat.eye, emissiveIntensity: 0, roughness: 0.3, flatShading: true,
    });
    this.eyes = [1, -1].map((s) => {
      const eye = new THREE.Group();
      eye.position.set(s * 0.05, 0.025, 0.1);
      blob(this.eyeMat, 0.022, 0.022, 0.012, 0, 0, 0, eye);
      blob(DARK, 0.006, 0.018, 0.006, 0, 0, 0.012, eye);                // slit pupil
      head.add(eye);
      this.mesh(new THREE.ConeGeometry(0.045, 0.09, 3), BASE, s * 0.065, 0.11, -0.01, { parent: head })
        .rotation.z = -s * 0.2;                                          // ear
      return eye;
    });
    // Tail: three jointed segments pointing back (-Z); each joint bends the rest.
    // Each joint is the child of the previous one (a "kinematic chain"), so bending
    // joint 1 carries joints 2 and 3 with it, and small angles add up to a curl.
    this.tail = [];
    let parent = torso, z0 = -0.07, y0 = 0.04;
    for (let i = 0; i < 3; i++) {
      const joint = new THREE.Group();
      joint.position.set(0, y0, z0);
      this.mesh(
        new THREE.CylinderGeometry(0.022, 0.026, 0.16, 5).rotateX(Math.PI / 2),
        i === 2 && coat.tailTip ? m(coat.tailTip) : BASE,
        0, 0, -0.08, { cast: true, parent: joint },
      );
      parent.add(joint);
      this.tail.push(joint);
      parent = joint; z0 = -0.16; y0 = 0;
    }
    const leg = (par, x, y, z, len) => {
      const pivot = new THREE.Group();
      pivot.position.set(x, y, z);
      this.mesh(new THREE.CylinderGeometry(0.03, 0.026, len, 5), BASE, 0, -len / 2, 0, { cast: true, parent: pivot });
      blob(CHEST, 0.032, 0.02, 0.04, 0, -len, 0.01, pivot);             // paw
      par.add(pivot);
      return pivot;
    };
    this.legs = {
      fl: leg(torso, 0.07, -0.06, 0.38, 0.3), fr: leg(torso, -0.07, -0.06, 0.38, 0.3),
      hl: leg(root, 0.07, 0.34, -0.2, 0.34), hr: leg(root, -0.07, 0.34, -0.2, 0.34),
    };
  }

  // A free spot anywhere in the garden, or (with `near`) between minD and maxD from it.
  openSpot(near = null, minD = 0, maxD = 40) {
    for (let i = 0; i < 40; i++) {
      const a = Math.random() * Math.PI * 2;
      const d = near ? minD + Math.random() * (maxD - minD) : 6 + Math.random() * 36;
      const x = (near ? near.x : 0) + Math.cos(a) * d, z = (near ? near.z : 0) + Math.sin(a) * d;
      // Never somewhere in the tea house: it may only be let in there to shelter.
      if (!this.blocked(x, z) && !this.ctx.physics.nearTeaHouse(x, z)) return { x, z };
    }
    return { x: this.x, z: this.z };
  }

  // Head toward a goal, swerving around obstacles (same idea as the dog's steering).
  // Turns mostly on the spot first, so it doesn't run the wrong way (e.g. into the dog).
  // Like the dog it keeps swerving to the side it chose last; trying left and right in
  // turn, it could flip between them every frame, face-on to a lantern, and never get
  // round it. `ignore`: a collider it means to walk right up to (a bowl).
  steer(goal, wantSpeed, dt, turnRate = 4, ignore = null) {
    if (goal) {
      const reach = ignore ? clamp(Math.hypot(goal.x - this.x, goal.z - this.z), 0.2, 0.6) : 0.6;
      const side = this.avoidSide;
      const free = this.freeHeading(Math.atan2(goal.x - this.x, goal.z - this.z), CAT_FEELERS.map((o) => o * side), reach, ignore);
      if (!free) wantSpeed = 0;
      else {
        if (free.off !== 0) this.avoidSide = Math.sign(free.off);
        let diff = free.angle - this.heading;
        diff = Math.atan2(Math.sin(diff), Math.cos(diff));
        this.heading += clamp(diff, -turnRate * dt, turnRate * dt);
        if (Math.abs(diff) > 1.2) wantSpeed *= 0.15; // still facing the wrong way
      }
    } else {
      wantSpeed = 0;
    }
    this.speed += clamp(wantSpeed - this.speed, -8 * dt, 5 * dt);
    if (this.speed > 0.01) {
      const nx = this.x + Math.sin(this.heading) * this.speed * dt, nz = this.z + Math.cos(this.heading) * this.speed * dt;
      if (this.blocked(nx, nz, ignore)) { this.speed = 0; this.stuck += dt; }
      else { this.x = nx; this.z = nz; this.stuck = 0; }
    }
  }

  // Petted by the player, or by `by` (the Gardener). True if it enjoyed it, false if it
  // walked off.
  pet(by = null) {
    // Cats are cats: sometimes they'd rather not. (Not while it's warm and dry out of
    // the rain, though.)
    if (this.state !== 'loaf' && this.state !== 'shelter' && Math.random() < 0.3) {
      this.state = 'wander';
      this.target = this.openSpot(by ?? cameraGroup.position, 8, 14);
      SFX.meow(distVol(this.x, this.z, 25));
      return false;
    }
    if (this.state === 'wander' || this.state === 'stalk') this.state = 'sit';
    this.timer = Math.max(this.timer, 8);
    this.hearts.spawn(this.head);
    SFX.purr(distVol(this.x, this.z, 20));
    return true;
  }

  // Is it settled (sitting, grooming or napping), so that someone could come and pet it?
  get settled() {
    return this.state === 'sit' || this.state === 'groom' || this.state === 'loaf';
  }

  // Someone's coming over to pet it: if it's settled, it stays put a while longer.
  hold(seconds) {
    if (this.settled) this.timer = Math.max(this.timer, seconds);
  }

  update(dt, t) {
    const dog = this.dog;
    const toDog = Math.hypot(dog.x - this.x, dog.z - this.z);
    // Rain: to the tea house, unless it's at a bowl or mid-pounce (it finishes first).
    // When it stops, back out of the door.
    // (Caught on its way out by another shower, it turns round and goes back in.)
    if (this.raining && (this.state === 'shelter' ? this.shelter.phase === 'out' : !['bowl', 'pounce'].includes(this.state))) this.startShelter();
    else if (!this.raining && this.state === 'shelter' && this.shelter.phase !== 'out') this.leaveShelter();
    // The dog! Run. (But not from the shelter: in there it's a truce.)
    if (toDog < 4 && this.state !== 'flee' && this.state !== 'shelter') {
      this.state = 'flee';
      this.timer = 2.5;
      const away = Math.atan2(this.x - dog.x, this.z - dog.z);
      this.target = { x: this.x + Math.sin(away) * 8, z: this.z + Math.cos(away) * 8 };
    }
    let goal = null, speed = 0, ignore = null;
    const want = { sit: 0, lie: 0, crouch: 0, groom: 0, eat: 0 };
    this.timer -= dt;
    this.hunger += dt * CAT_HUNGER;
    this.thirst += dt * CAT_THIRST;
    switch (this.state) {
      case 'wander': {
        // Hungry or thirsty? To the bowls, unless the dog is hanging about there (or it's raining).
        const meal = this.raining ? null : this.findMeal(CAT_REACH, dt);
        if (meal && Math.hypot(dog.x - meal.bowl.x, dog.z - meal.bowl.z) > CAT_DOG_CLEAR) {
          this.state = 'bowl'; this.meal = meal; this.target = null; this.stuck = 0;
          break;
        }
        if (!this.target) this.target = this.openSpot();
        goal = this.target; speed = CAT_SPEED.wander;
        if (Math.hypot(this.target.x - this.x, this.target.z - this.z) < 0.5 || this.stuck > 1.5) {
          const r = Math.random();
          this.state = r < 0.4 ? 'sit' : r < 0.65 ? 'groom' : 'loaf';
          this.timer = this.state === 'loaf' ? 12 + Math.random() * 15 : 4 + Math.random() * 6;
          this.target = null;
        }
        // Any birds pecking on the grass nearby? Worth a stalk.
        this.stalkCheck -= dt;
        if (this.stalkCheck <= 0) {
          this.stalkCheck = 2 + Math.random() * 3;
          this.prey = this.birds.list.find((b) => b.state === 'perched' && b.perch.ground &&
            Math.hypot(b.group.position.x - this.x, b.group.position.z - this.z) < 12) || null;
          if (this.prey) this.state = 'stalk';
        }
        break;
      }
      case 'sit': want.sit = 1; if (this.timer <= 0) this.state = 'wander'; break;
      case 'groom': want.sit = 1; want.groom = 1; if (this.timer <= 0) this.state = 'wander'; break;
      case 'loaf': want.lie = 1; if (this.timer <= 0) this.state = 'wander'; break;
      case 'stalk': {
        const b = this.prey;
        if (!b || b.state !== 'perched' || !b.perch.ground) { this.state = 'sit'; this.timer = 3; this.prey = null; break; }
        const bp = b.group.position;
        want.crouch = 1;
        goal = { x: bp.x, z: bp.z }; speed = CAT_SPEED.stalk;
        if (Math.hypot(bp.x - this.x, bp.z - this.z) < 1.5) {          // pounce!
          this.state = 'pounce'; this.pounceT = 0;
          this.heading = Math.atan2(bp.x - this.x, bp.z - this.z);
          b.takeOff({ x: this.x, z: this.z });                          // ...and the bird is gone
          this.prey = null;
        }
        break;
      }
      case 'pounce': {
        this.pounceT += dt;
        const nx = this.x + Math.sin(this.heading) * CAT_SPEED.pounce * dt, nz = this.z + Math.cos(this.heading) * CAT_SPEED.pounce * dt;
        if (!this.blocked(nx, nz)) { this.x = nx; this.z = nz; }
        if (this.pounceT >= 0.45) { this.state = 'sit'; this.timer = 4; }   // sits, pretending it meant to miss
        break;
      }
      case 'bowl': {
        const m = this.meal, g = m.eating ? null : this.mealGoal(dt, 0.2);
        if (m.eating) {
          // Crouch over the bowl, facing it, and lap (or nibble) away.
          let diff = m.heading - this.heading;
          this.heading += clamp(Math.atan2(Math.sin(diff), Math.cos(diff)), -3 * dt, 3 * dt);
          want.crouch = 1; want.eat = 1;
          if (this.pose.eat > 0.7) {
            if ((this.lapT -= dt) <= 0) {
              this.lapT = m.drink ? 0.35 : 0.6;
              SFX[m.drink ? 'lap' : 'munch'](distVol(this.x, this.z, 12) * 0.6);
            }
            if (this.eatFrom(m, dt, m.drink ? 0.12 : 0.2, m.drink ? 4 : 6)) {
              this.state = 'groom'; // a wash after every meal
              this.timer = 3 + Math.random() * 4;
            }
          }
        } else if (m.failed) {
          this.state = 'wander'; // can't get there, or someone else finished it
        } else {
          goal = g; ignore = m.bowl.solid;
          speed = m.path.length ? CAT_SPEED.wander : Math.min(CAT_SPEED.wander, Math.hypot(g.x - this.x, g.z - this.z) * 2 + 0.2);
        }
        break;
      }
      case 'shelter': {
        const g = this.shelterGoal(dt, 0.2);
        if (g === 'done') { this.endShelter(); break; }
        if (g) {
          goal = g;
          speed = this.shelter.path.length > 1 ? CAT_SPEED.wander : Math.min(CAT_SPEED.wander, Math.hypot(g.x - this.x, g.z - this.z) * 2 + 0.2);
          break;
        }
        // Settled in the dry: mostly curled up asleep, now and then sitting up for a wash.
        const diff = this.shelter.spot.heading - this.heading;
        this.heading += clamp(Math.atan2(Math.sin(diff), Math.cos(diff)), -3 * dt, 3 * dt);
        if (this.timer <= 0) {
          const r = Math.random();
          this.cozy = r < 0.6 ? 'loaf' : r < 0.8 ? 'sit' : 'groom';
          this.timer = this.cozy === 'loaf' ? 15 + Math.random() * 20 : 4 + Math.random() * 5;
        }
        if (this.cozy === 'loaf') want.lie = 1;
        else { want.sit = 1; if (this.cozy === 'groom') want.groom = 1; }
        break;
      }
      case 'flee':
        goal = this.target; speed = CAT_SPEED.flee;
        if (this.stuck > 0.3) { // cornered: try another way out
          this.target = this.openSpot({ x: this.x, z: this.z }, 5, 9);
          this.stuck = 0;
        }
        if (this.timer <= 0) { this.state = 'sit'; this.timer = 3; this.target = null; }
        break;
    }
    if (this.state !== 'pounce') this.steer(goal, speed, dt, this.state === 'flee' ? 10 : 4, ignore);
    this.syncSolid();
    this.animate(dt, t, want);
  }

  // Several pose weights (sit, lie, crouch, groom), each easing toward 0 or 1. Every
  // joint angle is a weighted sum of them, so poses blend smoothly into each other.
  animate(dt, t, want) {
    const ease = Math.min(1, dt * 5);
    for (const k in this.pose) this.pose[k] += (want[k] - this.pose[k]) * ease;
    const { sit, lie, crouch, groom, eat } = this.pose;
    const legs = this.legs;
    const moving = Math.min(1, this.speed / 1.2);
    const before = this.phase;
    this.phase += this.speed * dt * 9;
    this.stepPrint(before, 0.35, 0.07);
    const swing = Math.sin(this.phase) * 0.6 * moving * (1 - sit) * (1 - lie);
    const jump = this.state === 'pounce' ? Math.sin(Math.min(1, this.pounceT / 0.45) * Math.PI) * 0.45 : 0;
    const hipY = 0.34 + (0.15 - 0.34) * sit + (0.13 - 0.34) * lie + (0.24 - 0.34) * crouch;
    this.group.position.set(this.x, this.groundAt(this.x, this.z) + jump, this.z);
    this.group.rotation.y = this.heading;
    this.torso.position.y = hipY + Math.abs(Math.sin(this.phase)) * 0.015 * moving;
    this.torso.rotation.x = -0.6 * sit + 0.1 * crouch - (jump ? 0.25 : 0);
    legs.fl.rotation.x = 0.6 * sit - 1.45 * lie + swing - 1.1 * groom;  // grooming: one paw raised
    legs.fr.rotation.x = 0.6 * sit - 1.45 * lie - swing;
    legs.hl.position.y = legs.hr.position.y = hipY;
    legs.hl.rotation.x = -1.1 * sit - 1.45 * lie - swing;
    legs.hr.rotation.x = -1.1 * sit - 1.45 * lie + swing;
    // Head: licks its paw when grooming, rests when napping, else glances about.
    if (Math.random() < dt * 0.5) this.lookYaw = (Math.random() - 0.5) * 1.2;
    const look = this.state === 'stalk' || this.state === 'pounce' ? 0 : this.lookYaw * (1 - groom) * (1 - lie);
    this.head.rotation.y += (look + 0.45 * groom - this.head.rotation.y) * ease;
    // Eating: the head dips forward into the bowl and bobs as it laps.
    const lap = this.state === 'bowl' ? Math.sin(t * (this.meal.drink ? 16 : 10)) * 0.08 : 0;
    this.head.position.set(0, 0.13 - 0.12 * eat, 0.5 + 0.05 * eat);
    this.head.rotation.x = 0.45 * sit * (1 - groom) + (0.5 + Math.sin(t * 9) * 0.12) * groom + 0.35 * lie + (0.75 + lap) * eat;
    // Tail: up like a question mark when walking, curled round when resting, low and
    // twitching while stalking.
    const resting = Math.max(sit, lie);
    const tBend = [1 - 1.35 * resting - 0.9 * crouch, 0.25 - 0.25 * resting, 0.35 - 0.35 * resting];
    const tCurl = [0.9 * resting, 0.7 * resting, 0.6 * resting].map((v) => v * this.curlSide);
    this.tail.forEach((j, i) => {
      j.rotation.x = tBend[i];
      j.rotation.y = tCurl[i] + Math.sin(t * 2 + i + this.phase * 0.1) * 0.15 * (1 - resting)
        + (i === 2 ? Math.sin(t * 14) * 0.4 * crouch : 0);
    });
    // Eyes: shut while napping, blink now and then, and shine at night.
    this.blink -= dt;
    if (this.blink < 0) this.blink = 2 + Math.random() * 4;
    const napping = this.state === 'loaf' || (this.state === 'shelter' && this.cozy === 'loaf');
    const open = napping && lie > 0.5 ? 0.15 : this.blink < 0.12 ? 0.2 : 1;
    for (const e of this.eyes) e.scale.y = open;
    this.eyeMat.emissiveIntensity = 1.4 * env.nightMix * open;
    // The odd meow while wandering.
    this.meowT -= dt;
    if (this.meowT <= 0) {
      this.meowT = 15 + Math.random() * 30;
      if (this.state === 'wander') SFX.meow(distVol(this.x, this.z, 30));
    }
  }
}

// All the cats. They run from the `dog`, stalk the `birds`, show `hearts` when petted,
// leave paw prints in the `zenGarden`, eat and drink from the `bowls`, and shelter
// from the rain in the tea `house`.
export class Cats extends Feature {
  static PET_R = Cat.PET_R;

  constructor(ctx, { dog, birds, hearts, zenGarden, bowls, house }) {
    super(ctx);
    this.list = CAT_COATS.map((coat) => new Cat(ctx, { coat, parent: this.group, dog, birds, hearts, zenGarden, bowls, house }));
  }

  update(dt, t) {
    for (const c of this.list) c.update(dt, t);
  }
}
