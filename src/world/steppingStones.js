import * as THREE from 'three';
import { M } from '../core/materials.js';
import { Feature } from './feature.js';

// ---- Stepping stones (tobi-ishi): torii → bridge, and tea house → pond ----
// The main path zigzags along x = 0 from z = `from` to z = `to`; `teaPath` lists the
// stones in front of the tea house.
const STONE_H = 0.25;

export class SteppingStones extends Feature {
  constructor(ctx, { from, to, teaPath }) {
    super(ctx);
    const { rand } = ctx;
    const stoneCount = 9;
    for (let i = 0; i < stoneCount; i++) {
      const z = from + (to - from) * (i / (stoneCount - 1));
      this.addStone((i % 2 ? 0.6 : -0.6) + (rand() - 0.5) * 0.4, z);
    }
    for (const [x, z] of teaPath) this.addStone(x, z);
  }

  addStone(x, z) {
    const { rand } = this.ctx;
    const top = 0.7 + rand() * 0.4;
    // A mesh can both cast shadows onto others and receive them from others.
    const stone = this.mesh(new THREE.CylinderGeometry(top, 0.9, STONE_H, 7), M.stone,
      x, 0.12, z, { cast: true, receive: true });
    stone.rotation.y = rand() * Math.PI;
    // Something to stand on: a disc at the stone's top, for everyone who asks
    // physics.surfaceHeightAt() (the player, the animals, the Gardener). The top is a
    // heptagon, turned at random, so the disc is its inscribed circle (radius times
    // cos(π/7), the distance to the middle of a side): it never reaches past an edge,
    // whichever way the stone is turned. Walking over the corners you're on the grass.
    this.ctx.physics.addPad(x, z, top * Math.cos(Math.PI / 7), 0.12 + STONE_H / 2);
  }

  // The stones as built (mergeStatic adds a merged copy of them beside them).
  get stones() { return this.group.children.filter((o) => !o.userData.merged); }

  // Butterflies sun themselves on the stones' flat tops.
  landings() {
    return this.stones.map((stone) => this.landingOn(stone, 0, 0, 'stone')).filter(Boolean);
  }

  // Each stone's footprint { x, z, r } (the group sits at the origin, so these are world
  // coordinates). The grass keeps clear of them.
  footprints() {
    return this.stones.map((o) => ({
      x: o.position.x, z: o.position.z, r: Math.max(o.geometry.parameters.radiusTop, o.geometry.parameters.radiusBottom),
    }));
  }
}
