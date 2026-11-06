import * as THREE from 'three';
import { M, mat } from '../core/materials.js';
import { mulberry32, SEED } from '../core/random.js';
import { Feature } from './feature.js';

// ---- Stone wash basin (tsukubai) by the tea path ----
// Before the tea ceremony guests rinse their hands at a low stone basin. It's set so
// low that you have to crouch (tsukubau) to reach it: a gesture of humility. Around it:
//  - the basin (chōzubachi), a rough stone hollowed out and brimming with water;
//  - the front stone (mae-ishi), a flat stone to crouch on;
//  - two flanking stones, one for a hand lantern and one for a pail of warm water;
//  - the "sea" (umi), a bed of dark pebbles that takes the spilt water;
//  - a bamboo pipe (kakei) that keeps the basin filled with a thin trickle;
//  - a bamboo dipper (hishaku) resting across the rim.
// The Gardener rinses his hands here on his way in to tea (people/gardener.js). He
// faces the basin from the front stone, at local +Z, so he looks toward -Z.
//
// The group isn't turned, so its local axes are the world's: the colliders can use
// world-aligned shapes, and the dipper's angles mean the same in both frames.
const BASIN_TOP = 0.58, WATER_Y = BASIN_TOP - 0.03;
const HANDLE = 0.55;  // the dipper's handle, from the grip to the cup

export class Tsukubai extends Feature {
  constructor(ctx, { x, z }) {
    super(ctx, { x, z });
    // Its own seeded generator for the pebbles, so it draws nothing from ctx.rand
    // (which would rearrange the rest of the garden).
    const rand = mulberry32(SEED * 7919 + 11);
    const part = (geo, m, px, py, pz, opts = { cast: true, receive: true }) => this.mesh(geo, m, px, py, pz, opts);
    const MOSSY = mat(0x6e7466, { roughness: 1 });
    const DARK = mat(0x3a3a38, { roughness: 1 });
    const WATER = mat(0x5d8ea3, { roughness: 0.05, metalness: 0.25 });

    // The basin: a squat, eight-sided stone, a little wider at the top. The hollow is
    // faked: a dark rim inside the top edge with the water's surface just below it.
    part(new THREE.CylinderGeometry(0.5, 0.56, BASIN_TOP, 8), MOSSY, 0, BASIN_TOP / 2, 0);
    part(new THREE.CylinderGeometry(0.36, 0.36, 0.02, 12), DARK, 0, BASIN_TOP + 0.005, 0);
    part(new THREE.CircleGeometry(0.34, 12).rotateX(-Math.PI / 2), WATER, 0, BASIN_TOP + 0.017, 0, { receive: true });

    // The front stone to crouch on, and the two flanking stones (left and right as
    // you face the basin), squashed dodecahedra like the garden's rocks.
    part(new THREE.CylinderGeometry(0.46, 0.5, 0.14, 7), M.stone, 0, 0.07, 1.15);
    this.sideStones = [
      part(new THREE.DodecahedronGeometry(0.3, 0), M.stoneD, -0.82, 0.24, 0.35),
      part(new THREE.DodecahedronGeometry(0.28, 0), M.stone, 0.82, 0.14, 0.4),
    ];
    this.sideStones[0].scale.set(1, 1.2, 0.9);
    this.sideStones[1].scale.set(1.1, 0.6, 1);

    // The sea: pebbles strewn round the basin, between it and the front stone.
    for (let i = 0; i < 26; i++) {
      const a = rand() * Math.PI * 2, d = 0.6 + rand() * 0.45;
      const px = Math.cos(a) * d, pz = Math.sin(a) * d * 1.1 + 0.15;
      if (Math.hypot(px, pz - 1.15) < 0.55) continue; // not under the front stone
      const s = 0.05 + rand() * 0.04;
      part(new THREE.DodecahedronGeometry(s, 0), rand() < 0.5 ? DARK : M.stoneD, px, s * 0.5, pz, { receive: true });
    }

    // The bamboo pipe: a post behind the basin with a spout reaching over it, and a
    // thin, see-through thread of water falling from its mouth. (Transparent meshes
    // aren't merged, which is right here: they're sorted and blended one by one.)
    const SPOUT_Y = 0.92, MOUTH_Z = -0.12;
    part(new THREE.CylinderGeometry(0.06, 0.065, SPOUT_Y + 0.08, 8), M.bambooD, 0, (SPOUT_Y + 0.08) / 2, -0.78);
    const spoutLen = 0.78 + MOUTH_Z + 0.05;
    part(new THREE.CylinderGeometry(0.035, 0.035, spoutLen, 6).rotateX(Math.PI / 2), M.bamboo, 0, SPOUT_Y, -0.78 + spoutLen / 2 - 0.05);
    this.mesh(
      new THREE.CylinderGeometry(0.012, 0.016, SPOUT_Y - WATER_Y, 5),
      new THREE.MeshStandardMaterial({ color: 0x9fd3e6, transparent: true, opacity: 0.5, roughness: 0.2 }),
      0, (SPOUT_Y + WATER_Y) / 2, MOUTH_Z + 0.01,
    );

    // The dipper: a long bamboo handle with a little cup at its far end. Its origin is
    // the grip, the handle runs along +X to the cup, and the cup opens up (+Y). It's a
    // group of its own (left out of the merge), so the Gardener can take it up: like
    // his tea cup, animateDipper() in gardener.js eases it between its rest and his
    // hand. At rest it lies across the basin, grip to the left, cup over the water.
    const dipper = this.dipper = new THREE.Group();
    this.mesh(new THREE.CylinderGeometry(0.014, 0.014, HANDLE, 5).rotateZ(Math.PI / 2), M.bamboo, HANDLE / 2 - 0.06, 0, 0, { cast: true, parent: dipper });
    // The cup is an open-ended cylinder, so both its faces must be drawn (DoubleSide):
    // looking into it you see the inside of the far wall.
    const CUP = mat(0x9bb34a, { roughness: 0.6, side: THREE.DoubleSide });
    this.mesh(new THREE.CylinderGeometry(0.065, 0.06, 0.09, 8, 1, true), CUP, HANDLE, 0.03, 0, { cast: true, parent: dipper });
    this.mesh(new THREE.CircleGeometry(0.06, 8).rotateX(-Math.PI / 2), M.bambooD, HANDLE, -0.012, 0, { parent: dipper }); // its base
    dipper.position.set(-0.42, BASIN_TOP + 0.05, 0.12);
    dipper.rotation.set(0, -0.15, 0);
    this.group.add(dipper);
    this.dipperRest = { position: dipper.position.clone(), quaternion: dipper.quaternion.clone() };

    // One circle over the basin, the pipe and the side stones (one round shape, so the
    // animals' feelers slide off it), and the front stone to step up on.
    this.solids = [this.solidCircle(0, -0.15, 0.9, 1)];
    this.platform(-0.35, 0.35, 0.8, 1.5, 0.14);

    // Where to crouch: on the front stone, facing the basin.
    this.standLocal = { x: 0, z: 1.3 };
  }

  // The dipper moves; everything else is fused into one mesh per material.
  mergeStatic() {
    super.mergeStatic({ skip: [this.dipper] });
  }

  // Where to crouch to use it, in world coordinates, and which way to face.
  standSpot() {
    const w = this.toWorld(this.standLocal.x, this.standLocal.z);
    return { x: w.x, z: w.z, heading: Math.PI };
  }

  // Round the stones and the pebbles, for the grass to keep clear of.
  footprints() {
    const p = this.group.position;
    return [{ x: p.x, z: p.z, r: 1.15 }, { x: p.x, z: p.z + 1.15, r: 0.55 }];
  }

  // A spot on each flanking stone for the butterflies.
  landings() {
    return this.sideStones.map((s) => this.landingOn(s, 0, 0, 'stone', 0.6)).filter(Boolean);
  }
}
