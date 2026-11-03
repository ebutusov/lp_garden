import * as THREE from 'three';
import {
  POND_Z, POND_R, FENCE_R, TEA_PATH, SHISHI, BRIDGE_WIDTH, BRIDGE_SPAN, WIND_DIR, windStrength,
} from '../core/layout.js';
import { SEED, mulberry32 } from '../core/random.js';
import { cameraGroup } from '../core/camera.js';
import { player } from '../core/state.js';
import { PLAYER_HEIGHT } from '../core/physics.js';
import { Feature } from './feature.js';

// ---- Grass: tens of thousands of blades swaying in the wind ----
// Two techniques make this cheap enough to run every frame:
//
// 1. INSTANCING. Every tuft is the same few triangles, so the geometry is uploaded to
//    the GPU once, along with a list of per-tuft transforms (an InstancedMesh's
//    instanceMatrix: position, turn and size) and colours. One draw call then stamps
//    out thousands of copies. A separate Mesh per tuft would be thousands of draw
//    calls, and the CPU would spend the whole frame just issuing them.
//
// 2. ANIMATING IN THE VERTEX SHADER. The tufts never move on the CPU. Instead the
//    vertex shader, which already runs for every vertex every frame, bends each blade
//    as a function of time and the tuft's position. Moving 300k vertices in JavaScript
//    and re-uploading them each frame would be far too slow; on the GPU it's free.
//    The wind is the same breeze the trees, petals and clouds follow (windStrength and
//    WIND_DIR in layout.js): a steady lean, plus gusts that roll across the lawn as
//    waves, plus a fast flutter. The player, the dog, the cats and the Gardener also push blades aside.
//
// Like the pond water (water.js), the material is a MeshStandardMaterial with a few
// lines of GLSL spliced in (onBeforeCompile), so sun, shadows, fog and night all
// keep working for free.
//
// The lawn is split into square tiles, one InstancedMesh each. Three skips any mesh
// whose bounding sphere is outside the camera's view ("frustum culling"), so the tiles
// behind you cost nothing. One mesh for the whole lawn would always be drawn in full.

const TILE = 20;          // tile size, in world units
const OUTER_R = 78;       // the lawn fades out under the fog beyond the fence
const MAX_PUSHERS = 6;    // player, dog, three cats and the Gardener

// The blade shape: a tapered, slightly curved strip, 3 segments high, in the XY plane.
// Unit height; each tuft's instance matrix scales it. `uv.y` (0 at the root, 1 at the
// tip) tells the shaders how far up the blade a vertex is.
function makeBlade(x, z, yaw, lean) {
  const rows = [[0, 1], [0.4, 0.75], [0.75, 0.42]]; // [height, width factor]
  const W = 0.07, c = Math.cos(yaw), s = Math.sin(yaw);
  const pos = [], uv = [];
  const put = (px, h) => {
    const pz = lean * h * h; // the blade curves forward toward its tip
    pos.push(x + px * c + pz * s, h, z - px * s + pz * c);
    uv.push(px > 0 ? 1 : 0, h);
  };
  for (const [h, w] of rows) { put(-W * w, h); put(W * w, h); }
  put(0, 1); // the tip
  const index = [0, 1, 2, 2, 1, 3, 2, 3, 4, 4, 3, 5, 4, 5, 6];
  return { pos, uv, index };
}

// A tuft: a few blades around a common root, each turned and leaning its own way.
// Fixed numbers rather than random ones, so it's the same tuft every visit.
function makeTuftGeometry() {
  const blades = [
    makeBlade(0, 0, 0.0, 0.10),
    makeBlade(0.05, 0.03, 1.1, 0.22),
    makeBlade(-0.05, 0.02, 2.3, 0.18),
    makeBlade(0.01, -0.06, 3.6, 0.25),
    makeBlade(-0.03, -0.03, 5.0, 0.15),
  ];
  const pos = [], uv = [], index = [];
  for (const b of blades) {
    const base = pos.length / 3;
    pos.push(...b.pos);
    uv.push(...b.uv);
    index.push(...b.index.map((i) => i + base));
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  // Every normal points straight up, as if each blade were a piece of the ground. Real
  // blade normals would point sideways, so thin blades seen edge-on or from behind
  // would flicker dark. With "up" normals the lawn is lit like the ground beneath it,
  // and the shading comes from the root-to-tip colour ramp in the fragment shader.
  const normals = new Float32Array(pos.length);
  for (let i = 1; i < normals.length; i += 3) normals[i] = 1;
  geo.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
  geo.setIndex(index);
  return geo;
}

const VERTEX_GLSL = /* glsl */`
  uniform float uTime;
  uniform float uWind;
  uniform vec2 uWindDir;
  uniform vec4 uPushers[${MAX_PUSHERS}]; // (x, z, radius, strength) of whatever walks through
  varying float vBladeH;
`;

// Replaces three's <project_vertex> chunk. Ours applies the instance matrix itself, so
// the bend can be added in WORLD space: the instance matrix also turns each tuft, so an
// offset added before it (in the tuft's own space) would push every tuft a different way.
const PROJECT_GLSL = /* glsl */`
  vBladeH = uv.y;
  vec4 mvPosition = vec4(transformed, 1.0);
  #ifdef USE_INSTANCING
    mvPosition = instanceMatrix * mvPosition;
    vec2 root = instanceMatrix[3].xz;           // the tuft's position: column 3 of its matrix
    float height = mvPosition.y - instanceMatrix[3].y;
  #else
    vec2 root = mvPosition.xz;
    float height = mvPosition.y;
  #endif
  // Bend more toward the tip: a blade is anchored at the root. h² gives a curve, not a
  // stiff stick tilting about its root.
  float bendW = uv.y * uv.y;

  // Gusts: a band of stronger wind sweeping along the wind direction. A sine of
  // (position along the wind − time) is a wave travelling downwind, so you can watch
  // gusts ripple across the lawn. A second, slower wave across the wind breaks the bands up.
  float along = dot(root, uWindDir);
  float across = dot(root, vec2(-uWindDir.y, uWindDir.x));
  float gust = 0.5 + 0.5 * sin(along * 0.25 - uTime * 1.6 + sin(across * 0.15 + uTime * 0.3) * 1.5);
  float lean = uWind * (0.25 + 0.75 * gust * gust);
  // Flutter: quick, small, out of step from tuft to tuft (the phase comes from the root).
  float flutter = sin(uTime * 5.0 + root.x * 1.7 + root.y * 2.3) * (0.06 + 0.1 * uWind);
  vec2 bend = uWindDir * (lean * 0.55 + flutter);

  // Pushers: blades within a radius are pressed outward, hardest at the centre.
  for (int i = 0; i < ${MAX_PUSHERS}; i++) {
    vec4 p = uPushers[i];
    vec2 away = root - p.xy;
    float d = length(away);
    float push = p.w * (1.0 - smoothstep(0.0, p.z, d));
    bend += away / max(d, 0.001) * push;
  }

  // Sideways offset, scaled by the blade's height so tall blades travel further. The
  // tip also drops a little, so a bent blade gets shorter instead of stretching.
  float amount = min(length(bend), 1.3);
  bend *= amount / max(length(bend), 0.0001);
  mvPosition.xz += bend * height * bendW;
  mvPosition.y -= 0.5 * amount * amount * height * bendW;

  mvPosition = modelViewMatrix * mvPosition;
  gl_Position = projectionMatrix * mvPosition;
`;

function makeGrassMaterial() {
  const material = new THREE.MeshStandardMaterial({
    color: 0xffffff, roughness: 0.95, side: THREE.DoubleSide,
  });
  const uniforms = {
    uTime: { value: 0 },
    uWind: { value: 0 },
    uWindDir: { value: WIND_DIR.clone() },
    uPushers: { value: Array.from({ length: MAX_PUSHERS }, () => new THREE.Vector4()) },
  };
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\n' + VERTEX_GLSL)
      .replace('#include <project_vertex>', PROJECT_GLSL);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying float vBladeH;')
      // Dark at the root (it's shaded by the other blades), bright and yellower at the
      // tip. This ramp is what makes the lawn read as blades rather than a green smear.
      .replace('#include <color_fragment>', /* glsl */`
        #include <color_fragment>
        diffuseColor.rgb *= mix(0.45, 1.05, vBladeH);
        diffuseColor.rgb += vec3(0.05, 0.05, 0.0) * vBladeH * vBladeH;
      `)
      // DoubleSide normally flips the normal on back faces, which would turn the back of
      // every blade dark. Our "up" normals are right from both sides, so undo the flip.
      .replace('#include <normal_fragment_begin>', /* glsl */`
        #include <normal_fragment_begin>
        normal = normalize(vNormal);
      `);
  };
  return { material, uniforms };
}

// Height of a grass mound's surface at (x, z), or 0 off it. The mounds (ground.js) are
// 6-sided cones, so their surface is six flat faces, lower between the corners than
// a round cone's would be. physics.js approximates them as round (fine for walking),
// but tufts need the exact faces or they'd float above them.
function moundHeight(mounds, x, z) {
  let h = 0;
  for (const m of mounds) {
    const dx = x - m.x, dz = z - m.z;
    const d = Math.hypot(dx, dz);
    if (d >= m.r / 2) continue;
    // ConeGeometry puts its corners at angles k·60°, measured from +z toward +x.
    const a = Math.atan2(dx, dz);
    const sector = ((a % (Math.PI / 3)) + Math.PI / 3) % (Math.PI / 3) - Math.PI / 6;
    const edge = m.r * Math.cos(Math.PI / 6) / Math.cos(sector); // distance to the cone's rim this way
    h = Math.max(h, 0.3 * m.r - 0.6 * m.r * d / edge);
  }
  return h;
}

// A cheap smooth "noise" from a few sines: where the lawn is lush and where it's thin.
const lushness = (x, z) => 0.5 + 0.25 * Math.sin(x * 0.19 + Math.sin(z * 0.13) * 2)
  + 0.25 * Math.sin(z * 0.23 + Math.sin(x * 0.11) * 2);

export class Grass extends Feature {
  // `stones`: footprints { x, z, r } to keep clear (the stepping stones).
  // `density` scales the tuft count (touch devices get fewer).
  // Build it after every fixed feature: it keeps clear of their colliders and
  // platforms, and stands on the mounds.
  constructor(ctx, { stones = [], density = 1 }) {
    super(ctx);
    const { physics } = ctx;
    // Its own seeded generator, not ctx.rand: the grass draws tens of thousands of
    // numbers, and taking them from the shared sequence would move everything built
    // after it whenever the grass changed. Seeded, so the lawn is the same every visit.
    const rand = mulberry32(SEED * 7919 + 17);
    const { material, uniforms } = makeGrassMaterial();
    this.uniforms = uniforms;
    this.pushers = []; // animals (and the Gardener) with x, z; set by garden.js once they exist

    const solids = physics.solids.slice(); // the animals add theirs later; ignore those
    const blocked = (x, z) => {
      const r = Math.hypot(x, z);
      if (Math.abs(r - FENCE_R) < 0.5) return true;
      if (Math.hypot(x, z - POND_Z) < POND_R + 1) return true; // pond and its stone rim
      if (Math.abs(x) < BRIDGE_WIDTH / 2 + 0.4 && Math.abs(z - POND_Z) < BRIDGE_SPAN / 2 + 0.6) return true;
      if (Math.hypot(x - SHISHI.x, z - SHISHI.z) < 1.4) return true;
      for (const [sx, sz] of TEA_PATH) if (Math.hypot(x - sx, z - sz) < 0.9) return true;
      for (const st of stones) if (Math.hypot(x - st.x, z - st.z) < st.r + 0.1) return true;
      // Platforms: the tea house floor and step, the gravel garden and its border.
      for (const pl of physics.platforms) {
        if (x > pl.minX - 0.3 && x < pl.maxX + 0.3 && z > pl.minZ - 0.3 && z < pl.maxZ + 0.3) return true;
      }
      for (const s of solids) {
        if (s.r !== undefined) {
          if (Math.hypot(x - s.x, z - s.z) < s.r * 0.8) return true;
        } else if (x > s.minX && x < s.maxX && z > s.minZ && z < s.maxZ) return true;
      }
      return false;
    };

    // Scatter tufts: random points in the disc, kept with a probability given by the
    // lushness, thinning out past the fence. ("Rejection sampling": draw uniformly,
    // throw some away, and what's left follows the density you wanted.)
    const tiles = new Map();
    const attempts = Math.round(26000 * density);
    for (let i = 0; i < attempts; i++) {
      // sqrt keeps the points evenly spread over the disc's area, not bunched at the centre.
      const a = rand() * Math.PI * 2, d = Math.sqrt(rand()) * OUTER_R;
      const x = Math.cos(a) * d, z = Math.sin(a) * d;
      const lush = lushness(x, z);
      const outside = THREE.MathUtils.smoothstep(d, FENCE_R, OUTER_R); // 0 inside the fence → 1 at the edge
      const keep = (0.35 + 0.65 * lush) * (1 - 0.75 * outside);
      const yaw = rand() * Math.PI * 2, size = rand(), tint = rand();
      if (rand() > keep || blocked(x, z)) continue;
      const height = (0.35 + 0.45 * lush + 0.25 * size) * (1 - 0.4 * outside);
      const key = `${Math.floor(x / TILE)},${Math.floor(z / TILE)}`;
      if (!tiles.has(key)) tiles.set(key, []);
      tiles.get(key).push({ x, z, y: moundHeight(physics.mounds, x, z) - 0.02, yaw, height, width: 0.8 + size * 0.5, tint });
    }

    // One InstancedMesh per tile.
    const geo = makeTuftGeometry();
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), p = new THREE.Vector3(), s = new THREE.Vector3();
    const up = new THREE.Vector3(0, 1, 0), color = new THREE.Color();
    const base = new THREE.Color(0x8fb05a), dry = new THREE.Color(0xb3b062), deep = new THREE.Color(0x5f9a4a);
    this.count = 0;
    for (const tufts of tiles.values()) {
      const mesh = new THREE.InstancedMesh(geo, material, tufts.length);
      mesh.receiveShadow = true; // tree shadows fall across the lawn (casting would cost a lot)
      tufts.forEach((t, i) => {
        q.setFromAxisAngle(up, t.yaw);
        m.compose(p.set(t.x, t.y, t.z), q, s.set(t.width, t.height, t.width));
        mesh.setMatrixAt(i, m);
        // Per-tuft colour: mostly the lawn green, some drier, some deeper.
        color.copy(base).lerp(t.tint < 0.5 ? deep : dry, Math.abs(t.tint - 0.5) * 1.2);
        mesh.setColorAt(i, color);
      });
      // Culling uses the bounding sphere of all the instances. The wind moves blades
      // beyond their resting shape, so pad it, or a tile at the screen edge could pop out.
      mesh.computeBoundingSphere();
      mesh.boundingSphere.radius += 1.5;
      this.group.add(mesh);
      this.count += tufts.length;
    }
  }

  update(dt, t) {
    const u = this.uniforms;
    u.uTime.value = t;
    u.uWind.value = windStrength(t);

    // The player (only when their feet are near the ground) and the animals.
    const pushers = u.uPushers.value;
    const pos = cameraGroup.position;
    const feet = pos.y - PLAYER_HEIGHT;
    const nearGround = feet - this.ctx.physics.surfaceHeightAt(pos.x, pos.z) < 0.6;
    pushers[0].set(pos.x, pos.z, 1.1, nearGround && !player.flyMode ? 0.9 : 0);
    for (let i = 1; i < MAX_PUSHERS; i++) {
      const a = this.pushers[i - 1];
      if (a) pushers[i].set(a.x, a.z, (a.solid?.r ?? 0.3) + 0.45, 0.8);
      else pushers[i].w = 0;
    }
  }
}
