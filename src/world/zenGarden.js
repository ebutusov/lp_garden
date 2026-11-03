import * as THREE from 'three';
import { M } from '../core/materials.js';
import { Feature } from './feature.js';

// ---- Zen gravel garden (karesansui) ----
// Rock groups set in gravel raked into straight lines, with rings around each group.
// The raking is not geometry at all: it's painted into a texture, with light and dark
// lines that the eye reads as grooves.
//
// The texture is live: whoever walks on the gravel (the player, the dog, the cats)
// leaves footprints, painted into the canvas (footprint()). When the Gardener rakes,
// smooth() copies a pristine copy of the pattern back over the whole canvas. Sending
// a changed canvas to the GPU means uploading all of it again, so changes are batched
// and uploaded at most a few times a second (update()).
const PX = 64;              // texture pixels per world unit
const UPLOAD_EVERY = 0.15;  // seconds between uploads while it's changing
const ZEN_GROUPS = [
  { cx: -3.6, cz: -2, ring: 2.3, rings: 4, rocks: [[-4, -1.5, 1.4], [-2.5, -2.9, 0.7]] },
  { cx: 4, cz: 1.4, ring: 2.4, rings: 4, rocks: [[3.6, 1.8, 1.5], [4.9, 0.4, 0.65]] },
  { cx: -1.2, cz: 3.9, ring: 0.7, rings: 3, rocks: [[-1.2, 3.9, 0.55]] },
];
function makeRakedCanvas(w, d) {
  const c = document.createElement('canvas');
  c.width = w * PX; c.height = d * PX;
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
    const px = (grp.cx + w / 2) * PX, py = (grp.cz + d / 2) * PX;
    const outer = (grp.ring + 0.35 * grp.rings) * PX;
    g.fillStyle = BASE;
    g.beginPath(); g.arc(px, py, outer + 8, 0, Math.PI * 2); g.fill();
    for (let k = 1; k <= grp.rings; k++) {
      const r = (grp.ring + 0.35 * k) * PX;
      groove((o) => { g.beginPath(); g.arc(px, py, r + o, 0, Math.PI * 2); });
    }
  }
  return c;
}

// It's `w` by `d` around (x, z). `anisotropy` is how much anisotropic filtering the
// GPU offers (renderer.capabilities.getMaxAnisotropy()), for the raked texture.
export class ZenGarden extends Feature {
  constructor(ctx, { x, z, w, d, anisotropy = 1 }) {
    super(ctx, { x, z });
    const { rand } = ctx;
    this.w = w;
    this.d = d;
    this.prints = 0;     // footprints since the last raking
    this.dirty = false;  // has the canvas changed since the last upload?
    this.uploadT = 0;
    this.mesh(new THREE.BoxGeometry(w, 0.1, d), M.gravel, 0, 0.05, 0, { receive: true });
    // The live canvas, and an untouched copy of it to rake back to.
    this.canvas = makeRakedCanvas(w, d);
    this.paint = this.canvas.getContext('2d');
    this.pristine = document.createElement('canvas');
    this.pristine.width = this.canvas.width;
    this.pristine.height = this.canvas.height;
    this.pristine.getContext('2d').drawImage(this.canvas, 0, 0);
    this.tex = new THREE.CanvasTexture(this.canvas);
    this.tex.colorSpace = THREE.SRGBColorSpace;
    // Anisotropic filtering keeps fine lines crisp when the ground is seen at a shallow
    // angle; plain mipmapping would blur them into a smear.
    this.tex.anisotropy = anisotropy;
    // The raked plane sits a hair above the base's top (0.102 vs 0.1). Two surfaces at
    // exactly the same depth flicker as the GPU can't decide which is in front (z-fighting).
    this.mesh(
      new THREE.PlaneGeometry(w, d).rotateX(-Math.PI / 2),
      new THREE.MeshStandardMaterial({ map: this.tex, roughness: 1 }),
      0, 0.102, 0, { receive: true },
    );
    // low wooden edging
    for (const s of [1, -1]) {
      this.mesh(new THREE.BoxGeometry(w + 0.6, 0.3, 0.3), M.darkWood, 0, 0.15, s * (d / 2 + 0.15), { cast: true });
      this.mesh(new THREE.BoxGeometry(0.3, 0.3, d), M.darkWood, s * (w / 2 + 0.15), 0.15, 0, { cast: true });
    }
    for (const grp of ZEN_GROUPS) {
      grp.rocks.forEach(([rx, rz, size], i) => {
        // A dodecahedron (12 faces), squashed a little, makes a convincing boulder.
        const rock = this.mesh(new THREE.DodecahedronGeometry(size, 0), i % 2 ? M.stoneD : M.stone,
          rx, size * 0.45, rz, { cast: true, receive: true });
        rock.scale.set(1, 0.75, 0.9);
        rock.rotation.y = rand() * Math.PI;
        this.mesh(new THREE.CylinderGeometry(size * 1.15, size * 1.3, 0.06, 7), M.moss, rx, 0.13, rz);
        this.solidCircle(rx, rz, size * 0.9, size * 1.2);
      });
    }
    // The gravel, and the edging around it, which is a step higher.
    const hw = w / 2, hd = d / 2;
    this.platform(-hw, hw, -hd, hd, 0.1);
    this.platform(-hw - 0.3, hw + 0.3, -hd - 0.3, -hd, 0.3);
    this.platform(-hw - 0.3, hw + 0.3, hd, hd + 0.3, 0.3);
    this.platform(-hw - 0.3, -hw, -hd, hd, 0.3);
    this.platform(hw, hw + 0.3, -hd, hd, 0.3);
  }

  // Is the point (x, z) on the gravel? (For footstep sounds.)
  contains(x, z) {
    const p = this.group.position;
    return Math.abs(x - p.x) <= this.w / 2 && Math.abs(z - p.z) <= this.d / 2;
  }

  // A footprint at world (x, z) for a foot pointing along `heading` (radians from +Z,
  // like the animals' headings). `size` 1 is a person's sandal; paws are smaller and
  // rounder. Pressed-in gravel reads as a darker hollow with a light rim pushed up
  // beside it.
  footprint(x, z, heading, size = 1, paw = false) {
    const p = this.group.position, lx = x - p.x, lz = z - p.z;
    if (Math.abs(lx) > this.w / 2 - 0.05 || Math.abs(lz) > this.d / 2 - 0.05) return;
    // Canvas (px, py) ↔ local (x, z), as in makeRakedCanvas; a direction (sin h, cos h)
    // on the ground points at the canvas angle atan2(cos h, sin h).
    const g = this.paint;
    g.save();
    g.translate((lx + this.w / 2) * PX, (lz + this.d / 2) * PX);
    g.rotate(Math.atan2(Math.cos(heading), Math.sin(heading)));
    g.scale(size, size);
    const rx = (paw ? 0.07 : 0.16) * PX, ry = (paw ? 0.06 : 0.07) * PX;
    g.fillStyle = 'rgba(255, 252, 244, 0.45)';
    g.beginPath(); g.ellipse(-1, -2, rx * 1.15, ry * 1.25, 0, 0, Math.PI * 2); g.fill();
    g.fillStyle = 'rgba(130, 114, 86, 0.65)';
    g.beginPath(); g.ellipse(0, 0, rx, ry, 0, 0, Math.PI * 2); g.fill();
    g.restore();
    this.prints++;
    this.dirty = true;
  }

  // Rake it all smooth again: copy the pristine pattern back over the live canvas.
  smooth() {
    if (!this.prints) return;
    this.paint.drawImage(this.pristine, 0, 0);
    this.prints = 0;
    this.dirty = true;
  }

  // Upload the canvas when it has changed, but not more often than UPLOAD_EVERY.
  update(dt) {
    this.uploadT -= dt;
    if (this.dirty && this.uploadT <= 0) {
      this.tex.needsUpdate = true; // three re-sends the canvas before the next draw
      this.dirty = false;
      this.uploadT = UPLOAD_EVERY;
    }
  }
}
