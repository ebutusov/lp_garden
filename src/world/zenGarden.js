import * as THREE from 'three';
import { scene } from '../core/scene.js';
import { M } from '../core/materials.js';
import { rand } from '../core/random.js';
import { renderer } from '../core/renderer.js';
import { ZEN } from '../core/layout.js';
import { addCircleSolid, platforms } from '../core/physics.js';

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
function buildZenGarden() {
  const g = new THREE.Group();
  g.position.set(ZEN.x, 0, ZEN.z);
  const base = new THREE.Mesh(new THREE.BoxGeometry(ZEN.w, 0.1, ZEN.d), M.gravel);
  base.position.y = 0.05;
  base.receiveShadow = true;
  // The raked plane sits a hair above the base's top (0.102 vs 0.1). Two surfaces at
  // exactly the same depth flicker as the GPU can't decide which is in front (z-fighting).
  const raked = new THREE.Mesh(
    new THREE.PlaneGeometry(ZEN.w, ZEN.d).rotateX(-Math.PI / 2),
    new THREE.MeshStandardMaterial({ map: makeRakedTexture(), roughness: 1 })
  );
  raked.position.y = 0.102;
  raked.receiveShadow = true;
  g.add(base, raked);
  // low wooden edging
  for (const s of [1, -1]) {
    const ex = new THREE.Mesh(new THREE.BoxGeometry(ZEN.w + 0.6, 0.3, 0.3), M.darkWood);
    ex.position.set(0, 0.15, s * (ZEN.d / 2 + 0.15));
    const ez = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.3, ZEN.d), M.darkWood);
    ez.position.set(s * (ZEN.w / 2 + 0.15), 0.15, 0);
    ex.castShadow = ez.castShadow = true;
    g.add(ex, ez);
  }
  for (const grp of ZEN_GROUPS) {
    grp.rocks.forEach(([x, z, size], i) => {
      // A dodecahedron (12 faces), squashed a little, makes a convincing boulder.
      const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(size, 0), i % 2 ? M.stoneD : M.stone);
      rock.scale.set(1, 0.75, 0.9);
      rock.position.set(x, size * 0.45, z);
      rock.rotation.y = rand() * Math.PI;
      rock.castShadow = true; rock.receiveShadow = true;
      const moss = new THREE.Mesh(new THREE.CylinderGeometry(size * 1.15, size * 1.3, 0.06, 7), M.moss);
      moss.position.set(x, 0.13, z);
      g.add(rock, moss);
      addCircleSolid(ZEN.x + x, ZEN.z + z, size * 0.9, size * 1.2);
    });
  }
  scene.add(g);
  const minX = ZEN.x - ZEN.w / 2, maxX = ZEN.x + ZEN.w / 2;
  const minZ = ZEN.z - ZEN.d / 2, maxZ = ZEN.z + ZEN.d / 2;
  platforms.push(
    { minX, maxX, minZ, maxZ, y: 0.1 },
    { minX: minX - 0.3, maxX: maxX + 0.3, minZ: minZ - 0.3, maxZ: minZ, y: 0.3 },
    { minX: minX - 0.3, maxX: maxX + 0.3, minZ: maxZ, maxZ: maxZ + 0.3, y: 0.3 },
    { minX: minX - 0.3, maxX: minX, minZ, maxZ, y: 0.3 },
    { minX: maxX, maxX: maxX + 0.3, minZ, maxZ, y: 0.3 },
  );
}
buildZenGarden();
export const inZen = (x, z) => Math.abs(x - ZEN.x) <= ZEN.w / 2 && Math.abs(z - ZEN.z) <= ZEN.d / 2;
