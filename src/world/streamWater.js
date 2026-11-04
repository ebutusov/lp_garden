import * as THREE from 'three';

// ---- Running water: foam that travels with the current ----
// The pond's water (water.js) only bobs in place. A stream has to *flow*, and the cheap
// way to show flow is to scroll a pattern along the water: no particles, no simulation,
// just a coordinate that the pattern is drawn in, shifted a little further every frame.
//
// The catch is that water doesn't run at one speed: it dawdles along the stream and
// races down the falls. Scrolling a plain distance coordinate would move every fleck of
// foam at the same speed. So each vertex carries its *travel time* instead (aFlow, in
// seconds): how long the water takes to get there from the start, summed up as
// distance ÷ speed along the way (stream.js works it out). Drawing the pattern at
// (aFlow - time) moves each fleck forward one second of travel per second, which is
// slowly where the water is slow and fast where it's fast. Where the water speeds up,
// a second of travel covers more distance, so the flecks stretch into streaks, which is
// just what a waterfall looks like.
//
// Like the pond, this starts from MeshStandardMaterial and splices GLSL into it with
// onBeforeCompile, so the sun, lanterns and fog keep working. The vertex attributes are:
//  - aFlow:   travel time from the start of this stretch of water (seconds);
//  - aAcross: -1 on one bank, 0 mid-stream, +1 on the other bank;
//  - aFoam:   0 for calm water, up to 1 where it's churned white (the falls, the plunge).
// Each one is copied into a varying, so the fragment shader gets it interpolated
// across every triangle.
//
// The water is opaque, unlike the pond: it lies on the ground, so there's nothing much to
// see through it, and opaque surfaces need no back-to-front sorting. A lighter band
// along each bank stands in for the shallows.

const VERTEX_GLSL = /* glsl */`
  uniform float uTime;
  attribute float aFlow;
  attribute float aAcross;
  attribute float aFoam;
  varying float vFlow;
  varying float vAcross;
  varying float vFoam;
`;

const FRAGMENT_GLSL = /* glsl */`
  uniform float uTime;
  uniform float uDay;
  varying float vFlow;
  varying float vAcross;
  varying float vFoam;
  // Value noise: random values on a grid of whole numbers, blended smoothly in between.
  // hash() scrambles a grid point into a number in 0…1 that looks random.
  float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float vnoise(vec2 p) {
    vec2 i = floor(p), f = fract(p);
    f = f * f * (3.0 - 2.0 * f); // smoothstep, so the blend has no creases at grid lines
    return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x),
               mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y);
  }
`;

export function makeStreamMaterial() {
  const material = new THREE.MeshStandardMaterial({
    color: 0x3a8c97, roughness: 0.18, metalness: 0.1, flatShading: true,
  });
  // Set every frame by stream.update. uDay is 1 by day and fades to 0.25 at night.
  const uniforms = { uTime: { value: 0 }, uDay: { value: 1 } };

  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);

    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\n' + VERTEX_GLSL)
      .replace('#include <begin_vertex>', /* glsl */`
        #include <begin_vertex>
        vFlow = aFlow;
        vAcross = aAcross;
        vFoam = aFoam;
        // Ripples that run downstream: a wave in travel time, so they keep pace with the
        // water. Calm water only (not the falls), and none at the banks, where the water
        // meets the ground.
        float calm = (1.0 - aFoam) * (1.0 - aAcross * aAcross);
        transformed.y += calm * 0.025 * sin(aFlow * 5.0 - uTime * 4.0 + aAcross * 1.7);
      `);

    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\n' + FRAGMENT_GLSL)
      // After lighting (outgoingLight is the lit colour), before fog.
      .replace('#include <opaque_fragment>', /* glsl */`
        float edge = abs(vAcross);
        // Shallows: paler and greener towards the banks.
        outgoingLight = mix(outgoingLight, outgoingLight * 1.5 + vec3(0.02, 0.035, 0.02),
                            smoothstep(0.45, 1.0, edge) * (1.0 - vFoam));
        // Foam: two layers of noise, drawn at (travel time - time) so they drift downstream.
        // Rough water gets finer streaks across.
        vec2 q = vec2(vAcross * mix(2.2, 4.0, vFoam), (vFlow - uTime) * 1.8);
        float n = vnoise(q) * 0.65 + vnoise(q * 2.7 + 3.1) * 0.35;
        // Where the water is rougher, more of the noise counts as foam.
        float foamy = clamp(vFoam + 0.3 * edge * edge * edge, 0.0, 1.0);
        float fleck = smoothstep(0.0, 0.04, n - mix(0.74, 0.3, foamy));
        // Foam is the water's own light, brightened. Rough water's foam is also never
        // darker than a pale grey (white water in the shade is still white), and that
        // grey dims at night. Capped below 1, or the bloom pass would make it glow.
        vec3 foam = min(max(outgoingLight * 2.6, vec3(0.78) * uDay * foamy) + vec3(0.03), vec3(0.92));
        outgoingLight = mix(outgoingLight, foam, fleck * mix(0.55, 0.9, foamy));
        #include <opaque_fragment>
      `);
  };

  return { material, uniforms };
}

// ---- A ribbon of triangles along a path ----
// `rows` run along the path. Each row is { x, z, heading, cols }, where `cols` are the
// row's vertices from its left edge to its right: [offset, y, attrs], with offset
// measured sideways from (x, z). `attrs` holds the row's per-vertex extras, named in
// `extras` as { attributeName: key }: the water passes { aFlow: 'flow', ... }, the banks
// { color: 'color' } (an [r, g, b] array).
// Consecutive rows are joined by two triangles per pair of columns, so the ribbon can
// bend, widen and even drop over a ledge (y is per vertex).
//
// Sideways is the heading turned a quarter turn: heading h points along (sin h, cos h),
// so its right is (cos h, -sin h). Each triangle is wound so that its normal points up
// (or, on the falls, out towards whoever is looking at them).
export function ribbonGeometry(rows, extras = {}) {
  const pos = [], index = [];
  const data = Object.fromEntries(Object.keys(extras).map((name) => [name, []]));
  const cols = rows[0].cols.length;
  for (const row of rows) {
    const rx = Math.cos(row.heading), rz = -Math.sin(row.heading);
    for (const [off, y, attrs] of row.cols) {
      pos.push(row.x + rx * off, y, row.z + rz * off);
      for (const [name, key] of Object.entries(extras)) data[name].push(...[attrs[key]].flat());
    }
  }
  for (let i = 0; i < rows.length - 1; i++) {
    for (let j = 0; j < cols - 1; j++) {
      const a = i * cols + j, b = a + cols;
      index.push(a, b, a + 1, a + 1, b, b + 1);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  for (const [name, values] of Object.entries(data)) {
    geo.setAttribute(name, new THREE.Float32BufferAttribute(values, values.length / (pos.length / 3)));
  }
  geo.setIndex(index);
  geo.computeVertexNormals(); // flat shading ignores them, but raycasts and bounds don't
  return geo;
}
