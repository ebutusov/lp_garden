import * as THREE from 'three';
import { Feature } from './feature.js';

// ---- Mount Fuji in the distance ----
// Concave flanks sweeping up to a flat crater rim, with a ragged snowline. It stands
// far beyond the fog, which would wash it out entirely, so instead it's blended
// toward the horizon colour (aerial perspective, see applyHaze in dayNight.js) and
// its foot sits in a bank of mist. Clouds drift across the sky (clouds.js), and Fuji
// wears a cloud belt and its famous lens-shaped "hat" cloud.
export const FUJI_POS = new THREE.Vector3(-90, -2, -250);
// (radius, height) from the foot up to the crater rim, then into the crater.
const FUJI_PROFILE = [
  [125, 0], [100, 4], [78, 10], [58, 18], [42, 28], [30, 39], [21, 50],
  [14, 60], [10, 67], [8.5, 70], [6, 68.5], [0.1, 67.5],
];
export const FUJI_SUMMIT = 70;

// Soft horizontal smudge for mist banks.
function makeMistTexture() {
  const c = document.createElement('canvas');
  c.width = 128; c.height = 64;
  const g = c.getContext('2d');
  g.scale(2, 1); // stretch a round gradient into an ellipse
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, 'rgba(255,255,255,0.9)');
  grad.addColorStop(0.6, 'rgba(255,255,255,0.35)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}

class Fuji extends Feature {
  constructor() {
    super(FUJI_POS.x, FUJI_POS.z);
    this.group.position.y = FUJI_POS.y;
    // vertexColors: the colour comes from a per-vertex `color` attribute instead of one
    // colour for the whole mesh. fog: false, because the mountain is past the fog's far end.
    this.material = new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.9, fog: false });
    this.mesh(this.makeGeometry(), this.material);
    this.addMist();
  }

  makeGeometry() {
    // A lathe spins a 2D profile around the Y axis, like a potter's wheel: here 18 times,
    // giving an 18-sided mountain.
    let geo = new THREE.LatheGeometry(FUJI_PROFILE.map(([r, y]) => new THREE.Vector2(r, y)), 18);
    // Rough up the flanks with ridges and gullies by moving vertices directly. The jitter
    // is a smooth function of position, so the lathe's seam (same position at 0 and 2π)
    // stays closed.
    const pos = geo.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
      const a = Math.atan2(x, z);
      const k = 1 + 0.07 * Math.sin(a * 7 + y * 0.15) + 0.04 * Math.sin(a * 13 - y * 0.3);
      const dy = y > 5 && y < 66 ? Math.sin(a * 9 + y) * 1.2 : 0; // leave the foot and the rim clean
      pos.setXYZ(i, x * k, y + dy, z * k);
    }
    // An indexed geometry shares each vertex between the triangles that meet there, so a
    // vertex can only have one colour, and colours would blend across faces.
    // toNonIndexed() gives every triangle its own three vertices: one colour per face.
    geo = geo.toNonIndexed();
    const p = geo.attributes.position;
    const colors = new Float32Array(p.count * 3);
    const ROCK_LOW = new THREE.Color(0x4f5d73), ROCK_HIGH = new THREE.Color(0x76839c);
    const SNOW = new THREE.Color(0xf2f6fa), c = new THREE.Color();
    for (let i = 0; i < p.count; i += 3) {
      // Colour each triangle by its centre (the average of its three corners).
      const cx = (p.getX(i) + p.getX(i + 1) + p.getX(i + 2)) / 3;
      const cy = (p.getY(i) + p.getY(i + 1) + p.getY(i + 2)) / 3;
      const cz = (p.getZ(i) + p.getZ(i + 1) + p.getZ(i + 2)) / 3;
      const a = Math.atan2(cx, cz);
      // Ragged snowline: the gullies carry snow further down.
      const snowline = 46 + 6 * Math.sin(a * 5) + 4 * Math.sin(a * 17 + 1.3);
      if (cy > snowline) c.copy(SNOW);
      else c.lerpColors(ROCK_LOW, ROCK_HIGH, Math.min(1, cy / snowline));
      for (let j = 0; j < 3; j++) c.toArray(colors, (i + j) * 3);
    }
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    // Moving vertices invalidates the normals (the surface directions used for lighting),
    // so recompute them.
    geo.computeVertexNormals();
    return geo;
  }

  // Mist around Fuji's foot: two rows of soft banks on the side facing the garden.
  // A Sprite is a flat rectangle that always turns to face the camera ("billboard"),
  // ideal for fuzzy things with no real shape. depthWrite: false lets overlapping
  // transparent sprites blend instead of cutting holes in each other.
  addMist() {
    this.mistMaterial = new THREE.SpriteMaterial({
      map: makeMistTexture(), transparent: true, opacity: 0.7, depthWrite: false, fog: false,
    });
    // Two horizontal unit vectors: toward the garden, and across that direction.
    const toGarden = new THREE.Vector3(-FUJI_POS.x, 0, -FUJI_POS.z).normalize();
    const across = new THREE.Vector3(toGarden.z, 0, -toGarden.x);
    for (const row of [{ d: 95, y: 4, w: 70, h: 10 }, { d: 72, y: 1.5, w: 55, h: 6 }]) {
      for (let i = -7; i <= 7; i++) {
        // Positions are local to the group, which already stands at Fuji's foot.
        const s = new THREE.Sprite(this.mistMaterial);
        s.position.set(0, 0, 0)
          .addScaledVector(toGarden, row.d + (Math.random() - 0.5) * 10)
          .addScaledVector(across, i * 18 + (Math.random() - 0.5) * 8);
        // A world height, so subtract the group's own height.
        s.position.y = row.y + Math.random() * 3 - FUJI_POS.y;
        s.scale.set(row.w * (0.8 + Math.random() * 0.4), row.h, 1);
        this.group.add(s);
      }
    }
  }
}
export const fuji = new Fuji();
