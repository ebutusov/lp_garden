import * as THREE from 'three';
import { M } from '../core/materials.js';
import { rand } from '../core/random.js';
import { WIND_DIR, windStrength } from '../core/layout.js';
import { isClear, reserve } from '../core/placement.js';
import { Feature } from './feature.js';

// ---- Trees ----
// Every tree has a trunk and a crown. The crown is a child Group placed at the top of
// the trunk: rotating it pivots the whole crown around that point, so it can sway in
// the wind while the trunk stays put. Choosing where a group's origin sits is how you
// choose the pivot of a rotation.
//
// Tree is an abstract base class: it does everything trees have in common (placing,
// scaling, turning, the collider, swaying) and leaves build() to its subclasses, which
// each grow their own shape. Static fields hold numbers shared by every tree of a kind,
// read through this.constructor (the subclass the tree was made from).
class Tree extends Feature {
  constructor(x, z, scale, parent) {
    super(x, z, parent);
    // Scaling the group scales everything in it, trunk and crown alike.
    this.group.scale.setScalar(scale);
    this.crown = new THREE.Group();
    this.build();
    this.group.add(this.crown);
    const ry = rand() * Math.PI * 2;
    this.group.rotation.y = ry;
    this.solidCircle(0, 0, this.constructor.TRUNK_R * scale, 20);
    // The crown's rotation is in the tree's own (local, already turned by ry) frame, so
    // the world wind direction is rotated into that frame once, here: a 2D rotation by ry.
    const c = Math.cos(ry), s = Math.sin(ry);
    this.lx = WIND_DIR.x * c - WIND_DIR.y * s;
    this.lz = WIND_DIR.x * s + WIND_DIR.y * c;
    this.phase = rand() * Math.PI * 2;
  }

  // Tilt the crown away from the wind (strength w). Tilting about X leans it along Z and
  // tilting about Z leans it along -X, so the local wind components map onto those two angles.
  sway(t, w) {
    const s = w * this.constructor.SWAY * (0.6 + 0.4 * Math.sin(t * 1.7 + this.phase));
    this.crown.rotation.x = this.lz * s;
    this.crown.rotation.z = -this.lx * s;
  }
}

class PineTree extends Tree {
  static CANOPY_R = 2.4; // canopy radius at scale 1: the widest cone
  static TRUNK_R = 0.4;
  static SWAY = 0.035;
  build() {
    // CylinderGeometry(radiusTop, radiusBottom, height, radialSegments): with only 6
    // segments the "cylinder" is a hexagonal prism, which is the low-poly look.
    // Geometry is centred on its own origin, so lift it by half its height to stand on y = 0.
    this.mesh(new THREE.CylinderGeometry(0.25, 0.4, 2.5, 6), M.trunk, 0, 1.25, 0, { cast: true });
    this.crown.position.y = 2.4;
    const layers = 4;
    for (let i = 0; i < layers; i++) {
      const t = i / (layers - 1);
      this.mesh(new THREE.ConeGeometry(2.4 - t * 1.4, 2.2, 7), i % 2 === 0 ? M.pine : M.pineD,
        0, i * 1.5, 0, { cast: true, parent: this.crown });
    }
  }
}

// Rounded crown of low-poly blobs, used by maples and cherries, which differ only in
// their LOOK. An icosahedron with detail 0 is the classic 20-faced low-poly "sphere".
class BlobTree extends Tree {
  static TRUNK_R = 0.32;
  static SWAY = 0.06;
  build() {
    const { trunkMat, trunkH, mats, blobs, minR, spreadR, spreadY } = this.constructor.LOOK;
    this.mesh(new THREE.CylinderGeometry(0.18, 0.32, trunkH, 6), trunkMat, 0, trunkH / 2, 0, { cast: true });
    this.crown.position.y = trunkH;
    for (let i = 0; i < blobs; i++) {
      this.mesh(
        new THREE.IcosahedronGeometry(minR + rand() * 0.5, 0),
        mats[Math.floor(rand() * mats.length)],
        (rand() - 0.5) * spreadR, 0.4 + rand() * spreadY, (rand() - 0.5) * spreadR,
        { cast: true, parent: this.crown },
      );
    }
  }
}
class MapleTree extends BlobTree {
  static LOOK = { trunkMat: M.trunk, trunkH: 3, mats: [M.maple, M.maple2], blobs: 5, minR: 1.6, spreadR: 2.6, spreadY: 1.2 };
  static CANOPY_R = 1.3 + 2.1; // blob offset + largest blob
}
class CherryTree extends BlobTree {
  static LOOK = { trunkMat: M.cherryTrunk, trunkH: 2.8, mats: M.cherry, blobs: 6, minR: 1.3, spreadR: 3.2, spreadY: 1.3 };
  static CANOPY_R = 1.6 + 1.8;
}

const TREE_TYPES = { pine: PineTree, maple: MapleTree, cherry: CherryTree };
const treePositions = [
  [14, 10], [-16, 6], [20, -14], [-22, -10], [10, -26],
  [-12, 22], [26, 18], [-28, -22], [38, -16], [-36, 14],
  [6, 32], [-6, -34], [18, 30], [-24, 26],
  [30, 28], [-30, 30], [42, 10], [-40, -6], [-14, -30], [24, -30], [-34, -26], [0, -42],
];

// All the trees: picks their spots and species, and sways them every frame.
class Trees extends Feature {
  constructor() {
    super();
    this.list = [];          // for wind sway and bird perches
    this.cherryCrowns = [];  // where petals fall from
    // A fixed mix of species, shuffled (Fisher–Yates), so every layout has cherries for the petals.
    const types = [...Array(8).fill('pine'), ...Array(6).fill('maple'), ...Array(8).fill('cherry')];
    for (let i = types.length - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      [types[i], types[j]] = [types[j], types[i]];
    }
    treePositions.forEach(([x, z], i) => {
      const TreeType = TREE_TYPES[types[i]];
      const scale = 0.8 + rand() * 0.7;
      const canopy = TreeType.CANOPY_R * scale;
      // Jitter around the planned spot, widening the search if it's crowded.
      let spot = null;
      for (let k = 0; k < 30 && !spot; k++) {
        const jitter = 4 + k * 0.4;
        const tx = x + (rand() - 0.5) * jitter;
        const tz = z + (rand() - 0.5) * jitter;
        if (isClear(tx, tz, canopy)) spot = { x: tx, z: tz };
      }
      if (!spot) return;
      // Reserve less than the full canopy: neighbouring crowns may touch.
      reserve(spot.x, spot.z, canopy * 0.75);
      this.list.push(new TreeType(spot.x, spot.z, scale, this.group));
      if (TreeType === CherryTree) this.cherryCrowns.push({ x: spot.x, y: 3.9 * scale, z: spot.z, r: 2 * scale });
    });
  }

  update(dt, t) {
    const w = windStrength(t);
    for (const tree of this.list) tree.sway(t, w);
  }
}
export const trees = new Trees();
