import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { SEED, mulberry32 } from '../core/random.js';
import { Feature } from './feature.js';

// ---- Distant mountain ranges ----
// Two rings of lower mountains all round the horizon: foothills a little nearer than
// Fuji, and a taller range far behind it. Like Fuji they stand beyond the fog, so they
// fade into the sky by aerial perspective instead (applyHaze in dayNight.js), the far
// range more than the near one. Layers of ever paler silhouettes are how a painter
// shows depth, and it's also how distant hills really look on a hazy day.
//
// Each mountain is a cone with a few segments, roughed up by moving its vertices, like
// Fuji. Drawing a hundred separate meshes would cost a hundred draw calls, so each
// ring's cones are merged into ONE geometry (mergeGeometries), one mesh per ring. Its
// faces are coloured per triangle, by height: forested slopes low down, bare rock
// higher, and snow on the tallest far peaks.
//
// The shapes come from this feature's own seeded generator, so they're the same every
// visit without touching ctx.rand. Both rings dip low either side of Fuji, so the
// mountain still stands alone.

const RINGS = [
  // distance from the garden, heights, cone segments, colours low → high, snow above
  { name: 'near', d: 200, minH: 18, maxH: 42, segs: 7, low: 0x46604c, high: 0x6c8072, snow: Infinity, fuji: 0.25 },
  { name: 'far', d: 320, minH: 30, maxH: 62, segs: 8, low: 0x56647a, high: 0x7d8aa0, snow: 0.8, fuji: 0.5 },
];
const FUJI_WINDOW = 0.3; // half-width of the dip round Fuji's direction (radians)
const SNOW = new THREE.Color(0xeef3f8);

export class Mountains extends Feature {
  // `fuji`: the mountain the ranges make way for.
  constructor(ctx, { fuji }) {
    super(ctx);
    const rand = mulberry32(SEED * 7451 + 29);
    const f = fuji.position;
    const fujiAngle = Math.atan2(f.x, f.z);
    this.materials = {}; // { near, far }, hazed by dayNight.js
    this.count = 0;
    for (const ring of RINGS) {
      const phase1 = rand() * 6.28, phase2 = rand() * 6.28;
      const peaks = [];
      for (let a = 0; a < Math.PI * 2;) {
        // A slowly wandering "range height" (two sines), so the peaks rise into ranges
        // and fall away into passes, plus a little variety from peak to peak.
        const range = 0.5 + 0.5 * (0.6 * Math.sin(3 * a + phase1) + 0.4 * Math.sin(7 * a + phase2));
        let h = ring.minH + (ring.maxH - ring.minH) * range * (0.8 + rand() * 0.4);
        // The dip round Fuji: smoothly lower the closer to its direction.
        const off = Math.abs(Math.atan2(Math.sin(a - fujiAngle), Math.cos(a - fujiAngle)));
        h *= THREE.MathUtils.lerp(ring.fuji, 1, THREE.MathUtils.smoothstep(off, FUJI_WINDOW * 0.5, FUJI_WINDOW * 1.6));
        const radius = h * (1.4 + rand() * 0.6);
        const d = ring.d + (rand() - 0.5) * 30;
        peaks.push(this.peak(rand, h, radius, ring, Math.sin(a) * d, Math.cos(a) * d));
        a += (radius * (0.7 + rand() * 0.4)) / ring.d; // overlap the next peak a little
      }
      const material = new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.95, fog: false });
      this.materials[ring.name] = material;
      const geo = mergeGeometries(peaks);
      geo.computeVertexNormals();
      this.mesh(geo, material);
      this.count += peaks.length;
    }
  }

  // One mountain: a cone standing at (x, z), its foot sunk below the ground.
  peak(rand, h, radius, ring, x, z) {
    let geo = new THREE.ConeGeometry(radius, h, ring.segs, 3, true);
    const ph = rand() * 6.28, skewX = (rand() - 0.5) * 0.5, skewZ = (rand() - 0.5) * 0.5;
    const pos = geo.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const px = pos.getX(i), py = pos.getY(i), pz = pos.getZ(i);
      const up = py / h + 0.5;                 // 0 at the foot → 1 at the summit
      const a = Math.atan2(px, pz);
      // Ridges and gullies: a smooth function of the angle, so the cone's seam (the same
      // point at 0 and 2π) stays closed. The summit has radius 0, so scaling leaves it whole.
      const k = 1 + 0.18 * Math.sin(a * 3 + ph) + 0.1 * Math.sin(a * 5 + py * 0.2);
      const dy = up * (1 - up) * h * 0.15 * Math.sin(a * 4 + ph); // nothing at foot or summit
      // Skew leans the whole cone, summit included, so no peak is perfectly central.
      pos.setXYZ(i, px * k + up * radius * skewX, py + dy, pz * k + up * radius * skewZ);
    }
    geo.translate(x, h / 2 - 3, z);
    // One colour per triangle (see Fuji): each triangle needs its own vertices.
    geo = geo.toNonIndexed();
    geo.deleteAttribute('uv');
    geo.deleteAttribute('normal');
    const p = geo.attributes.position;
    const colors = new Float32Array(p.count * 3);
    const low = new THREE.Color(ring.low), high = new THREE.Color(ring.high), c = new THREE.Color();
    for (let i = 0; i < p.count; i += 3) {
      const cy = (p.getY(i) + p.getY(i + 1) + p.getY(i + 2)) / 3 + 3; // height above the foot
      if (h > 45 && cy > h * ring.snow) c.copy(SNOW);
      else c.lerpColors(low, high, THREE.MathUtils.clamp(cy / h, 0, 1));
      for (let j = 0; j < 3; j++) c.toArray(colors, (i + j) * 3);
    }
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    return geo;
  }
}
