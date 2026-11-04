import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { SEED, mulberry32 } from '../core/random.js';
import { FOREST } from '../core/layout.js';
import { Feature } from './feature.js';

// ---- The forest beyond the fence ----
// A wide ring of woodland outside the garden, from its edge just past the fence out
// into the fog. Its nearest trees are clear, the furthest only grey shapes, so the
// horizon gets a treeline with real depth. It leaves two openings:
//  - toward Mount Fuji, where the trees are sparse and low. Japanese gardens do this
//    on purpose: "shakkei", borrowed scenery, frames a distant view as part of the
//    garden;
//  - a path straight out from the gateway.
//
// There are well over a thousand trees, so they're *instanced*: one InstancedMesh per
// kind of tree (pine and broadleaf) holds the shape once plus a transform for every
// copy, and the GPU draws them all in a single draw call. Each copy also gets its own
// colour (setColorAt), which tints its vertex colours: no two patches of forest are
// quite the same green.
//
// These trees are scenery, with no colliders: on foot the player is kept out of the
// forest (player/movement.js); flying over it is fine. They're placed by this feature's
// own seeded generator, not ctx.rand, so the garden's layout doesn't move.

const TRUNK = new THREE.Color(0x5a4334);
const PINE = new THREE.Color(0x355c3e), PINE_D = new THREE.Color(0x2a4b33);
const LEAF = new THREE.Color(0x4f7a42), LEAF_D = new THREE.Color(0x3f6638);
const ATTEMPTS = 3200;  // tries at placing a tree (at density 1)
const SPACING = 3.2;    // closest two trees may stand (at scale 1)
const FUJI_WINDOW = 0.22;

// A few simple shapes merged into one geometry, each painted one colour.
function shape(parts) {
  return mergeGeometries(parts.map(([geo, color, x, y, z]) => {
    // Cones and cylinders are indexed; polyhedra (the icosahedron) already aren't.
    const g = (geo.index ? geo.toNonIndexed() : geo).translate(x, y, z);
    g.deleteAttribute('uv');
    const colors = new Float32Array(g.attributes.position.count * 3);
    for (let i = 0; i < colors.length; i += 3) color.toArray(colors, i);
    g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    return g;
  }));
}

export class Forest extends Feature {
  // `fuji`: the view to keep open. `density` scales the tree count (touch devices: fewer).
  constructor(ctx, { fuji, density = 1 }) {
    super(ctx);
    const rand = mulberry32(SEED * 6007 + 11);
    const { inner, outer } = FOREST;
    const fujiAngle = Math.atan2(fuji.position.x, fuji.position.z);

    const kinds = {
      pine: shape([
        [new THREE.CylinderGeometry(0.22, 0.32, 1.6, 5), TRUNK, 0, 0.8, 0],
        [new THREE.ConeGeometry(2.1, 3.4, 6), PINE_D, 0, 2.9, 0],
        [new THREE.ConeGeometry(1.6, 3.0, 6), PINE, 0, 4.5, 0],
        [new THREE.ConeGeometry(1.0, 2.4, 6), PINE_D, 0, 6.0, 0],
      ]),
      broadleaf: shape([
        [new THREE.CylinderGeometry(0.2, 0.3, 2.4, 5), TRUNK, 0, 1.2, 0],
        [new THREE.IcosahedronGeometry(2.0, 0), LEAF, 0, 3.8, 0],
        [new THREE.IcosahedronGeometry(1.4, 0), LEAF_D, 0.9, 4.6, 0.5],
      ]),
    };

    // Pick the spots first (so we know how many of each kind), then fill the instances.
    // A coarse grid of cells remembers the trees already placed, so "is any tree too
    // close?" only checks the neighbouring cells, not every tree.
    const cell = SPACING * 1.6, grid = new Map(), key = (x, z) => `${Math.floor(x / cell)},${Math.floor(z / cell)}`;
    const trees = { pine: [], broadleaf: [] };
    const attempts = Math.round(ATTEMPTS * density);
    for (let i = 0; i < attempts; i++) {
      // sqrt spreads the tries evenly over the ring's area (see grass.js).
      const a = rand() * Math.PI * 2;
      const r = Math.sqrt(inner * inner + rand() * (outer * outer - inner * inner));
      const x = Math.sin(a) * r, z = Math.cos(a) * r;
      let scale = (0.9 + rand() * 0.7) * (1 + 0.25 * (r - inner) / (outer - inner)); // taller further out
      const kind = rand() < 0.6 ? 'pine' : 'broadleaf';
      const yaw = rand() * Math.PI * 2, tint = rand();
      // The path out of the gateway.
      if (z > 0 && Math.abs(x) < 5) continue;
      // Toward Fuji: few trees, and low ones, so the mountain's foot shows.
      const off = Math.abs(Math.atan2(Math.sin(a - fujiAngle), Math.cos(a - fujiAngle)));
      if (off < FUJI_WINDOW) {
        if (rand() > 0.25) continue;
        scale *= 0.55;
      }
      const room = SPACING * scale;
      const cx = Math.floor(x / cell), cz = Math.floor(z / cell);
      let crowded = false;
      for (let gx = cx - 1; gx <= cx + 1 && !crowded; gx++) {
        for (let gz = cz - 1; gz <= cz + 1 && !crowded; gz++) {
          crowded = (grid.get(`${gx},${gz}`) ?? []).some((t) => Math.hypot(t.x - x, t.z - z) < room);
        }
      }
      if (crowded) continue;
      const tree = { x, z, scale, yaw, tint };
      const k = key(x, z);
      if (!grid.has(k)) grid.set(k, []);
      grid.get(k).push(tree);
      trees[kind].push(tree);
    }

    const material = new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.9 });
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3();
    const UP = new THREE.Vector3(0, 1, 0), c = new THREE.Color();
    this.count = 0;
    for (const [kind, list] of Object.entries(trees)) {
      const mesh = new THREE.InstancedMesh(kinds[kind], material, list.length);
      list.forEach((t, i) => {
        // Stand on the ground (mounds included), a little sunk so no base floats.
        p.set(t.x, ctx.physics.surfaceHeightAt(t.x, t.z) - 0.1, t.z);
        m.compose(p, q.setFromAxisAngle(UP, t.yaw), s.setScalar(t.scale));
        mesh.setMatrixAt(i, m);
        mesh.setColorAt(i, c.setRGB(0.8 + 0.3 * t.tint, 0.85 + 0.25 * t.tint, 0.8 + 0.15 * t.tint)); // lighter or darker, yellower or bluer
      });
      // Bounds of all the copies together, for frustum culling.
      mesh.computeBoundingSphere();
      this.group.add(mesh);
      this.count += list.length;
    }
  }
}
