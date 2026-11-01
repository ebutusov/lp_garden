import * as THREE from 'three';
import { scene } from '../core/scene.js';
import { mat } from '../core/materials.js';
import { clamp } from '../core/random.js';
import { cameraGroup } from '../core/camera.js';
import { player } from '../core/state.js';
import { solids, groundBlocked, surfaceHeightAt, PLAYER_HEIGHT } from '../core/physics.js';
import { SFX, distVol } from '../audio/sfx.js';
import { spawnHeart } from './hearts.js';

// ---- A friendly Shiba Inu ----
// Wanders between random spots, stops to sit or sniff, greets and follows the player,
// and can be petted. It keeps off the pond, bridge, gravel garden and tea house.
const DOG_R = 0.45;                        // collision radius
const DOG_SPEED = { walk: 2.2, trot: 4.5 };
const DOG_GREET_R = 8;                     // notices the player within this distance
const DOG_GIVE_UP_R = 16;                  // stops following beyond this
const DOG_SIT_DIST = 2;                    // how close it sits by the player
export const DOG_PET_R = 3;                // petting reach

// The model is a hierarchy of groups acting as joints, a hand-built "skeleton":
//   root (position + heading) → torso (pivots at the hips, to sit) → head, tail, front legs
//   root → hind legs
// Animating is then just setting a few rotations each frame; every child follows its
// parent. Each body part is an icosahedron "blob" scaled into shape.
function makeDog() {
  const COAT = mat(0xd9894a), CREAM = mat(0xf3e3c8), DARK = mat(0x2a2220);
  const blob = (m, sx, sy, sz, x, y, z, parent) => {
    const mesh = new THREE.Mesh(new THREE.IcosahedronGeometry(1, 0), m);
    mesh.scale.set(sx, sy, sz);
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    parent.add(mesh);
    return mesh;
  };
  // Dog faces +Z. The torso pivots at the hips so it can sit.
  const root = new THREE.Group();
  root.scale.setScalar(1.1);
  const torso = new THREE.Group();
  torso.position.set(0, 0.52, -0.28);
  root.add(torso);
  blob(COAT, 0.22, 0.2, 0.44, 0, 0, 0.3, torso);        // body
  blob(CREAM, 0.15, 0.13, 0.18, 0, -0.07, 0.6, torso);  // chest
  const head = new THREE.Group();
  head.position.set(0, 0.2, 0.72);
  torso.add(head);
  blob(COAT, 0.19, 0.18, 0.2, 0, 0, 0, head);
  blob(CREAM, 0.1, 0.08, 0.13, 0, -0.06, 0.17, head);   // muzzle
  blob(DARK, 0.035, 0.03, 0.03, 0, -0.03, 0.3, head);   // nose
  for (const s of [1, -1]) {
    blob(DARK, 0.025, 0.03, 0.02, s * 0.09, 0.05, 0.16, head);  // eyes
    blob(CREAM, 0.07, 0.06, 0.06, s * 0.1, -0.06, 0.08, head);  // cheeks
    const ear = new THREE.Mesh(new THREE.ConeGeometry(0.075, 0.16, 4), COAT);
    ear.position.set(s * 0.11, 0.19, 0);
    ear.rotation.z = -s * 0.25;
    ear.castShadow = true;
    head.add(ear);
  }
  // Curled tail over the back; the pivot swings it side to side.
  // A partial torus (1.6π of a full ring) makes the curl.
  const tail = new THREE.Group();
  tail.position.set(0, 0.16, -0.08);
  torso.add(tail);
  const curl = new THREE.Mesh(new THREE.TorusGeometry(0.1, 0.04, 5, 10, Math.PI * 1.6), COAT);
  curl.rotation.y = Math.PI / 2;
  curl.position.y = 0.08;
  curl.castShadow = true;
  tail.add(curl);
  // Legs hang from pivots at the shoulders (on the torso) and hips (on the root).
  // The leg mesh is shifted down by half its length, so the pivot is at its top end.
  const leg = (parent, x, y, z, len) => {
    const pivot = new THREE.Group();
    pivot.position.set(x, y, z);
    const l = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.04, len, 5), COAT);
    l.position.y = -len / 2;
    l.castShadow = true;
    pivot.add(l);
    blob(CREAM, 0.055, 0.035, 0.07, 0, -len, 0.02, pivot); // paw
    parent.add(pivot);
    return pivot;
  };
  const legs = {
    fl: leg(torso, 0.12, -0.08, 0.6, 0.42), fr: leg(torso, -0.12, -0.08, 0.6, 0.42),
    hl: leg(root, 0.12, 0.52, -0.28, 0.5), hr: leg(root, -0.12, 0.52, -0.28, 0.5),
  };
  scene.add(root);
  return { root, torso, head, tail, legs };
}

const dogSolid = { x: 0, z: 0, r: DOG_R, h: 1.2 }; // so the player can't walk through it
solids.push(dogSolid);
export const isDogSolid = (s) => s === dogSolid;

export const dogBlocked = (x, z) => groundBlocked(x, z, DOG_R, dogSolid);
function pickDogWaypoint() {
  for (let i = 0; i < 40; i++) {
    const a = Math.random() * Math.PI * 2, d = 6 + Math.random() * 36;
    const x = Math.cos(a) * d, z = Math.sin(a) * d;
    if (!dogBlocked(x, z)) return { x, z };
  }
  return { x: dog.x, z: dog.z };
}

// The dog is a small state machine: 'wander' to a waypoint, 'rest' (sit or sniff),
// or 'follow' the player. Its logical state (x, z, heading, speed) is kept apart from
// the meshes; the pose code at the end of updateDog turns that state into rotations.
export const dog = {
  ...makeDog(),
  x: 7, z: 38, heading: Math.PI, speed: 0,
  state: 'wander', target: null, timer: 0, restSit: false,
  sit: 0, phase: 0, happy: 0, cooldown: 0, stuck: 0, avoidSide: 1, lookYaw: 0,
};
if (dogBlocked(dog.x, dog.z)) Object.assign(dog, pickDogWaypoint());

export function petDog() {
  dog.state = 'follow';
  dog.happy = 3;
  spawnHeart(dog.head);
  SFX.yip(distVol(dog.x, dog.z, 30));
}

export function updateDog(dt, t) {
  const p = cameraGroup.position;
  const toPlayer = Math.hypot(p.x - dog.x, p.z - dog.z);
  const playerAround = !player.flyMode && p.y - PLAYER_HEIGHT < 3; // on (or near) the ground
  dog.cooldown -= dt;
  dog.happy = Math.max(0, dog.happy - dt);

  if (dog.state !== 'follow' && playerAround && toPlayer < DOG_GREET_R && dog.cooldown <= 0) {
    dog.state = 'follow';
    dog.happy = 2;
    SFX.bark(distVol(dog.x, dog.z, 40));
  } else if (dog.state === 'follow' && (!playerAround || toPlayer > DOG_GIVE_UP_R)) {
    dog.state = 'wander';
    dog.target = null;
    dog.cooldown = 12; // don't re-greet straight away
  }

  let goal = null, wantSpeed = 0, sitting = false;
  if (dog.state === 'follow') {
    // If the player is somewhere the dog won't go (wading, on the gravel, in the
    // tea house), it sits at the edge and waits once it's reasonably close.
    const waitAtEdge = dogBlocked(p.x, p.z) && (toPlayer < 6 || dog.stuck > 0.5);
    if (waitAtEdge) {
      sitting = true;
    } else if (toPlayer > DOG_SIT_DIST + 0.6) {
      goal = { x: p.x, z: p.z };
      wantSpeed = toPlayer > 5 ? DOG_SPEED.trot : DOG_SPEED.walk;
    } else {
      sitting = true;
    }
  } else if (dog.state === 'wander') {
    if (!dog.target) { dog.target = pickDogWaypoint(); dog.stuck = 0; }
    if (Math.hypot(dog.target.x - dog.x, dog.target.z - dog.z) < 0.6 || dog.stuck > 1.5) {
      dog.state = 'rest';
      dog.timer = 2 + Math.random() * 4;
      dog.restSit = Math.random() < 0.5;
      dog.target = null;
    } else {
      goal = dog.target;
      wantSpeed = DOG_SPEED.walk;
    }
  } else { // rest: sit, or stand and sniff the ground
    sitting = dog.restSit;
    dog.timer -= dt;
    if (dog.timer <= 0) dog.state = 'wander';
  }

  if (goal) {
    // Head for the goal, swerving around anything in the way (keeping to one side).
    // "Feelers": probe a point a little ahead in the desired direction, then at
    // widening angles either side, and take the first one that's free. Far simpler
    // than real path-finding, and good enough in an open garden.
    const desired = Math.atan2(goal.x - dog.x, goal.z - dog.z);
    const s = dog.avoidSide;
    let chosen = null;
    for (const off of [0, s * 0.45, -s * 0.45, s * 0.9, -s * 0.9, s * 1.4, -s * 1.4, s * 2, -s * 2]) {
      const a = desired + off;
      if (!dogBlocked(dog.x + Math.sin(a) * 0.9, dog.z + Math.cos(a) * 0.9)) {
        chosen = a;
        if (off !== 0) dog.avoidSide = Math.sign(off);
        break;
      }
    }
    if (chosen === null) {
      wantSpeed = 0; // nowhere to go (e.g. the player is in the pond): wait
      if (dog.state === 'follow') sitting = true;
    } else {
      let diff = chosen - dog.heading;
      diff = Math.atan2(Math.sin(diff), Math.cos(diff));
      dog.heading += clamp(diff, -5 * dt, 5 * dt);
    }
  }
  dog.speed += clamp(wantSpeed - dog.speed, -8 * dt, 6 * dt);
  if (dog.speed > 0.01) {
    const nx = dog.x + Math.sin(dog.heading) * dog.speed * dt;
    const nz = dog.z + Math.cos(dog.heading) * dog.speed * dt;
    if (dogBlocked(nx, nz)) { dog.speed = 0; dog.stuck += dt; }
    else { dog.x = nx; dog.z = nz; dog.stuck = 0; }
  }
  dogSolid.x = dog.x; dogSolid.z = dog.z;

  // ---- pose ----
  // `sit` eases between 0 (standing) and 1 (sitting); every joint angle is a blend of
  // its standing and sitting value, plus a walk cycle. One number drives the whole
  // transition, so the dog never pops between poses.
  dog.sit += ((sitting && dog.speed < 0.3 ? 1 : 0) - dog.sit) * Math.min(1, dt * 6);
  const sit = dog.sit, moving = Math.min(1, dog.speed / 2);
  // Walk cycle: the phase advances with distance travelled, so the legs never slide.
  dog.phase += dog.speed * dt * 6;
  const swing = Math.sin(dog.phase) * 0.55 * moving * (1 - sit);
  const hipY = 0.52 + (0.24 - 0.52) * sit;
  dog.root.position.set(dog.x, surfaceHeightAt(dog.x, dog.z), dog.z);
  dog.root.rotation.y = dog.heading;
  dog.torso.position.y = hipY + Math.abs(Math.sin(dog.phase)) * 0.03 * moving;
  dog.torso.rotation.x = -0.55 * sit;                       // sitting tips the body up
  dog.legs.fl.rotation.x = 0.55 * sit + swing;              // front legs stay upright
  dog.legs.fr.rotation.x = 0.55 * sit - swing;
  dog.legs.hl.position.y = dog.legs.hr.position.y = hipY;
  dog.legs.hl.rotation.x = -1.05 * sit - swing;             // hind legs fold forward
  dog.legs.hr.rotation.x = -1.05 * sit + swing;
  // Look at the player when close, with a little head tilt while sitting with them.
  let look = 0;
  if (dog.state === 'follow' && toPlayer < 7) {
    look = Math.atan2(p.x - dog.x, p.z - dog.z) - dog.heading;
    look = clamp(Math.atan2(Math.sin(look), Math.cos(look)), -0.9, 0.9);
  }
  dog.lookYaw += (look - dog.lookYaw) * Math.min(1, dt * 5);
  dog.head.rotation.y = dog.lookYaw;
  const sniffing = dog.state === 'rest' && !dog.restSit;
  dog.head.rotation.x = 0.45 * sit + (sniffing ? 0.45 + Math.sin(t * 7) * 0.06 : 0);
  dog.head.rotation.z = dog.state === 'follow' ? Math.sin(t * 1.3) * 0.15 * sit : 0;
  const excited = dog.happy > 0 || dog.state === 'follow';
  dog.tail.rotation.y = Math.sin(t * (excited ? 16 : 6)) * (dog.happy > 0 ? 0.6 : excited ? 0.4 : 0.2);
}
