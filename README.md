# 日本の庭園 · Japanese Garden

A low-poly Japanese garden you can explore in the browser, on foot or flying. It runs on desktop and on phones and tablets. It's built with [Three.js](https://threejs.org/) and bundled with [Vite](https://vite.dev/).

The source is commented as a guided tour of 3D programming. It covers the scene graph and pivots, cameras, lights and shadow maps, materials and flat shading, custom shaders, particles, instancing, post-processing bloom, collision, steering and procedural animation.

## What's in the garden

- **Landscape:**
  - A koi pond with a walkable arched bridge. You can wade into the water, which comes up to your head.
  - A torii gate at the entrance, with a stepping-stone path lined with lanterns.
  - Stone lanterns, plus pine, maple and cherry trees. The trees sway in the wind and the cherry trees shed petals.
  - A raked zen gravel garden and a bamboo shishi-odoshi water spout.
  - A bamboo fence, rocks and iris beds.
  - A tea house holding a teapot, cups and a kettle on a brazier, with steam rising from the kettle.
  - Mount Fuji in the distance, with drifting clouds and mist.
- **Animals:**
  - **Koi** gather when you feed them.
  - **A Shiba Inu** roams and naps around the garden, trots over to follow you when you come near, and likes being petted.
  - **Birds** perch on lanterns, trees, the torii and the fence, and fly off when anyone comes close.
  - **Three cats** wander, groom, nap, stalk birds and keep clear of the dog. Some of them let you pet them.
- **Atmosphere:**
  - Day and night modes. At night there are stars, a moon, glowing lanterns and fireflies.
  - Optional sound, all generated in the browser: the water spout, birds, crickets, footsteps and splashes, and the animals.

## Running it

You need [Node.js](https://nodejs.org/). Then:

```
npm install
npm run dev
```

Then open the address Vite prints, usually http://localhost:5173/. The page reloads as you edit the source.

To build a static copy for hosting, run `npm run build`. It writes the site to `dist/`, with Three.js bundled in, so it needs no internet connection. You can host that folder anywhere, or try it locally with `npm run preview`.

The layout of trees, rocks and lanterns comes from a fixed random seed, so the garden looks the same on every visit.

## Controls

Click or tap the start screen to begin. You can reopen it any time with the **?** button in the top-left corner. It lists the controls and has the **Day/Night** and **Sound** buttons.

| Action | Desktop | Touch |
|---|---|---|
| Move | `W` `A` `S` `D` (hold `Shift` to run) | Joystick, bottom right |
| Look around | Mouse or arrow keys | Drag anywhere else on the screen |
| Jump / fly up | `Space` | ⤒ |
| Fly down | `C` | ⤓ (shown while flying) |
| Switch between walking and flying | `F` | ✈️ |
| Pet an animal / feed the koi | `E` | ✋ |
| Day ↔ night | `N` | Help screen button |
| Sound on ↔ off | `M` | Help screen button |
| Help | `H` or `Esc` | **?** |

## For developers

`index.html` holds the overlay markup and `src/style.css` the styles. The code is in `src/`, one module per thing in the garden:

| Folder | What's in it |
|---|---|
| `src/core/` | Scene, camera, renderer and bloom, lights, materials, layout constants, placement and physics |
| `src/world/` | The garden's features, one per file: pond, trees, lanterns, bridge, tea house, Fuji, sky and so on |
| `src/effects/` | Petals, fireflies and the day/night fade |
| `src/animals/` | Koi, the dog, birds and cats, plus feeding and petting |
| `src/player/` | Looking, walking and flying, and footsteps |
| `src/input/`, `src/ui/` | Keyboard, mouse and touch controls; HUD, help screen, compass |
| `src/audio/` | Synthesised sound effects |

`src/main.js` imports everything and runs the animation loop. Start reading there.

The browser console has a `window.garden` object for testing and screenshots. For example, `garden.setView({ x: 0, y: 12, z: 10, pitch: -0.8, fly: true })` moves the camera, and `garden.setNight(true, true)` switches to night instantly. It can also feed the koi, pet animals and report where the animals are. See [CLAUDE.md](CLAUDE.md) for the architecture notes.
