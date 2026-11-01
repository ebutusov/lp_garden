import * as THREE from 'three';
import { scene } from '../core/scene.js';
import { M } from '../core/materials.js';
import { rand } from '../core/random.js';
import { WIND_DIR, windStrength } from '../core/layout.js';
import { isClear, reserve } from '../core/placement.js';
import { addCircleSolid } from '../core/physics.js';

// ---- Trees ----
// Each maker returns the tree and its crown. The crown is a child Group placed at the
// top of the trunk: rotating it pivots the whole crown around that point, so it can
// sway in the wind while the trunk stays put. Choosing where a group's origin sits is
// how you choose the pivot of a rotation.
function makePineTree() {
  const g = new THREE.Group();
  // CylinderGeometry(radiusTop, radiusBottom, height, radialSegments): with only 6
  // segments the "cylinder" is a hexagonal prism, which is the low-poly look.
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.4, 2.5, 6), M.trunk);
  // Geometry is centred on its own origin, so lift it by half its height to stand on y = 0.
  trunk.position.y = 1.25; trunk.castShadow = true;
  g.add(trunk);
  const crown = new THREE.Group();
  crown.position.y = 2.4;
  const layers = 4;
  for (let i = 0; i < layers; i++) {
    const t = i / (layers - 1);
    const cs = new THREE.Mesh(
      new THREE.ConeGeometry(2.4 - t * 1.4, 2.2, 7),
      i % 2 === 0 ? M.pine : M.pineD
    );
    cs.position.y = i * 1.5;
    cs.castShadow = true;
    crown.add(cs);
  }
  g.add(crown);
  return { group: g, crown };
}

// Rounded crown of low-poly blobs, used by maples and cherries. An icosahedron with
// detail 0 is the classic 20-faced low-poly "sphere".
function makeBlobTree(trunkMat, trunkH, mats, blobs, minR, spreadR, spreadY) {
  const g = new THREE.Group();
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.32, trunkH, 6), trunkMat);
  trunk.position.y = trunkH / 2; trunk.castShadow = true;
  g.add(trunk);
  const crown = new THREE.Group();
  crown.position.y = trunkH;
  for (let i = 0; i < blobs; i++) {
    const c = new THREE.Mesh(
      new THREE.IcosahedronGeometry(minR + rand() * 0.5, 0),
      mats[Math.floor(rand() * mats.length)]
    );
    c.position.set((rand() - 0.5) * spreadR, 0.4 + rand() * spreadY, (rand() - 0.5) * spreadR);
    c.castShadow = true;
    crown.add(c);
  }
  g.add(crown);
  return { group: g, crown };
}
const TREE_MAKERS = {
  pine: makePineTree,
  maple: () => makeBlobTree(M.trunk, 3, [M.maple, M.maple2], 5, 1.6, 2.6, 1.2),
  cherry: () => makeBlobTree(M.cherryTrunk, 2.8, M.cherry, 6, 1.3, 3.2, 1.3),
};
// Canopy radius at scale 1: pine's widest cone; blob trees' offset + largest blob.
const CANOPY_R = { pine: 2.4, maple: 1.3 + 2.1, cherry: 1.6 + 1.8 };
const TRUNK_R = { pine: 0.4, maple: 0.32, cherry: 0.32 };
const SWAY = { pine: 0.035, maple: 0.06, cherry: 0.06 };

const treePositions = [
  [14, 10], [-16, 6], [20, -14], [-22, -10], [10, -26],
  [-12, 22], [26, 18], [-28, -22], [38, -16], [-36, 14],
  [6, 32], [-6, -34], [18, 30], [-24, 26],
  [30, 28], [-30, 30], [42, 10], [-40, -6], [-14, -30], [24, -30], [-34, -26], [0, -42],
];
// A fixed mix of species, shuffled (Fisher–Yates), so every layout has cherries for the petals.
const treeTypes = [...Array(8).fill('pine'), ...Array(6).fill('maple'), ...Array(8).fill('cherry')];
for (let i = treeTypes.length - 1; i > 0; i--) {
  const j = Math.floor(rand() * (i + 1));
  [treeTypes[i], treeTypes[j]] = [treeTypes[j], treeTypes[i]];
}
export const trees = [];          // for wind sway
export const cherryCrowns = [];   // where petals fall from
treePositions.forEach(([x, z], i) => {
  const type = treeTypes[i];
  const scale = 0.8 + rand() * 0.7;
  const canopy = CANOPY_R[type] * scale;
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
  const { group, crown } = TREE_MAKERS[type]();
  // Scaling the group scales everything in it, trunk and crown alike.
  group.scale.setScalar(scale);
  group.position.set(spot.x, 0, spot.z);
  const ry = rand() * Math.PI * 2;
  group.rotation.y = ry;
  scene.add(group);
  addCircleSolid(spot.x, spot.z, TRUNK_R[type] * scale, 20);
  // The crown's rotation is in the tree's own (local, already turned by ry) frame, so
  // the world wind direction is rotated into that frame once, here: a 2D rotation by ry.
  const c = Math.cos(ry), s = Math.sin(ry);
  trees.push({
    crown, sway: SWAY[type], phase: rand() * Math.PI * 2,
    lx: WIND_DIR.x * c - WIND_DIR.y * s, lz: WIND_DIR.x * s + WIND_DIR.y * c,
  });
  if (type === 'cherry') cherryCrowns.push({ x: spot.x, y: 3.9 * scale, z: spot.z, r: 2 * scale });
});

// Tilt each crown away from the wind. Tilting about X leans it along Z and tilting
// about Z leans it along -X, so the local wind components map onto those two angles.
export function updateTrees(t) {
  const w = windStrength(t);
  for (const tr of trees) {
    const s = w * tr.sway * (0.6 + 0.4 * Math.sin(t * 1.7 + tr.phase));
    tr.crown.rotation.x = tr.lz * s;
    tr.crown.rotation.z = -tr.lx * s;
  }
}
