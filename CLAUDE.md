# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A first-person, low-poly Japanese garden built with Three.js r160. The whole app is one file, `index.html`, containing the CSS, the HUD and help-overlay markup, and one `<script type="module">`. Three.js and its addons load from unpkg through an importmap. There is no build step, package manager, linter, test suite or git repo.

## Running

ES modules don't load over `file://`, so serve the folder locally:

```
python -m http.server 8765 --bind 127.0.0.1
```

Then open http://127.0.0.1:8765/. Add `?seed=N` for a different but repeatable layout.

## Testing

Verify changes in a real browser by scripting the page through `window.garden`, defined just before the movement code. It has these helpers:

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
| `seed` | The current seed |

Add helpers there when a new feature needs to be observable.

Testing gotchas:
- **Throttled windows:** Chrome throttles `requestAnimationFrame` to about 1 fps when the window is occluded. Keep the browser visible to get real fps. For logic-only tests, override it: `window.requestAnimationFrame = cb => setTimeout(() => cb(performance.now()), 16)`.
- **Frame step cap:** `animate()` caps each frame's step at 0.05 s, so simulated time runs slower than wall time at low fps.
- **Silent runtime errors:** an exception inside any `update*` function aborts the whole frame silently. Check the console after testing.
- **Sound off:** every `SFX.*` function must start with `if (!audible() || vol < 0.02) return;`, because the audio context doesn't exist until sound is turned on.

## Architecture

The script runs top to bottom, and the `// ---- Section ----` comments split it into sections. Each section builds its meshes at load time and exposes an `update*(dt, t)` function. `animate()` at the bottom calls every update in order, then `composer.render()`.

### Rendering

- **Post-processing:** the scene renders through an `EffectComposer` that applies UnrealBloom, then an OutputPass.
- **Lights:** lighting uses physical light units.
- **Materials:** all materials live in the shared `M` palette and are flat-shaded `MeshStandardMaterial`.
- **Distant haze:** distant objects (Fuji, clouds) fake aerial perspective with `applyHaze`.
- **Day/night:** a `DAY`/`NIGHT` table drives the transition. `updateDayNight` interpolates between them using `nightMix`, which runs from 0 to 1. Anything with a night look should read `nightMix`.

### Layout is seeded

All placement uses `rand()`, a mulberry32 generator seeded from `?seed`. Only purely visual effects (petals, ripples, fireflies) use `Math.random`. Keep it that way, or layouts stop being reproducible.

Fixed features are positioned by the constants in the "Layout constants" section, such as `POND_Z`, `POND_R`, `TEA`, `ZEN` and `FENCE_R`.

### Placement and physics are separate systems

- **Placement:** `reserve(x, z, r)`, `isClear(x, z, r)` and `randomFreeSpot()` keep props from overlapping. Fixed features reserve their circles first, before anything random is placed. A new fixed feature must reserve its footprint too, or trees and rocks will spawn inside it.
- **Collision:**
  - **What blocks:** `solids` holds circles and boxes, each with a blocking height `h`.
  - **What you stand on:** `platforms` holds walkable boxes and `mounds` holds grass bumps. `groundHeightAt(x, z, feet)` combines these with the bridge deck (`bridgeDeckTop` / `deckBlocks`) and the pond, where the player sinks until only their head is above water.
  - **Ring collision:** the fence is handled separately as a ring collision.
- **Player movement:** `updateMovement` sub-steps movement in steps of at most 0.2 units, so the player can't tunnel through thin walls.
- **Animals:** the dog and cats use the shared `groundBlocked(x, z, r, self)` instead of the player physics. It includes the bridge ends padded by body radius, the pond and the other animals.

### Animals

Each animal is a small state machine with its own `update*` function:

- **Koi:** steering with separation plus a hard push-apart, so the school doesn't merge when fed.
- **Dog:** a Shiba Inu.
- **Birds:** perch on lanterns, trees, the torii and the fence using `localToWorld`, and fly along Bézier paths. The player, the dog and non-stalking cats scare them off.
- **Cats:** sit, groom, loaf, stalk, pounce and flee from the dog. They turn in place before moving, via `steerCat`.

`tryInteract` (E key or ✋ button) decides between feeding and petting. When both the dog and a cat are in reach, `nearestPettable` picks the closest.

### Input and UI

- **Desktop:** pointer lock plus WASD. Always call `lockPointer()`, never `requestPointerLock()` directly, because the browser may reject the request.
- **Touch:** switches on automatically on `(pointer: coarse)` or at the first touch, by adding the `touch` class to `body`. A fixed joystick in the bottom right writes to `touch.jx/jy`, a drag on the canvas looks around, and the action buttons map onto held keys through `HELD_KEY`.
- **HUD and help:** the HUD is just the title and a **?** button. The start-up overlay doubles as the help screen (`showHelp`/`hideHelp`; H or Esc) and holds the Day/Night and Sound buttons.
- **Mode changes:** report these with `showToast()`.
- **Device-specific content:** mark it with `.desktop-only` or `.touch-only`.
