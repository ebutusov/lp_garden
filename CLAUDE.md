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

Verify changes in a real browser by scripting the page through `window.garden`, defined in `src/debug.js`. It has these helpers:

| Helper | What it does |
|---|---|
| `setView({x,y,z,yaw,pitch,fly})` / `getView()` | Set or read the camera viewpoint |
| `setNight(on, instant)` | Switch day/night; `instant` skips the fade |
| `setSound` | Turn sound on or off |
| `feed()` | Feed the koi |
| `pet()` | Pet the nearest animal; returns `'dog'`, `'cat'`, `'cat:aloof'` or `null` |
| `dog()`, `cats()`, `birds()`, `pond()` | Snapshot each animal's state |
| `moveDog(x, z)` | Move the dog somewhere |
| `layout` | Counts of what got placed |
| `fingerprint()` | Hash of everything `rand()` placed. Currently `4d19f052`; if a change alters it, the layout changed |

Add helpers there when a new feature needs to be observable.

Testing gotchas:
- **Throttled windows:** Chrome throttles `requestAnimationFrame` to about 1 fps when the window is occluded. Keep the browser visible to get real fps. For logic-only tests, override it: `window.requestAnimationFrame = cb => setTimeout(() => cb(performance.now()), 16)`.
- **Frame step cap:** `animate()` caps each frame's step at 0.05 s, so simulated time runs slower than wall time at low fps.
- **Silent runtime errors:** an exception inside any `update*` function aborts the whole frame silently. Check the console after testing.
- **Sound off:** every `SFX.*` function must start with `if (!audible() || vol < 0.02) return;`, because the audio context doesn't exist until sound is turned on.

## Architecture

Each module builds its meshes when it's first imported. World features expose an `update(dt, t)` method (see below); the effects, animals and player modules export `update*(dt, t)` functions. `animate()` in `src/main.js` calls every update in order, then `composer.render()`.

### World features are classes

Every file in `src/world/` defines a class that extends `Feature` (`src/world/feature.js`), and exports one instance of it, created on import: `export const pond = new Pond();`.

- **Composition:** a feature owns `this.group`, a `THREE.Group` it adds to the scene (or to a parent feature's group), rather than extending `THREE.Group`. Use `torii.group`, `teaHouse.group` and so on wherever an `Object3D` is needed.
- **`update(dt, t)`:** called from `animate()`, each in its fixed slot. The base version does nothing, so static features don't define one.
- **Helpers:** use them instead of repeating the boilerplate. `this.mesh(geo, mat, x, y, z, { cast, receive, parent })` makes a mesh and adds it to the group; the shadow flags default to `false`. `solidCircle`, `solidBox` and `platform` take local coordinates and register colliders in world coordinates. Boxes only work for groups that aren't rotated.
- **Collections:** trees and lanterns are made of smaller objects. `trees.list` holds `Tree` objects (`PineTree`, `MapleTree` and `CherryTree`), each with its own `crown` and `sway()`. `lanterns.list` holds `Lantern` objects, whose shared night brightness is the static `Lantern.brightness`.
- **Renamed APIs:** use `ripples.spawn(lx, lz, size, life)` to make a ripple, `pond.group` for the pond-local frame, and `teaHouse.contains(x, z)` / `zenGarden.contains(x, z)` to test whether a point is inside.

| Folder | Contents |
|---|---|
| `src/core/` | `scene`, `camera` (+ `cameraGroup`), `renderer` (+ `composer`, `bloom`), `lights`, `materials` (`M`, `mat`), `textures`, `layout` (constants), `placement`, `physics`, `random`, `clock`, `state` |
| `src/world/` | One file per garden feature |
| `src/effects/` | `petals`, `fireflies`, `dayNight` |
| `src/animals/` | `koi`, `feeding`, `dog`, `birds`, `cats`, `hearts`, `interaction` |
| `src/player/` | `look`, `movement`, `flight`, `footsteps` |
| `src/input/`, `src/ui/`, `src/audio/` | Controls, HUD and help screen, sound |

### Module rules

- **Import order is load order.** `main.js` imports modules in a deliberate order, which matters for two reasons:
  - **Layout:** the modules that call `rand()` at load time must run in the order ground (mounds) → trees → pond (lily pads) → koi → stepping stones → zen garden → rocks → flowers. A core or shared module must never import any of them, or the seeded sequence shifts and the whole layout changes. Check `garden.fingerprint()` after reshuffling imports. Inside a constructor, keep the order of the `rand()` calls too.
  - **Spawning:** every world module that adds `solids` must load before the animal modules, because animals pick their starting spots by avoiding `solids`.
- **Shared mutable state** lives in objects, because importers can't assign to an exported `let`. Day/night is `env.isNight` and `env.nightMix` (0 to 1); anything with a night look reads `env.nightMix`. The player's `yaw`, `pitch`, `flyMode`, `verticalVel` and `onGround` live on `player`. Both are in `src/core/state.js`.
- **Avoid import cycles.** `updateBirds(dt, t, cats)` takes the cats as an argument because `cats.js` imports `birds.js`.

### Rendering

- **Post-processing:** the scene renders through an `EffectComposer` that applies UnrealBloom, then an OutputPass.
- **Lights:** lighting uses physical light units.
- **Materials:** all materials live in the shared `M` palette and are flat-shaded `MeshStandardMaterial`. The exceptions have custom shaders: the sky dome is a `ShaderMaterial` (`world/sky.js`), and the pond water (`world/water.js`) is a `MeshStandardMaterial` patched with `onBeforeCompile`. That patch adds vertex waves, a Fresnel blend, a shore band and a round cut-out. Its `uTime` is set in `pond.update`. The reflection is planar (`addMirror`): in the water mesh's `onBeforeRender`, the scene is rendered again from a camera mirrored below the water plane. That pass renders at half resolution into a render target, with an oblique near plane that clips everything below the surface. It only runs while the pond is on screen, and it roughly doubles the draw cost when it does.
- **Distant haze:** distant objects (Fuji, clouds) fake aerial perspective with `applyHaze` in `dayNight.js`.
- **Day/night:** a `DAY`/`NIGHT` table drives the transition. `updateDayNight` interpolates between them using `env.nightMix`.

### Layout is seeded

All placement uses `rand()` from `src/core/random.js`, a mulberry32 generator with a fixed seed. Only purely visual effects (petals, ripples, fireflies, animal wandering) use `Math.random`. Keep it that way, or layouts stop being reproducible.

Fixed features are positioned by the constants in `src/core/layout.js`, such as `POND_Z`, `POND_R`, `TEA`, `ZEN` and `FENCE_R`.

### Placement and physics are separate systems

- **Placement:** `reserve(x, z, r)`, `isClear(x, z, r)` and `randomFreeSpot()` in `placement.js` keep props from overlapping. The fixed features reserve their circles at the bottom of `placement.js`, before anything random is placed. A new fixed feature must reserve its footprint there too, or trees and rocks will spawn inside it.
- **Collision** (`physics.js`):
  - **What blocks:** `solids` holds circles and boxes, each with a blocking height `h`.
  - **What you stand on:** `platforms` holds walkable boxes and `mounds` holds grass bumps. `groundHeightAt(x, z, feet)` combines these with the bridge deck (`bridgeDeckTop` / `deckBlocks`) and the pond, where the player sinks until only their head is above water.
  - **Ring collision:** the fence is handled separately as a ring collision, in `player/movement.js`.
- **Player movement:** `updateMovement` sub-steps movement in steps of at most 0.2 units, so the player can't tunnel through thin walls.
- **Animals:** the dog and cats use the shared `groundBlocked(x, z, r, self)` instead of the player physics. It includes the bridge ends padded by body radius, the pond and the other animals.

### Animals

Each animal is a small state machine with its own `update*` function:

- **Koi:** steering with separation plus a hard push-apart, so the school doesn't merge when fed.
- **Dog:** a Shiba Inu.
- **Birds:** perch on lanterns, trees, the torii and the fence using `localToWorld`, and fly along Bézier paths. The player, the dog and non-stalking cats scare them off.
- **Cats:** sit, groom, loaf, stalk, pounce and flee from the dog. They turn in place before moving, via `steerCat`.

`tryInteract` in `interaction.js` (E key or ✋ button) decides between feeding and petting. When both the dog and a cat are in reach, `nearestPettable` picks the closest.

### Input and UI

- **Desktop:** pointer lock plus WASD. Always call `lockPointer()` (`input/pointerLock.js`), never `requestPointerLock()` directly, because the browser may reject the request.
- **Touch:** switches on automatically on `(pointer: coarse)` or at the first touch, by adding the `touch` class to `body`. A fixed joystick in the bottom right writes to `touch.jx/jy`, a drag on the canvas looks around, and the action buttons map onto held keys through `HELD_KEY`.
- **HUD and help:** the HUD is just the title and a **?** button. The start-up overlay doubles as the help screen (`showHelp`/`hideHelp` in `ui/help.js`; H or Esc) and holds the Day/Night and Sound buttons.
- **Mode changes:** report these with `showToast()`.
- **Device-specific content:** mark it with `.desktop-only` or `.touch-only`.
