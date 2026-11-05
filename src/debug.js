import * as THREE from 'three';
import { cameraGroup } from './core/camera.js';
import { M } from './core/materials.js';
import { env, player } from './core/state.js';
import { setNight } from './effects/dayNight.js';
import { setRain } from './effects/rain.js';
import { setSound, sound } from './audio/audio.js';
import { clampPitch } from './player/look.js';
import { updateStatus } from './player/flight.js';
import { setHelpVisible } from './ui/help.js';

// ---- Console / automation hooks: window.garden ----
// For testing and screenshots from the browser console, e.g.
//   garden.setView({ x: 0, y: 12, z: 10, yaw: 0, pitch: -0.8, fly: true })
// main.js installs them once the garden is built, handing over what they inspect.
export function installDebug(garden, { physics }) {
  const { trees, lanterns, pond, flowers, steppingStones, koi, feeding, dog, birds, cats, gardener, butterflies, zenGarden, interaction, grass, bowls, stream, mountains, forest, clouds } = garden;
  const { solids, mounds } = physics;
  // Where an animal is with its meal: which bowl, whether it's got there, how far off it is.
  const meal = (a) => (a.state === 'bowl' ? {
    bowl: a.meal.bowl.kind, eating: a.meal.eating, legs: a.meal.path.length, d: Math.round(Math.hypot(a.meal.x - a.x, a.meal.z - a.z) * 100) / 100,
  } : null);
  window.garden = {
    // What actually got placed (trees that found no room are skipped).
    layout: {
      trees: trees.list.length, cherries: trees.cherryCrowns.length, lanterns: lanterns.list.length,
      grassTufts: grass.count, grassTiles: grass.group.children.length, mountains: mountains.count, forestTrees: forest.count,
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
    // The colliders within r of (x, z), nearest first: what's in an animal's way there.
    solidsNear(x, z, r = 2) {
      const dist = (s) => (s.r !== undefined ? Math.hypot(x - s.x, z - s.z) - s.r
        : Math.hypot(x - Math.max(s.minX, Math.min(x, s.maxX)), z - Math.max(s.minZ, Math.min(z, s.maxZ))));
      return solids.map((s) => ({ ...s, gap: Math.round(dist(s) * 100) / 100 })).filter((s) => s.gap < r).sort((a, b) => a.gap - b.gap);
    },
    // garden.setRain(true) starts a shower; instant = true skips the fade, and the
    // clouds' slower build-up (or clearing) too.
    setRain(on, instant = false) {
      setRain(on);
      if (instant) env.rainMix = clouds.cover = on ? 1 : 0;
    },
    // The rain, and who's sheltering from it: each animal's state, where it is, and
    // (while sheltering) how far along it is: 'in', 'stay' or 'out'. Plus the
    // Gardener's activity and how far his umbrella is open (0 shut … 1 open), and the
    // rain's sound: whether audio is running, and the outdoor and under-the-roof volumes.
    rain: () => ({
      raining: env.isRaining, mix: Math.round(env.rainMix * 100) / 100, cover: Math.round(clouds.cover * 100) / 100,
      dog: { state: dog.state, shelter: dog.shelter?.phase ?? null, x: Math.round(dog.x * 10) / 10, z: Math.round(dog.z * 10) / 10 },
      cats: cats.list.map((c) => ({ name: c.name, state: c.state, shelter: c.shelter?.phase ?? null, x: Math.round(c.x * 10) / 10, z: Math.round(c.z * 10) / 10 })),
      gardener: { activity: gardener.activity, umbrella: Math.round((gardener.umbrella?.open ?? 0) * 100) / 100 },
      sound: sound.ctx ? { state: sound.ctx.state, rain: Math.round(sound.rainGain.gain.value * 1000) / 1000, roof: Math.round(sound.roofGain.gain.value * 1000) / 1000 } : null,
    }),
    setSound,
    feed: () => feeding.tryFeed(),
    // Pets whichever animal is in reach: 'dog', 'cat' (purred), 'cat:aloof' (walked off), or null.
    pet: () => {
      const pet = interaction.nearestPettable();
      if (!pet) return null;
      if (pet.kind === 'dog') { pet.animal.pet(); return 'dog'; }
      return pet.animal.pet() ? 'cat' : 'cat:aloof';
    },
    cats: () => cats.list.map((c) => ({
      name: c.name, state: c.state, x: c.x, z: c.z, speed: c.speed, hunger: c.hunger, thirst: c.thirst, meal: meal(c),
    })),
    // The Gardener: what he's doing and where. gardenerDo('rake') makes him start an
    // activity ('admire', 'view', 'tea', 'feed', 'rake', 'pet', 'fill'); greet() is the E key.
    gardener: () => ({
      activity: gardener.activity, pose: gardener.poseName, x: gardener.x, z: gardener.z, heading: gardener.heading,
      speed: gardener.speed, rake: gardener.rakeHeld ? gardener.rakeMode : 'down', cup: !!gardener.held,
      bucket: !!gardener.bucketHeld,
    }),
    gardenerDo: (name) => gardener.start(name),
    greet: () => gardener.greet(),
    // Footprints in the gravel since it was last raked.
    zenPrints: () => zenGarden.prints,
    // The bowls: how full each is (0…1) and who's eating or drinking there.
    bowls: () => bowls.list.map((b) => ({
      kind: b.kind, level: Math.round(b.level * 100) / 100,
      eating: bowls.eaters.filter((a) => a.state === 'bowl' && a.meal?.bowl === b).map((a) => a.name ?? 'dog'),
    })),
    // Set every bowl's level (e.g. 0, so the Gardener comes to fill them).
    setBowls: (level) => { for (const b of bowls.list) { b.level = b.target = level; bowls.showLevel(b); } },
    // Make the dog and the cats hungry (`what` = 'hunger'), thirsty ('thirst') or both.
    hungry: (what = null) => {
      for (const a of bowls.eaters) {
        if (what !== 'thirst') a.hunger = 1;
        if (what !== 'hunger') a.thirst = 1;
      }
    },
    // Put the dog somewhere (for testing how the cats react).
    moveDog: (x, z) => { dog.x = x; dog.z = z; },
    dog: () => ({
      x: dog.x, z: dog.z, state: dog.state, sit: dog.sit, speed: dog.speed, leader: dog.leader === gardener ? 'gardener' : dog.leader,
      hunger: dog.hunger, thirst: dog.thirst, meal: meal(dog),
    }),
    birds: () => birds.list.map((b) => {
      const { x, y, z } = b.group.position;
      return { species: b.species, state: b.state, on: b.perch.kind, x, y, z };
    }),
    // Each butterfly: species, 'flying' or 'landed', the kind of spot it's on or heading
    // for ('flower', 'stone', 'rock' or null), and where it is.
    // `d` is how far it still has to go to its spot (0 once landed).
    butterflies: () => butterflies.list.map((b) => {
      const { x, y, z } = b.group.position;
      const d = b.spot ? Math.round(b.group.position.distanceTo(b.spot.point) * 100) / 100 : null;
      return { species: b.species, state: b.state, on: b.spot?.kind ?? null, d, x, y, z };
    }),
    // Send every butterfly to a free landing spot of one kind ('flower', 'stone', 'rock'),
    // taking off from wherever it is; `near` (x, z) limits it to spots within 8 of there.
    // Returns how many were sent.
    landAt(kind, near = null) {
      const free = butterflies.landings.filter((s) => !s.taken && s.kind === kind
        && (!near || Math.hypot(s.point.x - near.x, s.point.z - near.z) < 8));
      let sent = 0;
      for (const b of butterflies.list) {
        const s = free.shift();
        if (!s) break;
        if (b.state === 'landed') b.takeOff();
        if (b.spot) b.spot.taken = null;
        b.claim(s);
        sent++;
      }
      return sent;
    },
    // The stream: how long it is, where the falls land, and whether the player is
    // standing in it.
    stream: () => {
      const p = cameraGroup.position;
      return {
        samples: stream.course.length, pool: stream.pool, impact: stream.impact.toArray().map((v) => Math.round(v * 100) / 100),
        wading: stream.contains(p.x, p.z), stones: stream.stones.length,
      };
    },
    // How many pellets are on the water, and where the koi are (pond-local).
    pond() {
      return { pellets: feeding.pellets.length, koi: koi.list.map((k) => ({ x: k.x, z: k.z })) };
    },
    // Layout fingerprint: everything rand() placed, rounded, plus a short hash. If a change
    // alters the hash, it altered the garden's layout (e.g. by changing the order in which
    // features are built and call rand(); see garden.js).
    fingerprint() {
      const r = (v) => Math.round(v * 1000) / 1000;
      // The animals' colliders move, and the bowls' and the stream's were added after
      // the layout was fixed; none of them is part of what rand() placed.
      const animalSolids = new Set([dog.solid, gardener.solid, ...cats.list.map((c) => c.solid), ...bowls.solids, ...stream.solids]);
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
