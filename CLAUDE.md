# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A first-person, low-poly Japanese garden built with Three.js 0.160 (r160), bundled with Vite. `index.html` holds the HUD and help-overlay markup and links `src/style.css`. The code is ES modules under `src/`, entered through `src/main.js`. Three.js is an npm dependency pinned to `0.160.0` and bundled into the build (in its own `three` chunk), not loaded from a CDN. There is no linter or test suite.

The code doubles as teaching material: each file opens with a comment explaining the 3D concept it uses, with inline notes where a technique appears. Keep that up when adding code.

## Running

```
npm install
npm run dev       # dev server, http://localhost:5173/
npm run build     # static site in dist/
npm run preview   # serve dist/
```

## Testing

Verify changes in a real browser by scripting the page through `window.garden`, which `installDebug(garden, ctx)` in `src/debug.js` sets up once the garden is built. It has these helpers:

| Helper | What it does |
|---|---|
| `setView({x,y,z,yaw,pitch,fly})` / `getView()` | Set or read the camera viewpoint |
| `setNight(on, instant)` | Switch day/night; `instant` skips the fade |
| `setSound` | Turn sound on or off |
| `feed()` | Feed the koi |
| `pet()` | Pet the nearest animal; returns `'dog'`, `'cat'`, `'cat:aloof'` or `null` |
| `dog()`, `cats()`, `birds()`, `butterflies()`, `pond()` | Snapshot each animal's state |
| `gardener()` | Snapshot the Gardener: activity, pose, position, whether he holds the rake or a cup |
| `zenPrints()` | Footprints in the gravel since it was last raked |
| `gardenerDo(name)` / `greet()` | Start an activity (`'admire'`, `'view'`, `'tea'`, `'feed'`, `'rake'`, `'pet'`) / greet him as the E key does |
| `moveDog(x, z)` | Move the dog somewhere |
| `layout` | Counts of what got placed |
| `fingerprint()` | Hash of everything `rand()` placed. Currently `4d19f052`; if a change alters it, the layout changed |

Add helpers there when a new feature needs to be observable; they read the built objects from the `garden` argument, not from imports.

Testing gotchas:
- **Throttled windows:** Chrome throttles `requestAnimationFrame` to about 1 fps when the window is occluded. Keep the browser visible to get real fps. For logic-only tests, override it: `window.requestAnimationFrame = cb => setTimeout(() => cb(performance.now()), 16)`.
- **Frame step cap:** `animate()` caps each frame's step at 0.05 s, so simulated time runs slower than wall time at low fps.
- **Silent runtime errors:** an exception inside any `update` method or `update*` function aborts the whole frame silently. Check the console after testing.
- **Speeding up time:** to watch the Gardener's long routines, fake the clock: `let f = performance.now(); performance.now = () => f; requestAnimationFrame = cb => setTimeout(() => { f += 50; cb(f); }, 0)`. Never restart it from the real clock afterwards: time running backwards gives one frame a negative `dt`.
- **Sound off:** every `SFX.*` function must start with `if (!audible() || vol < 0.02) return;`, because the audio context doesn't exist until sound is turned on.

## Architecture

Nothing in the garden is built on import. `src/main.js` makes the shared context `ctx`, calls `buildGarden(ctx)` in `src/garden.js` (the composition root), and hands the result to the function modules (effects, player, input, UI, debug). World features and animals are classes with an `update(dt, t)` method; the effects and player modules export `update*(dt, t)` functions. `animate()` in `src/main.js` calls every update in a fixed order, then `composer.render()`.

### Dependency injection

- **`ctx`** is `{ scene, physics, placement, rand }`: the scene graph, the colliders (a `Physics` instance), the prop placement (a `Placement` instance) and the one seeded generator. `main.js` creates it once.
- **Constructors are given what they need:** `new Feature(ctx, { x, z, parent, ...options })`. A feature's own position and size come in as options, which `garden.js` reads from `layout.js`. Any other feature or animal it works with is passed in too (`new Ripples(ctx, { pond })`, `new Cats(ctx, { dog, birds, hearts })`). Never import an instance; modules in `world/`, `animals/` and `people/` export classes only.
- **Still imported directly:** THREE, the materials (`M`, `mat`), textures, layout constants shared between systems (`BRIDGE_*`, `WATER_LEVEL`, and the formulas `waterSurface`, `inPond`, `windStrength`, `WIND_DIR`), `SFX`/`distVol`, `clock`, and the viewer/app state (`cameraGroup`, `camera`, `player`, `env`, `keys`, `touch`, `showToast`).
- **Function modules** (effects, player, input, UI, debug) get the instances they use from `main.js` through `init*`/`setup*` calls (`initPetals(garden)`, `initMovement(ctx.physics)`, `setupKeyboardMouse(garden)`, `installDebug(garden, ctx)`). Event listeners that need an instance are registered there, not at import.

### World features are classes

Every file in `src/world/` exports a class that extends `Feature` (`src/world/feature.js`). `garden.js` creates one instance of each: `new Pond(ctx, { z: POND_Z, radius: POND_R })`.

- **Composition:** a feature owns `this.group`, a `THREE.Group` it adds to the scene (or to a parent feature's group), rather than extending `THREE.Group`. Use `torii.group`, `teaHouse.group` and so on wherever an `Object3D` is needed.
- **`update(dt, t)`:** called from `animate()`, each in its fixed slot. The base version does nothing, so static features don't define one.
- **Helpers:** use them instead of repeating the boilerplate. `this.mesh(geo, mat, x, y, z, { cast, receive, parent })` makes a mesh and adds it to the group; the shadow flags default to `false`. `solidCircle`, `solidBox` and `platform` take local coordinates and register colliders in world coordinates through `this.ctx.physics`. Boxes only work for groups that aren't rotated. Use `this.ctx.rand` and `this.ctx.placement` for random placement.
- **Collections:** trees and lanterns are made of smaller objects. `trees.list` holds `Tree` objects (`PineTree`, `MapleTree` and `CherryTree`), each with its own `crown` and `sway()`. `lanterns.list` holds `Lantern` objects; their shared night brightness is `lanterns.brightness`, which `dayNight.js` sets.
- **Butterfly landings:** low things butterflies land on (`Flowers`, `Rocks`, `SteppingStones`, `ZenGarden`) have `landings()`, returning `[{ point, normal, kind }]` in world coordinates. They build them with `this.landingOn(mesh, dx, dz, kind)`, which raycasts down onto that one mesh and rejects facets steeper than `minUp`. Pass a new landing source to `Butterflies` in `garden.js`.
- **Bird perches:** anything birds sit on (`Tree`, `Lantern`, `Torii`, `TeaHouse`, `Fence`, and the `Trees`/`Lanterns` collections) has `perches()`, returning `[{ parent, local, kind }]` in the parent's local frame. Pass a new perch source to `Birds` in `garden.js`.
- **Zen garden texture:** the raked pattern is a live canvas. `zenGarden.footprint(x, z, heading, size, paw)` paints a print. The player's steps (`player/footsteps.js`) and the dog's and cats' paws (`Animal.stepPrint`, given `zenGarden`) make them. `zenGarden.smooth()` copies a pristine copy back, and `zenGarden.update(dt)` uploads changes at most every 0.15 s. `zenGarden.prints` counts them.
- **APIs:** use `ripples.spawn(lx, lz, size, life)` to make a ripple, `pond.group` for the pond-local frame (`pond.radius` for its size), and `teaHouse.contains(x, z)` / `zenGarden.contains(x, z)` to test whether a point is inside.

| Folder | Contents |
|---|---|
| `src/` | `main.js` (context, wiring, game loop), `garden.js` (builds everything), `debug.js` |
| `src/core/` | `scene`, `camera` (+ `cameraGroup`), `renderer` (+ `composer`, `bloom`), `lights`, `materials` (`M`, `mat`), `textures`, `layout` (constants), `placement` (`Placement`), `physics` (`Physics`), `random` (`mulberry32`, `SEED`), `clock`, `state` |
| `src/world/` | One file per garden feature |
| `src/effects/` | `petals`, `fireflies`, `dayNight` |
| `src/animals/` | `animal` (base class), `koi`, `feeding`, `dog`, `birds`, `cats`, `butterflies`, `hearts`, `interaction` |
| `src/people/` | `gardener` |
| `src/player/` | `look`, `movement`, `flight`, `footsteps` |
| `src/input/`, `src/ui/`, `src/audio/` | Controls, HUD and help screen, sound |

### Module rules

- **Construction order is layout order.** `buildGarden()` in `garden.js` creates everything in a deliberate order (import order no longer matters), for two reasons:
  - **Layout:** whatever draws from `ctx.rand` must be built in the order ground (mounds) → trees → pond (lily pads) → koi → stepping stones → zen garden → rocks → flowers. The koi are built in that slot, before the other animals. `fingerprint()` also hashes colliders in the order they were added, so keep the whole order. Check `garden.fingerprint()` after reordering. Inside a constructor, keep the order of the `rand()` calls too.
  - **Spawning:** every feature that adds colliders must be built before the dog, birds and cats, because animals pick their starting spots by avoiding them. The Gardener is built after the other animals; `fingerprint()` leaves his collider out, like the animals'. The butterflies come after him: they add no colliders, use only `Math.random`, and are handed him as a scarer.
- **Shared mutable state** lives in objects, because importers can't assign to an exported `let`. Day/night is `env.isNight` and `env.nightMix` (0 to 1); anything with a night look reads `env.nightMix`. The player's `yaw`, `pitch`, `flyMode`, `verticalVel` and `onGround` live on `player`. Both are in `src/core/state.js`.
- **Mutual references are wired after construction.** The cats need the birds (to stalk them) and the birds need the cats (to flee them), so `garden.js` builds the birds, then the cats, then sets `birds.cats = cats`.

### Rendering

- **Post-processing:** the scene renders through an `EffectComposer` that applies UnrealBloom, then an OutputPass.
- **Lights:** lighting uses physical light units.
- **Materials:** all materials live in the shared `M` palette and are flat-shaded `MeshStandardMaterial`. The exceptions have custom shaders: the sky dome is a `ShaderMaterial` (`world/sky.js`), and the pond water (`world/water.js`) is a `MeshStandardMaterial` patched with `onBeforeCompile`. That patch adds vertex waves, a Fresnel blend, a shore band and a round cut-out. Its `uTime` is set in `pond.update`. The reflection is planar (`addMirror`): in the water mesh's `onBeforeRender`, the scene is rendered again from a camera mirrored below the water plane. That pass renders at half resolution into a render target, with an oblique near plane that clips everything below the surface. It only runs while the pond is on screen, and it roughly doubles the draw cost when it does.
- **Grass:** `world/grass.js` is a lawn of instanced tufts. It is split into 20-unit tiles, one `InstancedMesh` each, so tiles behind the camera are culled. Its `MeshStandardMaterial` is patched with `onBeforeCompile`, and its replacement `project_vertex` bends the blades in world space after `instanceMatrix`, driven by `windStrength`/`WIND_DIR`. The bend also uses `grass.pushers`: the player, plus the dog, cats and Gardener, which `garden.js` sets (`MAX_PUSHERS` slots, all in use). Blade normals point up, so the lawn is lit like the ground; the root-to-tip colour ramp gives the contrast. The grass places itself with its own `mulberry32` stream, not `ctx.rand`, so it doesn't affect the fingerprint. Build it after every fixed feature, because it avoids their colliders and platforms and sits on the mounds. Touch devices get half the density (`grassDensity`).
- **Distant haze:** distant objects (Fuji, clouds) fake aerial perspective with `applyHaze` in `dayNight.js`.
- **Day/night:** a `DAY`/`NIGHT` table drives the transition. `updateDayNight` interpolates between them using `env.nightMix`.

### Layout is seeded

All placement uses `ctx.rand`, the one mulberry32 generator `main.js` makes from `SEED` in `src/core/random.js`. Only purely visual effects (petals, ripples, fireflies, animal wandering) use `Math.random`. Keep it that way, or layouts stop being reproducible.

Fixed features are positioned by the constants in `src/core/layout.js`, such as `POND_Z`, `POND_R`, `TEA`, `ZEN`, `FENCE_R`, `TREE_SPOTS` and `FUJI_POS`. `garden.js` passes them to the constructors.

### Placement and physics are separate systems

- **Placement:** `ctx.placement` (`Placement` in `placement.js`) has `reserve(x, z, r)`, `isClear(x, z, r)` and `randomFreeSpot()` to keep props from overlapping. Its constructor reserves the fixed features' circles (`reserveFixedFeatures`), before anything random is placed. A new fixed feature must reserve its footprint there too, or trees and rocks will spawn inside it.
- **Collision** (`ctx.physics`, a `Physics` from `physics.js`):
  - **What blocks:** `physics.solids` holds circles and boxes, each with a blocking height `h`. `addCircleSolid` returns the collider, so its owner can move it (the animals do).
  - **What you stand on:** `physics.platforms` holds walkable boxes and `physics.mounds` holds grass bumps. `physics.groundHeightAt(x, z, feet)` combines these with the bridge deck (`bridgeDeckTop`, a plain export, and `physics.deckBlocks`) and the pond, where the player sinks until only their head is above water.
  - **Ring collision:** the fence is handled separately as a ring collision, in `player/movement.js`.
- **Player movement:** `updateMovement` sub-steps movement in steps of at most 0.2 units, so the player can't tunnel through thin walls.
- **Animals:** the dog and cats use `physics.groundBlocked(x, z, r, self, other)` (through `Animal.blocked(x, z, ignore)`) instead of the player physics. It includes the bridge ends padded by body radius, the pond, the tea house and the other animals, but not the gravel; `other` is one more collider to overlook. `physics.hitsSolid(x, z, r, ...ignore)` is just the solids test.

### Animals

Each animal is a class and a small state machine with its own `update(dt, t)`. The dog, cats, birds and butterflies extend `Animal` (`animals/animal.js`), a `Feature` whose group is the body's root. It adds `blob()` for body parts, an optional collision circle (`this.solid`, kept in step with `syncSolid()`), `blocked(x, z)`, `groundAt(x, z)` and `freeHeading()` for feeler steering. Groups of animals are collections with a `list` (`koi.list`, `cats.list`, `birds.list`, `butterflies.list`).

- **Koi:** `KoiSchool` of `Koi`, inside the pond's group. Steering with separation plus a hard push-apart, so the school doesn't merge when fed. Food comes from `Feeding` (`feeding.pellets`, `feeding.tryFeed()` for the player, `feeding.drop(lx, lz)` to scatter food at a pond-local point).
- **Dog:** `Dog`, a Shiba Inu. `dog.pet(by)`: petted by the player (`by` null) or by someone it then follows for a while (`dog.leader`, `dog.followT`). `dog.hold(by, seconds)` makes it sit and wait for `by`, unless it's with the player. `Dog.PET_R` is its petting reach.
- **Birds:** `Birds` flock of `Bird`. They perch on whatever the perch sources' `perches()` offer, convert those points with `localToWorld`, and fly along Bézier paths. The player, the dog and non-stalking cats scare them off. `bird.takeOff(scaredBy)`.
- **Cats:** `Cats` of `Cat`. They sit, groom, loaf, stalk, pounce and flee from the dog. They turn in place before moving, via `cat.steer()`. `cat.pet(by)` returns false when the cat walks off (away from `by`, or from the player). `cat.settled` (sitting, grooming or napping) and `cat.hold(seconds)` let someone walk up to it.
- **Butterflies:** `Butterflies` of `Butterfly`, six species whose wing colours are vertex colours baked into one fan geometry per species (all share one material). They fly by steering (desired velocity towards a goal plus a drifting flutter, eased in), not along Bézier paths: they wander between waypoints, steer round solids taller than they fly (except the one under their landing spot) and keep above `floorAt()`. Then they claim a free spot from `butterflies.landings` (flowers weighted 3×), descend onto it and rest aligned to its surface normal, basking now and then. The player within `SCARE_R`, or `butterflies.scarers` (dog, cats, Gardener) within `SCARE_ANIMAL_R`, makes them take off. At night (`env.nightMix > 0.5`) they land on the nearest free spot and stay.

### The Gardener

`Gardener` (`people/gardener.js`) extends `Animal`: an old man who wanders the garden doing one activity at a time. His activities are generator functions (`*tea()`, `*feed()`, `*rake()`, …) run as coroutines: `update()` calls `task.next()` once a frame, so each `yield` waits a frame, and `yield*` composes small steps (`walkTo`, `face`, `wait`, `followPath`). `start(name)` interrupts the current activity with `.return()`, and `run()`'s `finally` tidies up (pose, cup, rake).

- **Poses:** a `POSES` table of joint angles plus an `overlay` of gesture offsets, eased each frame. The walk cycle goes on top, driven by the distance he actually moved. The hip height comes from the leg angles, so his feet stay on the ground.
- **Movement:** his own `blocked()` lets him onto the gravel and into the tea house, but never onto the bridge (`BRIDGE_*` padded by 1). Feelers check a near and a far point. A blocked step slides along the obstacle. `detour()` steers him round the bridge's ends when the straight line would cross it. `walkTo` gives up when he stops making progress. He waits for the player rather than walking through them.
- **Activities:** tea (in through `teaHouse.visitPath`, kneels at `teaHouse.seat`, sips from `teaThings.nearestCup()`; at night, when `env.nightMix > 0.5`, he stays until morning), admire a tree or a flower (`flowers.spots`), view Fuji, feed the koi, pet the dog or a cat, rake. Raking is symbolic: he fetches the rake from beside the gravel, calls `zenGarden.smooth()` to clear every footprint at once, then steps backwards along a few lines. He rakes more often once there are 8 or more prints. He leaves no prints himself.
- **Player:** E within `Gardener.GREET_R` calls `gardener.greet()`. He pauses his activity, turns (unless kneeling or crouching) and bows.

`Interaction` in `interaction.js` (E key or ✋ button) decides in `tryInteract()` between greeting the Gardener, petting and feeding. `nearestPettable()` picks the closest animal in reach, and `nearest()` also considers the Gardener; both return `{ kind, animal }`.

### Input and UI

- **Desktop:** pointer lock plus WASD. Always call `lockPointer()` (`input/pointerLock.js`), never `requestPointerLock()` directly, because the browser may reject the request.
- **Touch:** switches on automatically on `(pointer: coarse)` or at the first touch, by adding the `touch` class to `body`. A fixed joystick in the bottom right writes to `touch.jx/jy`, a drag on the canvas looks around, and the action buttons map onto held keys through `HELD_KEY`.
- **HUD and help:** the HUD is just the title and a **?** button. The start-up overlay doubles as the help screen (`showHelp`/`hideHelp` in `ui/help.js`; H or Esc) and holds the Day/Night and Sound buttons.
- **Mode changes:** report these with `showToast()`.
- **Device-specific content:** mark it with `.desktop-only` or `.touch-only`.
