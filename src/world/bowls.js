import * as THREE from 'three';
import { M, mat } from '../core/materials.js';
import { POND_Z, BRIDGE_SPAN, BRIDGE_WIDTH } from '../core/layout.js';
import { Feature } from './feature.js';

// ---- Feeding bowls by the tea house ----
// A dog bowl, a cat bowl and a shared water bowl, each on a flat stone along the tea
// house's south wall, with a wooden bin of kibble and a water bucket at the end of
// the row. The animals come to eat and drink when they're hungry or thirsty (see
// Animal.findMeal); the Gardener fills the bowls back up (Gardener.fill).
//
// Two ideas worth noticing:
//
//  1. A BOWL SHAPE FROM A PROFILE. LatheGeometry spins a 2D outline (radius, height
//     pairs) round the Y axis, the way a potter's wheel turns clay. One short list of
//     points gives the outside wall, the rim and the hollow inside, which a cylinder
//     can't: a cylinder is solid, so there'd be nothing to fill.
//
//  2. STATE YOU DERIVE INSTEAD OF STORE. Who is eating at which bowl isn't written down
//     anywhere: it's worked out when asked, from the animals themselves (their state is
//     'bowl' and their meal names this bowl and seat). A flag set when an animal sits
//     down would have to be cleared on every way it can leave (fleeing, being petted,
//     greeting the player…), and one forgotten exit would lock the seat for good.
//     Asking the animals can't go stale.
const BIN = { x: -4.2, w: 0.7, d: 0.5, h: 0.45 };
const BUCKET_X = -3.2;
const STONE_H = 0.07;
// A point clear of the south end of the pond-and-bridge barrier (the bridge's no-go box
// reaches z = POND_Z + BRIDGE_SPAN / 2, plus a body).
const POND_SOUTH_END = { x: BRIDGE_WIDTH / 2 + 1.5, z: POND_Z + BRIDGE_SPAN / 2 + 2 };
const BUCKET_TOP = 0.42;  // the bucket's origin is the top of its handle: it hangs from a hand

// Each bowl: where it is along the row (local x), its size, glaze and contents, and
// the seats round it, as angles from straight out (+Z, away from the house).
const BOWLS = [
  { kind: 'cat', x: -1.6, r: 0.17, h: 0.08, glaze: 0x34557a, level: 0.6, seats: [0.8, -0.8] },
  { kind: 'water', x: 0.9, r: 0.28, h: 0.12, glaze: 0xd8d0bc, level: 0.8, seats: [0.8, -0.8] },
  { kind: 'dog', x: 3.6, r: 0.24, h: 0.12, glaze: 0xa8402e, level: 0.7, seats: [0] },
];

export class Bowls extends Feature {
  // `house`: { x, z }, the tea house the bowls stand beside, for routing round it.
  constructor(ctx, { x, z, house }) {
    super(ctx, { x, z });
    this.house = house;
    this.eaters = [];   // the animals that use the bowls; garden.js sets them
    this.solids = [];   // the colliders added here (debug.js leaves them out of the fingerprint)
    const WATER = mat(0x6a9ab0, { roughness: 0.08, metalness: 0.2 });

    this.list = BOWLS.map((spec) => this.makeBowl(spec, spec.kind === 'water' ? WATER : M.pellet));
    this.byKind = Object.fromEntries(this.list.map((b) => [b.kind, b]));
    this.water = this.byKind.water;

    // The kibble bin: a box with an overhanging lid.
    this.mesh(new THREE.BoxGeometry(BIN.w, BIN.h, BIN.d), M.darkWood, BIN.x, BIN.h / 2, 0, { cast: true, receive: true });
    this.mesh(new THREE.BoxGeometry(BIN.w + 0.08, 0.06, BIN.d + 0.08), M.wood, BIN.x, BIN.h + 0.03, 0, { cast: true });
    this.solids.push(this.solidBox(BIN.x - BIN.w / 2, BIN.x + BIN.w / 2, -BIN.d / 2, BIN.d / 2, BIN.h + 0.06));

    this.buildBucket(WATER);
  }

  // A glazed bowl on a flat stone, with its contents: a disc of kibble or water whose
  // height follows `level` (0 empty … 1 full).
  makeBowl({ kind, x, r, h, glaze, level, seats }, fill) {
    const floor = h * 0.3;
    this.mesh(new THREE.CylinderGeometry(r + 0.17, r + 0.2, STONE_H, 9), M.stone, x, STONE_H / 2, 0, { receive: true });
    // The outline, from the middle of the base out, up the outside, over the rim and
    // down the inside to the floor of the hollow.
    const profile = [[0.001, 0], [r * 0.75, 0], [r * 0.95, h * 0.3], [r, h], [r * 0.86, h], [r * 0.74, floor * 1.2], [0.001, floor]]
      .map(([px, py]) => new THREE.Vector2(px, py));
    const bowlMat = mat(glaze, { roughness: 0.35, side: THREE.DoubleSide });
    this.mesh(new THREE.LatheGeometry(profile, 14), bowlMat, x, STONE_H, 0, { cast: true, receive: true });
    // The contents: a cylinder one unit tall with its base at the origin, so scaling it
    // in Y raises the surface without moving the bottom.
    const depth = h * 0.92 - floor;
    const content = this.mesh(
      new THREE.CylinderGeometry(r * 0.85, r * 0.74, 1, 14).translate(0, 0.5, 0), fill, x, STONE_H + floor, 0, { receive: true },
    );
    // Kibble heaps up a little in the middle: a flattened half-sphere riding on top. It's
    // a sibling of the contents, not a child, or their Y scale would squash it too.
    const heap = kind === 'water' ? null
      : this.mesh(new THREE.SphereGeometry(r * 0.8, 10, 3, 0, Math.PI * 2, 0, Math.PI / 2), fill, x, 0, 0);
    if (heap) heap.scale.y = 0.3;
    const p = this.toWorld(x, 0);
    const bowl = {
      kind, r, level, target: level, content, heap, base: STONE_H + floor, depth, seats,
      x: p.x, z: p.z, solid: this.solidCircle(x, 0, r + 0.04, h + STONE_H),
    };
    this.solids.push(bowl.solid);
    this.showLevel(bowl);
    return bowl;
  }

  // A wooden bucket (oke) bound with bamboo hoops, with a rope handle.
  buildBucket(water) {
    const b = this.bucket = new THREE.Group();
    const H = 0.26, top = -BUCKET_TOP + H;
    this.mesh(new THREE.CylinderGeometry(0.16, 0.14, H, 10), M.wood, 0, -BUCKET_TOP + H / 2, 0, { cast: true, parent: b });
    this.mesh(new THREE.CircleGeometry(0.15, 10).rotateX(-Math.PI / 2), water, 0, top - 0.04, 0, { parent: b });
    for (const y of [0.06, H - 0.06]) {
      this.mesh(new THREE.TorusGeometry(0.155 - y * 0.06, 0.012, 4, 12).rotateX(Math.PI / 2), M.bamboo, 0, -BUCKET_TOP + y, 0, { parent: b });
    }
    this.mesh(new THREE.TorusGeometry(0.15, 0.01, 4, 10, Math.PI), M.bambooD, 0, top, 0, { parent: b }); // handle
    this.bucketRest = new THREE.Vector3(BUCKET_X, STONE_H + BUCKET_TOP, 0);
    this.mesh(new THREE.CylinderGeometry(0.3, 0.33, STONE_H, 8), M.stone, BUCKET_X, STONE_H / 2, 0, { receive: true });
    b.position.copy(this.bucketRest);
    this.group.add(b);
  }

  showLevel(bowl) {
    bowl.content.visible = bowl.level > 0.01;
    bowl.content.scale.y = Math.max(bowl.level, 0.01) * bowl.depth;
    if (bowl.heap) {
      // The heap shrinks as it's eaten, and sinks with the surface it sits on.
      bowl.heap.visible = bowl.level > 0.08;
      bowl.heap.position.y = bowl.base + bowl.level * bowl.depth - 0.005;
      bowl.heap.scale.set(0.6 + 0.4 * bowl.level, 0.3 * bowl.level, 0.6 + 0.4 * bowl.level);
    }
  }

  // The food bowl for this animal ('dog' or 'cat').
  foodFor(animal) {
    return this.byKind[animal.bowlKind];
  }

  // Is anyone (other than `self`) eating at seat i of this bowl?
  taken(bowl, i, self = null) {
    return this.eaters.some((a) => a !== self && a.state === 'bowl' && a.meal?.bowl === bowl && a.meal.i === i);
  }

  // A free seat at the bowl for `animal`, whose mouth is `reach` ahead of its body:
  // { bowl, i, x, z, heading }, the nearest free one, or null if the bowl is empty or full up.
  seat(bowl, animal, reach) {
    if (bowl.level < 0.05) return null;
    let best = null;
    bowl.seats.forEach((a, i) => {
      if (this.taken(bowl, i, animal)) return;
      const x = bowl.x + Math.sin(a) * reach, z = bowl.z + Math.cos(a) * reach;
      const d = Math.hypot(x - animal.x, z - animal.z);
      if (!best || d < best.d) best = { bowl, i, x, z, heading: a + Math.PI, d };
    });
    return best;
  }

  // Waypoints for an animal at (x, z) to reach the bowl: the feelers only see a step
  // ahead, so a trip across the garden would get stuck behind the two big obstacles
  // in the way. One is the pond with the bridge across it, a barrier along x = 0;
  // animals east of it go round its south end. The other is the tea house, which
  // stands between the bowls and anything north of it; they go round its nearer side.
  // The last waypoint is a spot just out in front of the bowl, so the final steps
  // come straight in from the south.
  route(x, z, bowl) {
    const front = { x: bowl.x, z: bowl.z + 2.2 }, pts = [];
    const pond = POND_SOUTH_END;
    if (x > 0) {
      const zc = z + (front.z - z) * (x / (x - front.x)); // where the straight line crosses x = 0
      if (zc > -22 && zc < pond.z) { pts.push({ x: pond.x, z: pond.z }, { x: -pond.x, z: pond.z }); x = -pond.x; z = pond.z; }
    }
    // The animals keep out of this box round the tea house (Physics.groundBlocked), padded.
    const h = this.house, inBox = (px, pz) => Math.abs(px - h.x) < 5.8 && Math.abs(pz - h.z) < 5.2;
    let crosses = false;
    for (let i = 1; i < 20 && !crosses; i++) crosses = inBox(x + (front.x - x) * i / 20, z + (front.z - z) * i / 20);
    if (crosses || inBox(x, z)) {
      const side = x < h.x ? -6.5 : 6.5;
      pts.push({ x: h.x + side, z: Math.min(z, h.z + 1) }, { x: h.x + side, z: front.z });
    }
    pts.push(front);
    return pts;
  }

  // Eat (or drink) up to `amount` from the bowl; returns how much there was to take.
  take(bowl, amount) {
    const got = Math.min(bowl.level, amount);
    bowl.level -= got;
    bowl.target = Math.min(bowl.target, bowl.level);
    this.showLevel(bowl);
    return got;
  }

  // Fill it to the brim; update() raises the level over a second or two, as it's poured.
  fill(bowl) {
    bowl.target = 1;
  }

  // Circles for the grass to keep clear of: a strip of bare, trodden ground along the
  // whole row, from the bin to the dog bowl, so the tall blades don't hide the bowls.
  // Overlapping circles every 0.6 units make the strip's edges gently scalloped.
  footprints() {
    const spots = [];
    for (let lx = BIN.x - 0.6; lx <= BOWLS[BOWLS.length - 1].x + 0.8; lx += 0.6) {
      const p = this.toWorld(lx, -0.1);
      spots.push({ x: p.x, z: p.z, r: 1.25 });
    }
    return spots;
  }

  // The emptiest bowl's level.
  lowest() {
    return Math.min(...this.list.map((b) => b.level));
  }

  // Where to stand to reach something at local x along the row: a little way out from it.
  standAt(lx, out = 0.8) {
    return this.toWorld(lx, out).clone();
  }
  get binStand() { return this.standAt(BIN.x, BIN.d / 2 + 0.6); }
  get bucketStand() { return this.standAt(BUCKET_X, 0.75); }

  update(dt) {
    for (const b of this.list) {
      if (b.level < b.target) {
        b.level = Math.min(b.target, b.level + dt * 0.6);
        this.showLevel(b);
      }
    }
  }
}
