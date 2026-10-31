# 日本の庭園 · Japanese Garden

A low-poly Japanese garden you can explore in the browser, on foot or flying. It runs on desktop and on phones and tablets. The whole thing is one HTML file built with [Three.js](https://threejs.org/), with no build step or dependencies to install.

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

Browsers won't load the page's JavaScript modules from a file opened directly from disk, so serve the folder with any local web server, for example:

```
python -m http.server 8765 --bind 127.0.0.1
```

Then open http://127.0.0.1:8765/ in your browser.

You need an internet connection, because Three.js loads from unpkg.

The layout of trees, rocks and lanterns comes from a seed, so the garden looks the same on every visit. Add `?seed=N` to the address for a different arrangement, for example `?seed=7`. The same seed always gives the same garden.

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

Everything is in `index.html`: the styles, the overlay markup and one JavaScript module. The module is split into sections marked with `// ---- Section ----` comments.

The browser console has a `window.garden` object for testing and screenshots. For example, `garden.setView({ x: 0, y: 12, z: 10, pitch: -0.8, fly: true })` moves the camera, and `garden.setNight(true, true)` switches to night instantly. It can also feed the koi, pet animals and report where the animals are. See [CLAUDE.md](CLAUDE.md) for the architecture notes.
