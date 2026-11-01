import * as THREE from 'three';
import { cameraGroup } from './core/camera.js';
import { M } from './core/materials.js';
import { env, player } from './core/state.js';
import { solids, mounds } from './core/physics.js';
import { trees } from './world/trees.js';
import { lanterns } from './world/lanterns.js';
import { pond } from './world/pond.js';
import { torii } from './world/torii.js';
import { teaHouse } from './world/teaHouse.js';
import { flowers } from './world/flowers.js';
import { steppingStones } from './world/steppingStones.js';
import { setNight } from './effects/dayNight.js';
import { setSound } from './audio/audio.js';
import { koi } from './animals/koi.js';
import { pellets, tryFeed } from './animals/feeding.js';
import { dog, petDog, isDogSolid } from './animals/dog.js';
import { birds } from './animals/birds.js';
import { cats, petCat } from './animals/cats.js';
import { nearestPettable } from './animals/interaction.js';
import { clampPitch } from './player/look.js';
import { updateStatus } from './player/flight.js';
import { setHelpVisible } from './ui/help.js';

// ---- Console / automation hooks: window.garden ----
// For testing and screenshots from the browser console, e.g.
//   garden.setView({ x: 0, y: 12, z: 10, yaw: 0, pitch: -0.8, fly: true })
window.garden = {
  // What actually got placed (trees that found no room are skipped).
  layout: { trees: trees.list.length, cherries: trees.cherryCrowns.length, lanterns: lanterns.list.length },
  // Jump the camera to an exact viewpoint.
  setView({ x, y, z, yaw: newYaw, pitch: newPitch, fly } = {}) {
    if (fly !== undefined) player.flyMode = fly;
    const p = cameraGroup.position;
    if (x !== undefined) p.x = x;
    if (y !== undefined) p.y = y;
    if (z !== undefined) p.z = z;
    if (newYaw !== undefined) player.yaw = newYaw;
    if (newPitch !== undefined) player.pitch = clampPitch(newPitch);
    player.verticalVel = 0;
    player.onGround = false;
    updateStatus();
    setHelpVisible(false);
    return this.getView();
  },
  getView() {
    const { x, y, z } = cameraGroup.position;
    return { x, y, z, yaw: player.yaw, pitch: player.pitch, fly: player.flyMode };
  },
  // garden.setNight(true) fades to night; pass instant = true to skip the fade.
  setNight(on, instant = false) {
    setNight(on);
    if (instant) env.nightMix = on ? 1 : 0;
  },
  setSound,
  feed: tryFeed,
  // Pets whichever animal is in reach: 'dog', 'cat' (purred), 'cat:aloof' (walked off), or null.
  pet: () => {
    const pet = nearestPettable();
    if (!pet) return null;
    if (pet.kind === 'dog') { petDog(); return 'dog'; }
    return petCat(pet.cat) ? 'cat' : 'cat:aloof';
  },
  cats: () => cats.map((c) => ({ name: c.name, state: c.state, x: c.x, z: c.z, speed: c.speed })),
  // Put the dog somewhere (for testing how the cats react).
  moveDog: (x, z) => { dog.x = x; dog.z = z; },
  dog: () => ({ x: dog.x, z: dog.z, state: dog.state, sit: dog.sit, speed: dog.speed }),
  birds: () => birds.map((b) => {
    const { x, y, z } = b.root.position;
    const parent = b.perch.ground ? 'grass' : b.perch.parent === null ? 'fence'
      : lanterns.list.some((l) => l.group === b.perch.parent) ? 'lantern' : b.perch.parent === torii.group ? 'torii'
      : b.perch.parent === teaHouse.group ? 'tea house' : 'tree';
    return { species: b.species, state: b.state, on: parent, x, y, z };
  }),
  // How many pellets are on the water, and where the koi are (pond-local).
  pond() {
    return { pellets: pellets.length, koi: koi.map((k) => ({ x: k.userData.x, z: k.userData.z })) };
  },
  // Layout fingerprint: everything rand() placed, rounded, plus a short hash. If a change
  // alters the hash, it altered the garden's layout (e.g. by changing the order in which
  // modules call rand(); see main.js).
  fingerprint() {
    const r = (v) => Math.round(v * 1000) / 1000;
    const animalSolids = new Set(cats.map((c) => c.solid));
    const data = {
      mounds: mounds.map((m) => [r(m.x), r(m.z), r(m.r)]),
      solids: solids.filter((s) => !isDogSolid(s) && !animalSolids.has(s)).map((s) => (s.r !== undefined
        ? [r(s.x), r(s.z), r(s.r), r(s.h)] : [r(s.minX), r(s.maxX), r(s.minZ), r(s.maxZ), r(s.h)])),
      trees: trees.list.map((tr) => {
        const g = tr.crown.parent;
        return [r(g.position.x), r(g.position.z), r(g.scale.x), r(g.rotation.y),
          tr.crown.children.map((c) => [r(c.position.x), r(c.position.y), r(c.position.z)])];
      }),
      flowers: flowers.group.children.filter((o) => o.material === M.flower).map((o) => [r(o.position.x), r(o.position.z)]),
      stones: steppingStones.group.children.filter((o) => o.material === M.stone && o.geometry.type === 'CylinderGeometry')
        .map((o) => [r(o.position.x), r(o.position.z), r(o.rotation.y), r(o.geometry.parameters.radiusTop)]),
      pads: pond.group.children.filter((o) => o.geometry?.type === 'CircleGeometry' && o.material.side === THREE.DoubleSide)
        .map((o) => [r(o.position.x), r(o.position.z), r(o.rotation.z)]),
      koi: koi.map((k) => [r(k.scale.x), r(k.userData.radius), k.children.length]),
    };
    const json = JSON.stringify(data);
    let h = 5381;
    for (let i = 0; i < json.length; i++) h = (Math.imul(h, 33) ^ json.charCodeAt(i)) >>> 0;
    const counts = Object.fromEntries(Object.entries(data).map(([k, v]) => [k, v.length]));
    return { hash: h.toString(16), counts };
  },
};
