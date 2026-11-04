import {
  GROUND_R, POND_Z, POND_R, FENCE_R, FENCE_GAP, FENCE_H, TEA, TEA_PATH, BOWLS, ZEN, SHISHI, TORII_Z,
  LANTERN_SPOTS, PATH_LANTERN_SPOTS, PATH_LANTERN_SCALE, PATH_LANTERN_GLOW, TREE_SPOTS, FUJI_POS,
} from './core/layout.js';
import { Sky } from './world/sky.js';
import { Ground } from './world/ground.js';
import { Fuji } from './world/fuji.js';
import { Clouds } from './world/clouds.js';
import { Trees } from './world/trees.js';
import { Lanterns } from './world/lanterns.js';
import { Pond } from './world/pond.js';
import { Ripples } from './world/ripples.js';
import { Bridge } from './world/bridge.js';
import { Torii } from './world/torii.js';
import { SteppingStones } from './world/steppingStones.js';
import { TeaHouse } from './world/teaHouse.js';
import { ZenGarden } from './world/zenGarden.js';
import { ShishiOdoshi } from './world/shishiOdoshi.js';
import { Fence } from './world/fence.js';
import { Rocks } from './world/rocks.js';
import { Flowers } from './world/flowers.js';
import { TeaThings } from './world/teaThings.js';
import { Bowls } from './world/bowls.js';
import { Grass } from './world/grass.js';
import { Feeding } from './animals/feeding.js';
import { KoiSchool } from './animals/koi.js';
import { Hearts } from './animals/hearts.js';
import { Dog } from './animals/dog.js';
import { Birds } from './animals/birds.js';
import { Cats } from './animals/cats.js';
import { Butterflies } from './animals/butterflies.js';
import { Interaction } from './animals/interaction.js';
import { Gardener } from './people/gardener.js';

// ---- Building the garden: the composition root ----
// Every feature and animal is a class that is handed what it needs (dependency
// injection; see world/feature.js). This is the one place that calls `new` on them:
// it reads where things go from layout.js, and wires each object to the others it
// works with. Reading it top to bottom tells you what the garden is made of and what
// depends on what.
//
// ORDER MATTERS, for two reasons:
//  1. The layout comes from one seeded random sequence, ctx.rand (see core/random.js).
//     Whatever draws from it at construction must be built in this order: ground
//     (mounds), trees, pond (lily pads), koi, stepping stones, zen garden, rocks,
//     flowers. Building them in another order rearranges the garden.
//     garden.fingerprint() (debug.js) also hashes the colliders in the order they were
//     added, so keep the rest of the order too.
//  2. The animals pick their starting spots by avoiding the colliders, so every
//     feature that adds colliders must be built before them. (The koi are the
//     exception: they swim in the pond, avoid nothing, but draw from ctx.rand, so they
//     are built in their slot in the random sequence.)
//     The butterflies come after everything, even the Gardener: they add no colliders
//     and draw only from Math.random, and they need the Gardener to shy away from.
//
// `ctx` is the shared context: { scene, physics, placement, rand }.
export function buildGarden(ctx, { anisotropy = 1, grassDensity = 1 } = {}) {
  const sky = new Sky(ctx);
  const ground = new Ground(ctx, { radius: GROUND_R, hole: { z: POND_Z, r: POND_R } });
  const fuji = new Fuji(ctx, { position: FUJI_POS });
  const clouds = new Clouds(ctx, { fuji });
  const trees = new Trees(ctx, { spots: TREE_SPOTS });
  const lanterns = new Lanterns(ctx, {
    spots: LANTERN_SPOTS, pathSpots: PATH_LANTERN_SPOTS, pathScale: PATH_LANTERN_SCALE, pathGlow: PATH_LANTERN_GLOW,
  });
  const pond = new Pond(ctx, { z: POND_Z, radius: POND_R });
  const ripples = new Ripples(ctx, { pond });
  const feeding = new Feeding(ctx, { pond, ripples });
  const koi = new KoiSchool(ctx, { pond, ripples, feeding });
  const bridge = new Bridge(ctx, { z: POND_Z });
  const torii = new Torii(ctx, { z: TORII_Z });
  const steppingStones = new SteppingStones(ctx, { from: 31, to: POND_Z + POND_R + 3, teaPath: TEA_PATH });
  const teaHouse = new TeaHouse(ctx, { x: TEA.x, z: TEA.z });
  const zenGarden = new ZenGarden(ctx, { ...ZEN, anisotropy });
  const shishi = new ShishiOdoshi(ctx, { x: SHISHI.x, z: SHISHI.z, pond, ripples });
  const fence = new Fence(ctx, { radius: FENCE_R, gap: FENCE_GAP, height: FENCE_H });
  const rocks = new Rocks(ctx);
  const flowers = new Flowers(ctx);
  const teaThings = new TeaThings(ctx, { house: teaHouse });
  // The pets' bowls by the tea house. Fixed, so they draw nothing from ctx.rand.
  const bowls = new Bowls(ctx, { x: BOWLS.x, z: BOWLS.z, house: TEA });
  // The lawn: after every fixed feature, whose colliders and platforms it grows around.
  // It has its own seeded generator, so it doesn't use (or shift) ctx.rand.
  const grass = new Grass(ctx, { stones: [...steppingStones.footprints(), ...bowls.footprints()], density: grassDensity });

  // Animals: after every collider is in place.
  const hearts = new Hearts(ctx);
  const dog = new Dog(ctx, { hearts, zenGarden, bowls });
  const birds = new Birds(ctx, { perchSources: [lanterns, trees, torii, teaHouse, fence], dog });
  const cats = new Cats(ctx, { dog, birds, hearts, zenGarden, bowls });
  // The birds watch out for the cats, but the cats need the birds (to stalk them), so
  // the birds are made first and told about the cats afterwards.
  birds.cats = cats;
  // The bowls work out who's eating at them by asking the animals.
  bowls.eaters = [dog, ...cats.list];
  // The Gardener looks after all of it, so he's handed most of the garden. He draws
  // only from Math.random, so building him after everything that uses ctx.rand leaves
  // the layout alone.
  const gardener = new Gardener(ctx, {
    teaHouse, teaThings, bowls, zenGarden, pond, feeding, trees, flowers, fuji, dog, cats, fenceR: FENCE_R,
  });
  // Butterflies land on the low things (flowers, stones, rocks) and take off when the
  // dog, a cat or the Gardener comes by.
  const butterflies = new Butterflies(ctx, {
    landingSources: [flowers, steppingStones, rocks, zenGarden], teaHouse, scarers: [dog, ...cats.list, gardener],
  });
  // The dog, the cats and the Gardener part the grass as they walk through it.
  grass.pushers = [dog, ...cats.list, gardener];
  const interaction = new Interaction({ dog, cats, feeding, gardener });

  return {
    sky, ground, fuji, clouds, trees, lanterns, pond, ripples, bridge, torii, steppingStones,
<<<<<<< HEAD
    teaHouse, zenGarden, shishi, fence, rocks, flowers, teaThings, bowls, grass,
    feeding, koi, hearts, dog, birds, cats, gardener, interaction,
=======
    teaHouse, zenGarden, shishi, fence, rocks, flowers, teaThings, grass,
    feeding, koi, hearts, dog, birds, cats, gardener, butterflies, interaction,
>>>>>>> origin/main
  };
}
