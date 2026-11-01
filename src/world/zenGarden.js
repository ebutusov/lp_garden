import * as THREE from 'three';
import { M } from '../core/materials.js';
import { rand } from '../core/random.js';
import { renderer } from '../core/renderer.js';
import { ZEN } from '../core/layout.js';
import { Feature } from './feature.js';

// ---- Zen gravel garden (karesansui) ----
// Rock groups set in gravel raked into straight lines, with rings around each group.
// The raking is not geometry at all: it's painted into a texture, with light and dark
// lines that the eye reads as grooves.
const ZEN_GROUPS = [
  { cx: -3.6, cz: -2, ring: 2.3, rings: 4, rocks: [[-4, -1.5, 1.4], [-2.5, -2.9, 0.7]] },
  { cx: 4, cz: 1.4, ring: 2.4, rings: 4, rocks: [[3.6, 1.8, 1.5], [4.9, 0.4, 0.65]] },
  { cx: -1.2, cz: 3.9, ring: 0.7, rings: 3, rocks: [[-1.2, 3.9, 0.55]] },
];
function makeRakedTexture() {
  const PX = 64; // pixels per world unit
  const c = document.createElement('canvas');
  c.width = ZEN.w * PX; c.height = ZEN.d * PX;
  const g = c.getContext('2d');
  const BASE = '#e4dcc6';
  g.fillStyle = BASE;
  g.fillRect(0, 0, c.width, c.height);
  // A groove is a dark line with a light line beside it, which reads as relief.
  const groove = (path) => {
    g.strokeStyle = '#c3b89b'; g.lineWidth = 5; path(0); g.stroke();
    g.strokeStyle = '#f5f0e3'; g.lineWidth = 2; path(3); g.stroke();
  };
  for (let y = 11; y < c.height; y += 0.35 * PX) {
    groove((o) => { g.beginPath(); g.moveTo(0, y + o); g.lineTo(c.width, y + o); });
  }
  // Canvas (px, py) ↔ zen-local (x, z) = (px/PX - w/2, py/PX - d/2) on the flat plane.
  for (const grp of ZEN_GROUPS) {
    const px = (grp.cx + ZEN.w / 2) * PX, py = (grp.cz + ZEN.d / 2) * PX;
    const outer = (grp.ring + 0.35 * grp.rings) * PX;
    g.fillStyle = BASE;
    g.beginPath(); g.arc(px, py, outer + 8, 0, Math.PI * 2); g.fill();
    for (let k = 1; k <= grp.rings; k++) {
      const r = (grp.ring + 0.35 * k) * PX;
      groove((o) => { g.beginPath(); g.arc(px, py, r + o, 0, Math.PI * 2); });
    }
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  // Anisotropic filtering keeps fine lines crisp when the ground is seen at a shallow
  // angle; plain mipmapping would blur them into a smear.
  tex.anisotropy = renderer.capabilities.getMaxAnisotropy();
  return tex;
}

class ZenGarden extends Feature {
  constructor() {
    super(ZEN.x, ZEN.z);
    this.mesh(new THREE.BoxGeometry(ZEN.w, 0.1, ZEN.d), M.gravel, 0, 0.05, 0, { receive: true });
    // The raked plane sits a hair above the base's top (0.102 vs 0.1). Two surfaces at
    // exactly the same depth flicker as the GPU can't decide which is in front (z-fighting).
    this.mesh(
      new THREE.PlaneGeometry(ZEN.w, ZEN.d).rotateX(-Math.PI / 2),
      new THREE.MeshStandardMaterial({ map: makeRakedTexture(), roughness: 1 }),
      0, 0.102, 0, { receive: true },
    );
    // low wooden edging
    for (const s of [1, -1]) {
      this.mesh(new THREE.BoxGeometry(ZEN.w + 0.6, 0.3, 0.3), M.darkWood, 0, 0.15, s * (ZEN.d / 2 + 0.15), { cast: true });
      this.mesh(new THREE.BoxGeometry(0.3, 0.3, ZEN.d), M.darkWood, s * (ZEN.w / 2 + 0.15), 0.15, 0, { cast: true });
    }
    for (const grp of ZEN_GROUPS) {
      grp.rocks.forEach(([x, z, size], i) => {
        // A dodecahedron (12 faces), squashed a little, makes a convincing boulder.
        const rock = this.mesh(new THREE.DodecahedronGeometry(size, 0), i % 2 ? M.stoneD : M.stone,
          x, size * 0.45, z, { cast: true, receive: true });
        rock.scale.set(1, 0.75, 0.9);
        rock.rotation.y = rand() * Math.PI;
        this.mesh(new THREE.CylinderGeometry(size * 1.15, size * 1.3, 0.06, 7), M.moss, x, 0.13, z);
        this.solidCircle(x, z, size * 0.9, size * 1.2);
      });
    }
    // The gravel, and the edging around it, which is a step higher.
    const hw = ZEN.w / 2, hd = ZEN.d / 2;
    this.platform(-hw, hw, -hd, hd, 0.1);
    this.platform(-hw - 0.3, hw + 0.3, -hd - 0.3, -hd, 0.3);
    this.platform(-hw - 0.3, hw + 0.3, hd, hd + 0.3, 0.3);
    this.platform(-hw - 0.3, -hw, -hd, hd, 0.3);
    this.platform(hw, hw + 0.3, -hd, hd, 0.3);
  }

  // Is the point (x, z) on the gravel? (For footstep sounds.)
  contains(x, z) {
    return Math.abs(x - ZEN.x) <= ZEN.w / 2 && Math.abs(z - ZEN.z) <= ZEN.d / 2;
  }
}
export const zenGarden = new ZenGarden();
