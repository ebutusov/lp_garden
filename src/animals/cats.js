import * as THREE from 'three';
import { scene } from '../core/scene.js';
import { mat } from '../core/materials.js';
import { clamp } from '../core/random.js';
import { cameraGroup } from '../core/camera.js';
import { env } from '../core/state.js';
import { solids, groundBlocked, surfaceHeightAt } from '../core/physics.js';
import { SFX, distVol } from '../audio/sfx.js';
import { spawnHeart } from './hearts.js';
import { dog } from './dog.js';
import { birds, takeOff } from './birds.js';

// ---- Cats ----
// Three cats with their own routines: they wander, sit, groom, curl up for a nap, stalk
// birds on the grass (and pounce, always a moment too late), and bolt when the dog comes
// near. You can pet them, if they're in the mood. Their eyes shine in the dark.
const CAT_R = 0.3;
export const CAT_PET_R = 2.4;
const CAT_SPEED = { wander: 1.1, stalk: 0.7, flee: 4.5, pounce: 5 };
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

// Cat faces +Z. Like the dog, the torso pivots at the hips so it can sit.
function makeCat(coat) {
  const m = (c) => mat(c, { roughness: 0.85 });
  const BASE = m(coat.base), CHEST = m(coat.chest), DARK = m(0x111111);
  const blob = (material, sx, sy, sz, x, y, z, parent) => {
    const mesh = new THREE.Mesh(new THREE.IcosahedronGeometry(1, 0), material);
    mesh.scale.set(sx, sy, sz);
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    parent.add(mesh);
    return mesh;
  };
  const root = new THREE.Group();
  const torso = new THREE.Group();
  torso.position.set(0, 0.34, -0.2);
  root.add(torso);
  blob(BASE, 0.15, 0.14, 0.3, 0, 0, 0.2, torso);
  blob(CHEST, 0.1, 0.1, 0.1, 0, -0.04, 0.42, torso);
  for (const [c, x, y, z, sx, sz] of coat.marks) blob(m(c), sx, 0.03, sz, x, y, z, torso);
  const head = new THREE.Group();
  head.position.set(0, 0.13, 0.5);
  torso.add(head);
  blob(BASE, 0.13, 0.12, 0.12, 0, 0, 0, head);
  blob(CHEST, 0.055, 0.04, 0.045, 0, -0.04, 0.1, head);               // muzzle
  blob(m(0xd88a8a), 0.014, 0.01, 0.01, 0, -0.02, 0.142, head);        // nose
  for (const [c, x, y, z, sx, sz] of coat.headMarks) blob(m(c), sx, 0.03, sz, x, y, z, head);
  // Eyes glow at night (eyeshine); they close (squash flat) when asleep or blinking.
  // Each cat gets its own eye material so its glow can be set on its own.
  const eyeMat = new THREE.MeshStandardMaterial({
    color: coat.eye, emissive: coat.eye, emissiveIntensity: 0, roughness: 0.3, flatShading: true,
  });
  const eyes = [1, -1].map((s) => {
    const eye = new THREE.Group();
    eye.position.set(s * 0.05, 0.025, 0.1);
    blob(eyeMat, 0.022, 0.022, 0.012, 0, 0, 0, eye);
    blob(DARK, 0.006, 0.018, 0.006, 0, 0, 0.012, eye);                // slit pupil
    head.add(eye);
    const ear = new THREE.Mesh(new THREE.ConeGeometry(0.045, 0.09, 3), BASE);
    ear.position.set(s * 0.065, 0.11, -0.01);
    ear.rotation.z = -s * 0.2;
    head.add(ear);
    return eye;
  });
  // Tail: three jointed segments pointing back (-Z); each joint bends the rest.
  // Each joint is the child of the previous one (a "kinematic chain"), so bending
  // joint 1 carries joints 2 and 3 with it, and small angles add up to a curl.
  const tail = [];
  let parent = torso, z0 = -0.07, y0 = 0.04;
  for (let i = 0; i < 3; i++) {
    const joint = new THREE.Group();
    joint.position.set(0, y0, z0);
    const seg = new THREE.Mesh(
      new THREE.CylinderGeometry(0.022, 0.026, 0.16, 5).rotateX(Math.PI / 2),
      i === 2 && coat.tailTip ? m(coat.tailTip) : BASE
    );
    seg.position.z = -0.08;
    seg.castShadow = true;
    joint.add(seg);
    parent.add(joint);
    tail.push(joint);
    parent = joint; z0 = -0.16; y0 = 0;
  }
  const leg = (par, x, y, z, len) => {
    const pivot = new THREE.Group();
    pivot.position.set(x, y, z);
    const l = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.026, len, 5), BASE);
    l.position.y = -len / 2;
    l.castShadow = true;
    pivot.add(l);
    blob(CHEST, 0.032, 0.02, 0.04, 0, -len, 0.01, pivot);             // paw
    par.add(pivot);
    return pivot;
  };
  const legs = {
    fl: leg(torso, 0.07, -0.06, 0.38, 0.3), fr: leg(torso, -0.07, -0.06, 0.38, 0.3),
    hl: leg(root, 0.07, 0.34, -0.2, 0.34), hr: leg(root, -0.07, 0.34, -0.2, 0.34),
  };
  scene.add(root);
  return { root, torso, head, tail, legs, eyes, eyeMat };
}

export const cats = CAT_COATS.map((coat) => {
  const c = {
    ...makeCat(coat), name: coat.name,
    solid: { x: 0, z: 0, r: CAT_R, h: 0.8 },
    x: 0, z: 0, heading: Math.random() * Math.PI * 2, speed: 0,
    state: 'wander', target: null, timer: 0, prey: null, pounceT: 0, stalkCheck: 2 + Math.random() * 3,
    pose: { sit: 0, lie: 0, crouch: 0, groom: 0 }, tailBend: [1, 0.25, 0.35], tailCurl: [0, 0, 0],
    phase: 0, blink: 3, lookYaw: 0, meowT: 10 + Math.random() * 20, curlSide: Math.random() < 0.5 ? 1 : -1,
  };
  solids.push(c.solid); // the player (and the dog) can't walk through a cat
  return c;
});
const catBlocked = (c, x, z) => groundBlocked(x, z, CAT_R, c.solid);
function openSpotFor(c, near = null, minD = 0, maxD = 40) {
  for (let i = 0; i < 40; i++) {
    const a = Math.random() * Math.PI * 2;
    const d = near ? minD + Math.random() * (maxD - minD) : 6 + Math.random() * 36;
    const x = (near ? near.x : 0) + Math.cos(a) * d, z = (near ? near.z : 0) + Math.sin(a) * d;
    if (!catBlocked(c, x, z)) return { x, z };
  }
  return { x: c.x, z: c.z };
}
for (const c of cats) {
  Object.assign(c, openSpotFor(c));
  c.solid.x = c.x; c.solid.z = c.z;
}

// Head toward a goal, swerving around obstacles (same idea as the dog's steering).
// Turns mostly on the spot first, so it doesn't run the wrong way (e.g. into the dog).
function steerCat(c, goal, wantSpeed, dt, turnRate = 4) {
  if (goal) {
    const desired = Math.atan2(goal.x - c.x, goal.z - c.z);
    let chosen = null;
    for (const off of [0, 0.45, -0.45, 0.9, -0.9, 1.4, -1.4, 2, -2]) {
      const a = desired + off;
      if (!catBlocked(c, c.x + Math.sin(a) * 0.6, c.z + Math.cos(a) * 0.6)) { chosen = a; break; }
    }
    if (chosen === null) wantSpeed = 0;
    else {
      let diff = chosen - c.heading;
      diff = Math.atan2(Math.sin(diff), Math.cos(diff));
      c.heading += clamp(diff, -turnRate * dt, turnRate * dt);
      if (Math.abs(diff) > 1.2) wantSpeed *= 0.15; // still facing the wrong way
    }
  } else {
    wantSpeed = 0;
  }
  c.speed += clamp(wantSpeed - c.speed, -8 * dt, 5 * dt);
  if (c.speed > 0.01) {
    const nx = c.x + Math.sin(c.heading) * c.speed * dt, nz = c.z + Math.cos(c.heading) * c.speed * dt;
    if (catBlocked(c, nx, nz)) { c.speed = 0; c.stuck = (c.stuck || 0) + dt; }
    else { c.x = nx; c.z = nz; c.stuck = 0; }
  }
}

export function petCat(c) {
  // Cats are cats: sometimes they'd rather not.
  if (c.state !== 'loaf' && Math.random() < 0.3) {
    c.state = 'wander';
    c.target = openSpotFor(c, cameraGroup.position, 8, 14);
    SFX.meow(distVol(c.x, c.z, 25));
    return false;
  }
  if (c.state === 'wander' || c.state === 'stalk') c.state = 'sit';
  c.timer = Math.max(c.timer, 8);
  spawnHeart(c.head);
  SFX.purr(distVol(c.x, c.z, 20));
  return true;
}

export function updateCats(dt, t) {
  for (const c of cats) {
    const toDog = Math.hypot(dog.x - c.x, dog.z - c.z);
    if (toDog < 4 && c.state !== 'flee') {                       // the dog! run
      c.state = 'flee';
      c.timer = 2.5;
      const away = Math.atan2(c.x - dog.x, c.z - dog.z);
      c.target = { x: c.x + Math.sin(away) * 8, z: c.z + Math.cos(away) * 8 };
    }
    let goal = null, speed = 0;
    const want = { sit: 0, lie: 0, crouch: 0, groom: 0 };
    c.timer -= dt;
    switch (c.state) {
      case 'wander': {
        if (!c.target) c.target = openSpotFor(c);
        goal = c.target; speed = CAT_SPEED.wander;
        if (Math.hypot(c.target.x - c.x, c.target.z - c.z) < 0.5 || c.stuck > 1.5) {
          const r = Math.random();
          c.state = r < 0.4 ? 'sit' : r < 0.65 ? 'groom' : 'loaf';
          c.timer = c.state === 'loaf' ? 12 + Math.random() * 15 : 4 + Math.random() * 6;
          c.target = null;
        }
        // Any birds pecking on the grass nearby? Worth a stalk.
        c.stalkCheck -= dt;
        if (c.stalkCheck <= 0) {
          c.stalkCheck = 2 + Math.random() * 3;
          c.prey = birds.find((b) => b.state === 'perched' && b.perch.ground &&
            Math.hypot(b.root.position.x - c.x, b.root.position.z - c.z) < 12) || null;
          if (c.prey) c.state = 'stalk';
        }
        break;
      }
      case 'sit': want.sit = 1; if (c.timer <= 0) c.state = 'wander'; break;
      case 'groom': want.sit = 1; want.groom = 1; if (c.timer <= 0) c.state = 'wander'; break;
      case 'loaf': want.lie = 1; if (c.timer <= 0) c.state = 'wander'; break;
      case 'stalk': {
        const b = c.prey;
        if (!b || b.state !== 'perched' || !b.perch.ground) { c.state = 'sit'; c.timer = 3; c.prey = null; break; }
        const bp = b.root.position;
        want.crouch = 1;
        goal = { x: bp.x, z: bp.z }; speed = CAT_SPEED.stalk;
        if (Math.hypot(bp.x - c.x, bp.z - c.z) < 1.5) {          // pounce!
          c.state = 'pounce'; c.pounceT = 0;
          c.heading = Math.atan2(bp.x - c.x, bp.z - c.z);
          takeOff(b, { x: c.x, z: c.z });                         // ...and the bird is gone
          c.prey = null;
        }
        break;
      }
      case 'pounce': {
        c.pounceT += dt;
        const nx = c.x + Math.sin(c.heading) * CAT_SPEED.pounce * dt, nz = c.z + Math.cos(c.heading) * CAT_SPEED.pounce * dt;
        if (!catBlocked(c, nx, nz)) { c.x = nx; c.z = nz; }
        if (c.pounceT >= 0.45) { c.state = 'sit'; c.timer = 4; }   // sits, pretending it meant to miss
        break;
      }
      case 'flee':
        goal = c.target; speed = CAT_SPEED.flee;
        if (c.stuck > 0.3) { // cornered: try another way out
          c.target = openSpotFor(c, { x: c.x, z: c.z }, 5, 9);
          c.stuck = 0;
        }
        if (c.timer <= 0) { c.state = 'sit'; c.timer = 3; c.target = null; }
        break;
    }
    if (c.state !== 'pounce') steerCat(c, goal, speed, dt, c.state === 'flee' ? 10 : 4);
    c.solid.x = c.x; c.solid.z = c.z;

    // ---- pose ----
    // Several pose weights (sit, lie, crouch, groom), each easing toward 0 or 1. Every
    // joint angle is a weighted sum of them, so poses blend smoothly into each other.
    const ease = Math.min(1, dt * 5);
    for (const k in c.pose) c.pose[k] += (want[k] - c.pose[k]) * ease;
    const { sit, lie, crouch, groom } = c.pose;
    const moving = Math.min(1, c.speed / 1.2);
    c.phase += c.speed * dt * 9;
    const swing = Math.sin(c.phase) * 0.6 * moving * (1 - sit) * (1 - lie);
    const jump = c.state === 'pounce' ? Math.sin(Math.min(1, c.pounceT / 0.45) * Math.PI) * 0.45 : 0;
    const hipY = 0.34 + (0.15 - 0.34) * sit + (0.13 - 0.34) * lie + (0.24 - 0.34) * crouch;
    c.root.position.set(c.x, surfaceHeightAt(c.x, c.z) + jump, c.z);
    c.root.rotation.y = c.heading;
    c.torso.position.y = hipY + Math.abs(Math.sin(c.phase)) * 0.015 * moving;
    c.torso.rotation.x = -0.6 * sit + 0.1 * crouch - (jump ? 0.25 : 0);
    c.legs.fl.rotation.x = 0.6 * sit - 1.45 * lie + swing - 1.1 * groom;  // grooming: one paw raised
    c.legs.fr.rotation.x = 0.6 * sit - 1.45 * lie - swing;
    c.legs.hl.position.y = c.legs.hr.position.y = hipY;
    c.legs.hl.rotation.x = -1.1 * sit - 1.45 * lie - swing;
    c.legs.hr.rotation.x = -1.1 * sit - 1.45 * lie + swing;
    // Head: licks its paw when grooming, rests when napping, else glances about.
    if (Math.random() < dt * 0.5) c.lookYaw = (Math.random() - 0.5) * 1.2;
    const look = c.state === 'stalk' || c.state === 'pounce' ? 0 : c.lookYaw * (1 - groom) * (1 - lie);
    c.head.rotation.y += (look + 0.45 * groom - c.head.rotation.y) * ease;
    c.head.rotation.x = 0.45 * sit * (1 - groom) + (0.5 + Math.sin(t * 9) * 0.12) * groom + 0.35 * lie;
    // Tail: up like a question mark when walking, curled round when resting, low and
    // twitching while stalking.
    const resting = Math.max(sit, lie);
    const tBend = [1 - 1.35 * resting - 0.9 * crouch, 0.25 - 0.25 * resting, 0.35 - 0.35 * resting];
    const tCurl = [0.9 * resting, 0.7 * resting, 0.6 * resting].map((v) => v * c.curlSide);
    c.tail.forEach((j, i) => {
      j.rotation.x = tBend[i];
      j.rotation.y = tCurl[i] + Math.sin(t * 2 + i + c.phase * 0.1) * 0.15 * (1 - resting)
        + (i === 2 ? Math.sin(t * 14) * 0.4 * crouch : 0);
    });
    // Eyes: shut while napping, blink now and then, and shine at night.
    c.blink -= dt;
    if (c.blink < 0) c.blink = 2 + Math.random() * 4;
    const open = c.state === 'loaf' && lie > 0.5 ? 0.15 : c.blink < 0.12 ? 0.2 : 1;
    for (const e of c.eyes) e.scale.y = open;
    c.eyeMat.emissiveIntensity = 1.4 * env.nightMix * open;
    // The odd meow while wandering.
    c.meowT -= dt;
    if (c.meowT <= 0) {
      c.meowT = 15 + Math.random() * 30;
      if (c.state === 'wander') SFX.meow(distVol(c.x, c.z, 30));
    }
  }
}
