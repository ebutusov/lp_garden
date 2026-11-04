import * as THREE from 'three';
import { cameraGroup } from './core/camera.js';
import { M } from './core/materials.js';
import { env, player } from './core/state.js';
import { setNight } from './effects/dayNight.js';
import { setSound } from './audio/audio.js';
import { clampPitch } from './player/look.js';
import { updateStatus } from './player/flight.js';
import { setHelpVisible } from './ui/help.js';

// ---- Console / automation hooks: window.garden ----
// For testing and screenshots from the browser console, e.g.
//   garden.setView({ x: 0, y: 12, z: 10, yaw: 0, pitch: -0.8, fly: true })
// main.js installs them once the garden is built, handing over what they inspect.
export function installDebug(garden, { physics }) {
  const { trees, lanterns, pond, flowers, steppingStones, koi, feeding, dog, birds, cats, gardener, butterflies, zenGarden, interaction, grass } = garden;
  const { solids, mounds } = physics;
  window.garden = {
    // What actually got placed (trees that found no room are skipped).
    layout: {
      trees: trees.list.length, cherries: trees.cherryCrowns.length, lanterns: lanterns.list.length,
      grassTufts: grass.count, grassTiles: grass.group.children.length,
      butterflies: butterflies.list.length, butterflyLandings: butterflies.landings.length,
    },
    // The grass shader's current wind and pushers (player, dog, cats: x, z, radius, strength).
    grass: () => ({
      wind: grass.uniforms.uWind.value,
      pushers: grass.uniforms.uPushers.value.map((p) => p.toArray().map((v) => Math.round(v * 100) / 100)),
    }),
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
    feed: () => feeding.tryFeed(),
    // Pets whichever animal is in reach: 'dog', 'cat' (purred), 'cat:aloof' (walked off), or null.
    pet: () => {
      const pet = interaction.nearestPettable();
      if (!pet) return null;
      if (pet.kind === 'dog') { pet.animal.pet(); return 'dog'; }
      return pet.animal.pet() ? 'cat' : 'cat:aloof';
    },
    cats: () => cats.list.map((c) => ({ name: c.name, state: c.state, x: c.x, z: c.z, speed: c.speed })),
    // The Gardener: what he's doing and where. gardenerDo('rake') makes him start an
    // activity ('admire', 'view', 'tea', 'feed', 'rake', 'pet'); greet() is the E key.
    gardener: () => ({
      activity: gardener.activity, pose: gardener.poseName, x: gardener.x, z: gardener.z, heading: gardener.heading,
      speed: gardener.speed, rake: gardener.rakeHeld ? gardener.rakeMode : 'down', cup: !!gardener.held,
    }),
    gardenerDo: (name) => gardener.start(name),
    greet: () => gardener.greet(),
    // Footprints in the gravel since it was last raked.
    zenPrints: () => zenGarden.prints,
    // Put the dog somewhere (for testing how the cats react).
    moveDog: (x, z) => { dog.x = x; dog.z = z; },
    dog: () => ({ x: dog.x, z: dog.z, state: dog.state, sit: dog.sit, speed: dog.speed, leader: dog.leader === gardener ? 'gardener' : dog.leader }),
    birds: () => birds.list.map((b) => {
      const { x, y, z } = b.group.position;
      return { species: b.species, state: b.state, on: b.perch.kind, x, y, z };
    }),
    // Each butterfly: species, 'flying' or 'landed', the kind of spot it's on or heading
    // for ('flower', 'stone', 'rock' or null), and where it is.
    butterflies: () => butterflies.list.map((b) => {
      const { x, y, z } = b.group.position;
      return { species: b.species, state: b.state, on: b.spot?.kind ?? null, x, y, z };
    }),
    // How many pellets are on the water, and where the koi are (pond-local).
    pond() {
      return { pellets: feeding.pellets.length, koi: koi.list.map((k) => ({ x: k.x, z: k.z })) };
    },
    // Layout fingerprint: everything rand() placed, rounded, plus a short hash. If a change
    // alters the hash, it altered the garden's layout (e.g. by changing the order in which
    // features are built and call rand(); see garden.js).
    fingerprint() {
      const r = (v) => Math.round(v * 1000) / 1000;
      const animalSolids = new Set([dog.solid, gardener.solid, ...cats.list.map((c) => c.solid)]);
      const data = {
        mounds: mounds.map((m) => [r(m.x), r(m.z), r(m.r)]),
        solids: solids.filter((s) => !animalSolids.has(s)).map((s) => (s.r !== undefined
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
        koi: koi.list.map((k) => [r(k.group.scale.x), r(k.radius), k.group.children.length]),
      };
      const json = JSON.stringify(data);
      let h = 5381;
      for (let i = 0; i < json.length; i++) h = (Math.imul(h, 33) ^ json.charCodeAt(i)) >>> 0;
      const counts = Object.fromEntries(Object.entries(data).map(([k, v]) => [k, v.length]));
      return { hash: h.toString(16), counts };
    },
  };
}
