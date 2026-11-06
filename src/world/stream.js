import * as THREE from 'three';
import { M, mat } from '../core/materials.js';
import { SEED, mulberry32 } from '../core/random.js';
import { FALLS, FALLS_FACING, STREAM_INLET, STREAM_BANK, POND_R, POND_Z, streamCourse } from '../core/layout.js';
import { env } from '../core/state.js';
import { Feature } from './feature.js';
import { makeStreamMaterial, ribbonGeometry } from './streamWater.js';

// ---- The brook: a rockery with a waterfall, and a stream down to the pond ----
// Water that moves is built from three parts here:
//  - the falls and the stream are *ribbons*: strips of triangles swept along a path,
//    a row of vertices at each step (streamWater.js). The stream's path is a spline
//    through the points in layout.js; the falls' path runs over the lip of the rockery
//    and straight down. Their material scrolls foam along the water (streamWater.js).
//  - the plunge pool at the foot of the falls is a disc of the same water, whose foam
//    spreads outwards from where the falls land.
//  - spray: a few foam blobs bobbing where the falls land, and mist (a Points cloud,
//    one square sprite per vertex) rising from them.
// The stream is shallow and lies on the flat ground, so it needs no hole cut for it.
// Low banks on either side, a wet-earth slope up from the water and grass down the far
// side, make it look sunk into the lawn. Anyone may wade across it; only the rockery
// is solid.
//
// The stones along the banks come from this feature's own seeded generator, not
// ctx.rand, so adding them didn't move anything else in the garden.

const ACROSS = [-1, -0.5, 0, 0.5, 1];  // the water's columns, bank to bank
const WATER_Y = 0.06;                  // the stream's surface, just above the lawn
const FLAT_SPEED = 0.9;                // how fast the stream runs where it's 1.4 wide
// Over the pond's edge: [distance past the rim, y, foam]. The lawn ends at the rim, so
// the water stays above it (y > 0) until it's over the hole, then drops under the pond.
const SPILL = [[0.4, 0.055, 0.5], [0.12, 0.035, 0.8], [-0.05, -0.04, 0.9], [-0.35, -0.25, 0.9]];
// The bank's cross-section, outwards from the water's edge: [offset, height].
const BANK = [[-0.2, -0.02], [0.05, 0.1], [0.4, 0.2], [0.75, 0.12], [STREAM_BANK, -0.03]];
const EARTH = new THREE.Color(0x6f6c4a).toArray(), GRASS = new THREE.Color(0x8fb05a).toArray();

// A white dot fading out to its edge: a radial gradient on a small canvas.
function puffTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 32;
  const g = c.getContext('2d'), grad = g.createRadialGradient(16, 16, 0, 16, 16, 16);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 32, 32);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export class Stream extends Feature {
  // It flows into `pond`, making `ripples` where it joins.
  constructor(ctx, { pond, ripples }) {
    super(ctx);
    this.pond = pond;
    this.ripples = ripples;
    this.solids = [];      // its colliders (the fingerprint leaves them out: see debug.js)
    this.stones = [];      // low stones butterflies land on: { mesh, kind }
    this.rand = mulberry32(SEED * 4099 + 3);
    const { material, uniforms } = makeStreamMaterial();
    this.water = material;
    this.uniforms = uniforms;

    this.course = streamCourse(0.4); // the centre line, from the plunge pool to the rim
    const c0 = this.course[0];
    this.pool = { x: c0.x, z: c0.z, r: c0.w / 2 };

    // The rockery has a frame of its own, turned so that local +Z faces out of the falls
    // (toward the plunge pool): then "in front of the falls" is just a bigger z.
    this.rockery = new THREE.Group();
    this.rockery.position.set(FALLS.x, 0, FALLS.z);
    this.rockery.rotation.y = FALLS_FACING;
    this.group.add(this.rockery);
    this.rockery.updateMatrixWorld();

    this.buildRockery();
    this.buildFalls();
    this.buildPool();
    this.buildStream();
    this.buildBanks();
    this.buildStones();
    this.buildSpray();
    this.rippleT = 0;
  }

  // ---- The rockery ----
  // Hand-placed boulders (each a squashed, turned 12-faced solid), stacked round a flat
  // lip stone the water pours over. Wet, dark rock behind the curtain of water.
  buildRockery() {
    const H = FALLS.height;
    const rock = (r, m, x, y, z, s, rot) => {
      const mesh = this.mesh(new THREE.DodecahedronGeometry(r, 0), m, x, y, z, { cast: true, receive: true, parent: this.rockery });
      mesh.scale.set(...s);
      mesh.rotation.set(...rot);
      return mesh;
    };
    rock(2.2, M.stoneD, 0, 1.3, -0.8, [1.25, 1.15, 0.95], [0.3, 0.5, 0.1]);             // the bulk
    rock(1.4, M.stone, -1.3, 2.9, -0.9, [1, 0.9, 1], [0.7, 0.2, 0.4]);      // high point, back left
    this.flanks = [
      rock(1.5, M.stone, -1.75, 1.0, 0.7, [1, 1.25, 0.95], [0.2, 1.1, 0.3]),            // left of the falls
      rock(0.9, M.stoneD, -1.1, 2.7, 0.9, [1, 0.9, 1], [1.2, 0.4, 0.6]),
      rock(1.4, M.stoneD, 1.7, 0.9, 0.6, [1.05, 1.1, 1], [0.5, 2.1, 0.2]),              // right of the falls
      rock(0.8, M.stone, 1.15, 2.6, 0.95, [1, 0.95, 1], [0.9, 0.3, 1.4]),
    ];
    rock(1.1, M.stoneD, 0, 1.5, 0.85, [0.85, 1.45, 0.55], [0.1, 0.2, 0.05]);           // behind the curtain
    rock(0.85, M.stone, 0, H - 0.32, 0.65, [1.15, 0.35, 1.05], [0.05, 0.3, 0.02]);      // the lip
    // Shrubs clinging to the top: two clumps of low-poly blobs.
    const shrubs = [[-1.4, 4.0, -0.7, 0.75, M.pine], [-0.8, 3.9, -1.3, 0.55, M.pineD], [1.3, 3.35, -0.3, 0.6, M.pineD]];
    for (const [i, [x, y, z, r, m]] of shrubs.entries()) {
      const mesh = this.mesh(new THREE.IcosahedronGeometry(r, 0), m, x, y, z, { cast: true, parent: this.rockery });
      if (i === 0) this.shrub = mesh; // the biggest, where birds perch
    }
    this.solids.push(this.ctx.physics.addCircleSolid(FALLS.x, FALLS.z, 3.1, 4.3));
  }

  // ---- The falls ----
  // A ribbon in the rockery's frame: out of the rock behind the lip, over the lip, then
  // straight down into the pool. [distance out from the rockery's centre, height,
  // width, speed, foam] for each row; the speed sets how fast its foam runs.
  buildFalls() {
    const H = FALLS.height;
    const path = [
      [0.3, H + 0.06, 0.8, 1.0, 0.1], [0.9, H + 0.04, 1.0, 1.2, 0.15], [1.45, H + 0.01, 1.1, 1.6, 0.3], // over the lip
      [1.7, H - 0.25, 1.15, 2.5, 0.45], [1.85, H - 0.8, 1.2, 3.5, 0.55],                                // curling over
      [1.95, H - 1.8, 1.25, 4, 0.6], [2.0, 0.9, 1.3, 4, 0.7], [2.05, 0.2, 1.35, 4, 1], [2.1, -0.05, 1.4, 4, 1],
    ];
    let flow = 0;
    const rows = path.map(([d, y, w, speed, foam], i) => {
      if (i > 0) flow += Math.hypot(d - path[i - 1][0], y - path[i - 1][1]) / speed;
      return { x: 0, z: d, heading: 0, cols: ACROSS.map((a) => [a * w / 2, y, { flow, across: a, foam }]) };
    });
    this.mesh(ribbonGeometry(rows, { aFlow: 'flow', aAcross: 'across', aFoam: 'foam' }), this.water, 0, 0, 0, { parent: this.rockery });
    // Where the falls land, in world coordinates: the spray and the pool's foam centre on it.
    this.impact = this.rockery.localToWorld(new THREE.Vector3(0, WATER_Y, 2.05));
  }

  // ---- The plunge pool ----
  // A ring geometry with (almost) no hole is a disc made of rings of triangles, so there
  // are vertices in between the centre and the edge for the foam to fade across. Its
  // edge is nudged in and out by a fixed wobble, so it isn't a perfect circle.
  buildPool() {
    const { x, z, r } = this.pool;
    const geo = new THREE.RingGeometry(0.01, r, 12, 3).rotateX(-Math.PI / 2);
    const pos = geo.attributes.position;
    const flow = [], across = [], foam = [];
    for (let i = 0; i < pos.count; i++) {
      const px = pos.getX(i), pz = pos.getZ(i), a = Math.atan2(pz, px);
      const k = 1 + 0.08 * Math.sin(3 * a) + 0.05 * Math.sin(5 * a + 1);
      pos.setXYZ(i, px * k, 0, pz * k);
      // Flow and foam spread outwards from where the falls land.
      const d = Math.hypot(x + px * k - this.impact.x, z + pz * k - this.impact.z);
      flow.push(d / 0.8);
      across.push(Math.hypot(px, pz) / r); // 0 in the middle → 1 at the edge: the shallows
      foam.push(Math.max(0, 1 - d / 1.3));
    }
    geo.setAttribute('aFlow', new THREE.Float32BufferAttribute(flow, 1));
    geo.setAttribute('aAcross', new THREE.Float32BufferAttribute(across, 1));
    geo.setAttribute('aFoam', new THREE.Float32BufferAttribute(foam, 1));
    this.mesh(geo, this.water, x, WATER_Y, z);
  }

  // ---- The stream ----
  // A ribbon along the course. It starts inside the pool (a little lower, so the pool
  // hides the join), and ends by spilling over the edge of the pond into it.
  buildStream() {
    const rows = [];
    let flow = 0, prev = null;
    const out = this.course.filter((s) => Math.hypot(s.x - this.pool.x, s.z - this.pool.z) > this.pool.r - 0.5);
    for (const s of out) {
      // Narrower water runs faster: the same water has to get through less room.
      const speed = FLAT_SPEED * 1.4 / s.w;
      if (prev) flow += Math.hypot(s.x - prev.x, s.z - prev.z) / speed;
      prev = s;
      const fromPool = Math.hypot(s.x - this.pool.x, s.z - this.pool.z) - this.pool.r;
      const foam = 0.3 * Math.max(0, 1 - fromPool / 2); // still churned just out of the pool
      const y = fromPool < 0.3 ? WATER_Y - 0.04 : WATER_Y;
      rows.push({ x: s.x, z: s.z, heading: s.heading, cols: ACROSS.map((a) => [a * s.w / 2, y, { flow, across: a, foam }]) });
    }
    // Over the rim: a few more rows, heading straight for the pond's centre and dropping
    // below its surface.
    const ix = Math.cos(STREAM_INLET), iz = Math.sin(STREAM_INLET), w = prev.w;
    const heading = Math.atan2(-ix, -iz);
    for (const [past, y, foam] of SPILL) {
      const x = ix * (POND_R + past), z = POND_Z + iz * (POND_R + past);
      flow += Math.hypot(x - prev.x, z - prev.z) / 2;
      prev = { x, z };
      rows.push({ x, z, heading, cols: ACROSS.map((a) => [a * w / 2, y, { flow, across: a, foam }]) });
    }
    this.mesh(ribbonGeometry(rows, { aFlow: 'flow', aAcross: 'across', aFoam: 'foam' }), this.water);
  }

  // ---- The banks ----
  // One ribbon down each side, with the BANK cross-section. Its height wanders along
  // the stream (a sum of sines of the distance), and it tapers to nothing at both ends
  // so you can't see under it. Vertex colours paint the inner slope wet earth and the
  // rest grass.
  buildBanks() {
    const bankMat = mat(0xffffff, { vertexColors: true });
    const keep = this.course.filter((s) => Math.hypot(s.x - this.pool.x, s.z - this.pool.z) > this.pool.r + 0.2
      && Math.hypot(s.x, s.z - POND_Z) > POND_R + 0.7);
    const len = keep.length;
    for (const side of [-1, 1]) {
      const rows = keep.map((s, i) => {
        const along = i * 0.4;
        const taper = Math.min(1, i / 3, (len - 1 - i) / 3);
        const lift = taper * (1 + 0.35 * Math.sin(along * 1.3 + side) + 0.2 * Math.sin(along * 3.1 + 2 * side));
        const cols = BANK.map(([off, h], j) => [side * (s.w / 2 + off), h > 0 ? h * lift : h, { color: j < 2 ? EARTH : GRASS }]);
        return { x: s.x, z: s.z, heading: s.heading, cols: side < 0 ? cols.reverse() : cols };
      });
      this.mesh(ribbonGeometry(rows, { color: 'color' }), bankMat, 0, 0, 0, { receive: true });
    }
  }

  // ---- Stones ----
  // A ring round the plunge pool (open where the falls come in and the stream goes out),
  // pebbles along the banks, two stepping stones to cross by, and two boulders hiding
  // the cut ends of the pond's stone rim.
  buildStones() {
    const rand = this.rand;
    const stone = (r, x, y, z, flat = 1, m = rand() < 0.5 ? M.stone : M.stoneD) => {
      const mesh = this.mesh(new THREE.DodecahedronGeometry(r, 0), m, x, y, z, { cast: true, receive: true });
      mesh.scale.y = flat;
      mesh.rotation.set(rand() * 3, rand() * 3, rand() * 3);
      return mesh;
    };
    const { x: px, z: pz, r: pr } = this.pool;
    const out = Math.atan2(this.course[6].z - pz, this.course[6].x - px);   // where the stream leaves
    const back = Math.atan2(this.impact.z - pz, this.impact.x - px);        // where the falls come in
    const gap = (a, b) => Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b)));
    for (let k = 0; k < 13; k++) {
      const a = (k / 13) * Math.PI * 2 + rand() * 0.2;
      if (gap(a, out) < 0.55 || gap(a, back) < 1.1) continue;
      const r = 0.3 + rand() * 0.25;
      this.stones.push({ mesh: stone(r, px + Math.cos(a) * (pr + 0.2), r * 0.35, pz + Math.sin(a) * (pr + 0.2), 0.7), kind: 'stone' });
    }

    // Pebbles: now and then, one on a bank just above the water.
    const cross = Math.round(this.course.length * 0.55); // where the stepping stones go
    this.course.forEach((s, i) => {
      if (i < 6 || i > this.course.length - 4 || Math.abs(i - cross) < 3 || rand() > 0.3) return;
      const side = rand() < 0.5 ? -1 : 1, off = side * (s.w / 2 + 0.05 + rand() * 0.35), r = 0.12 + rand() * 0.2;
      stone(r, s.x + Math.cos(s.heading) * off, 0.05 + r * 0.25, s.z - Math.sin(s.heading) * off, 0.6);
    });

    // Stepping stones across: flat-topped, just clear of the water.
    const s = this.course[cross];
    this.crossing = []; // { x, z, r }: dry footing in the water (see contains)
    for (const off of [-0.36, 0.36]) {
      const x = s.x + Math.cos(s.heading) * off, z = s.z - Math.sin(s.heading) * off;
      const mesh = this.mesh(new THREE.CylinderGeometry(0.3, 0.36, 0.18, 7), M.stone, x, 0.07, z, { cast: true, receive: true });
      mesh.rotation.y = rand() * Math.PI;
      this.stones.push({ mesh, kind: 'stone' });
      this.crossing.push({ x, z, r: 0.33 });
    }

    // The pond's rim has a gap for the stream (see Pond); a boulder caps each cut end.
    const half = this.pond.inletGap;
    for (const side of [-1, 1]) {
      const a = STREAM_INLET + side * (half + 0.03);
      stone(0.6, Math.cos(a) * (POND_R + 0.25), 0.2, POND_Z + Math.sin(a) * (POND_R + 0.25), 0.8, M.stoneD);
    }
  }

  // ---- Spray ----
  buildSpray() {
    const foamMat = mat(0xeef4f2, { roughness: 0.6 });
    this.foam = [];
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2, d = 0.25 + (i % 2) * 0.3;
      const mesh = this.mesh(new THREE.IcosahedronGeometry(0.18 + (i % 3) * 0.06, 0), foamMat,
        this.impact.x + Math.cos(a) * d, WATER_Y, this.impact.z + Math.sin(a) * d);
      this.foam.push({ mesh, phase: i * 1.7 });
    }
    // Mist: each vertex of a Points object is drawn as a little square that always faces
    // the camera. Only the positions change, so one geometry serves for all of them.
    const N = 28;
    this.mist = Array.from({ length: N }, () => this.newDroplet(Math.random() * 1.6));
    this.mistGeo = new THREE.BufferGeometry();
    this.mistGeo.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(N * 3), 3));
    // Points are drawn as squares; a soft round texture (drawn on a canvas, like the
    // shoji paper in materials.js) turns each into a puff.
    this.mistMat = new THREE.PointsMaterial({
      color: 0xffffff, size: 0.5, map: puffTexture(), transparent: true, opacity: 0.35, depthWrite: false,
    });
    const points = new THREE.Points(this.mistGeo, this.mistMat);
    points.frustumCulled = false; // its bounds would need recomputing as the mist moves
    this.group.add(points);
  }

  newDroplet(y = 0) {
    const a = Math.random() * Math.PI * 2, d = Math.random() * 0.7;
    return {
      x: this.impact.x + Math.cos(a) * d, y: WATER_Y + y, z: this.impact.z + Math.sin(a) * d,
      vx: (Math.random() - 0.5) * 0.3, vz: (Math.random() - 0.5) * 0.3, vy: 0.3 + Math.random() * 0.4,
    };
  }

  // ---- What others ask of it ----
  // Is (x, z) in the water (the pool or the stream)? For splashing footsteps. The
  // stepping stones are dry.
  contains(x, z) {
    if (this.crossing.some((c) => Math.hypot(x - c.x, z - c.z) < c.r)) return false;
    if (Math.hypot(x - this.pool.x, z - this.pool.z) < this.pool.r) return true;
    return this.course.some((s) => Math.hypot(x - s.x, z - s.z) < s.w / 2);
  }

  // Ground the grass should leave bare: the water, the inner banks, the rockery.
  footprints() {
    const spots = this.course.filter((_, i) => i % 2 === 0).map((s) => ({ x: s.x, z: s.z, r: s.w / 2 + 0.45 }));
    spots.push({ x: this.pool.x, z: this.pool.z, r: this.pool.r + 0.5 }, { x: FALLS.x, z: FALLS.z, r: 3.4 });
    return spots;
  }

  // Butterflies land on the stones round the pool, the stepping stones and the rockery's
  // lower boulders (see Feature.landingOn).
  landings() {
    return [
      ...this.stones.map(({ mesh, kind }) => this.landingOn(mesh, 0, 0, kind, 0.6)),
      ...this.flanks.map((mesh) => this.landingOn(mesh, 0, 0, 'rock')),
    ].filter(Boolean);
  }

  // Birds perch on top of the big shrub crowning the rockery.
  perches() {
    const { position, geometry } = this.shrub;
    const top = position.y + geometry.parameters.radius * 0.8;
    return [{ parent: this.rockery, local: new THREE.Vector3(position.x, top, position.z), kind: 'rock' }];
  }

  // The foam blobs bob and swell; everything else (rockery, banks, stones) stays put.
  mergeStatic() {
    super.mergeStatic({ skip: this.foam.map((f) => f.mesh) });
  }

  update(dt, t) {
    this.uniforms.uTime.value = t;
    this.uniforms.uDay.value = 1 - 0.75 * env.nightMix;
    // Foam blobs churn: each swells and sinks on its own beat.
    for (const { mesh, phase } of this.foam) {
      const s = 0.8 + 0.35 * Math.sin(t * 7 + phase);
      mesh.scale.setScalar(s);
      mesh.position.y = WATER_Y + 0.03 * Math.sin(t * 5 + phase);
    }
    // Mist rises, drifts and is reborn at the bottom once it has risen far enough.
    const arr = this.mistGeo.attributes.position.array;
    this.mist.forEach((m, i) => {
      m.x += m.vx * dt; m.y += m.vy * dt; m.z += m.vz * dt;
      if (m.y > WATER_Y + 1.6) Object.assign(m, this.newDroplet());
      arr[i * 3] = m.x; arr[i * 3 + 1] = m.y; arr[i * 3 + 2] = m.z;
    });
    this.mistGeo.attributes.position.needsUpdate = true;
    this.mistMat.opacity = 0.35 * (1 - 0.6 * env.nightMix); // unlit, so it would glow at night
    // Where the stream spills in, the pond ripples now and then (pond-local coordinates).
    this.rippleT -= dt;
    if (this.rippleT <= 0) {
      this.rippleT = 0.5 + Math.random() * 0.5;
      const r = POND_R - 0.6 - Math.random() * 0.4, a = STREAM_INLET + (Math.random() - 0.5) * 0.08;
      this.ripples.spawn(Math.cos(a) * r, Math.sin(a) * r, 0.6 + Math.random() * 0.4, 1.4);
    }
  }
}
