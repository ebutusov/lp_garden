import * as THREE from 'three';
import { M, mat } from '../core/materials.js';
import { dotTex } from '../core/textures.js';
import { teaHouse } from './teaHouse.js';
import { Feature } from './feature.js';

// ---- Tea things: a clay teapot and cups on the table, an iron kettle on a brazier ----
// The group sits inside the tea house's group, so all positions are in the house's
// local frame, and moving the house would carry its furniture along.
const STEAM_COUNT = 14, STEAM_LIFE = 2.5;

class TeaThings extends Feature {
  constructor(house) {
    super(0, 0, house.group);
    const { floorY } = house;
    // Every part both casts and receives shadows.
    const part = (geo, m, x, y, z, parent = this.group) => this.mesh(geo, m, x, y, z, { cast: true, receive: true, parent });
    const CLAY = mat(0x9c4a2e, { roughness: 0.5 });     // tokoname red clay
    const GLAZE = mat(0xe3dccb, { roughness: 0.35 });   // cream glazed cups
    const GREEN_TEA = mat(0x8fa24a, { roughness: 0.2 });
    // Metalness 0.4: iron reflects its surroundings a little, tinted by its own colour.
    const IRON = mat(0x2d2b2a, { roughness: 0.6, metalness: 0.4 });
    // Strong emissive: the embers glow past the bloom threshold, even unlit.
    const EMBER = mat(0x3a1a10, { emissive: 0xff5a1a, emissiveIntensity: 1.2 });
    const TABLE_X = -0.5, TABLE_TOP = floorY + 0.3;

    // Tray with a side-handled teapot (kyusu): spout to the front, handle at a right angle.
    // The pot is its own group, so its parts are placed relative to the pot and the whole
    // pot can be turned on the tray with one rotation.
    part(new THREE.BoxGeometry(0.55, 0.02, 0.36), M.wood, TABLE_X, TABLE_TOP + 0.01, 0); // lighter than the table
    const pot = new THREE.Group();
    pot.position.set(TABLE_X, TABLE_TOP + 0.02, 0);
    pot.rotation.y = 0.6;
    this.group.add(pot);
    part(new THREE.SphereGeometry(0.14, 10, 8), CLAY, 0, 0.11, 0, pot).scale.y = 0.8;
    part(new THREE.CylinderGeometry(0.075, 0.085, 0.025, 10), CLAY, 0, 0.225, 0, pot);   // lid
    part(new THREE.SphereGeometry(0.022, 6, 4), CLAY, 0, 0.245, 0, pot);                 // knob
    part(new THREE.CylinderGeometry(0.016, 0.032, 0.13, 6), CLAY, 0, 0.13, 0.17, pot).rotation.x = 0.9;
    part(new THREE.CylinderGeometry(0.02, 0.026, 0.15, 6), CLAY, 0.2, 0.13, 0, pot)
      .rotation.z = -(Math.PI / 2 - 0.2);                                                // handle, tilted up

    // Four cups (yunomi) of green tea on wooden saucers, one at each seat.
    for (const [dx, z] of [[0.45, 0.25], [0.45, -0.25], [-0.45, 0.25], [-0.45, -0.25]]) {
      const x = TABLE_X + dx;
      part(new THREE.CylinderGeometry(0.085, 0.085, 0.012, 10), M.wood, x, TABLE_TOP + 0.006, z);
      part(new THREE.CylinderGeometry(0.058, 0.046, 0.12, 10), GLAZE, x, TABLE_TOP + 0.072, z);
      part(new THREE.CircleGeometry(0.05, 10).rotateX(-Math.PI / 2), GREEN_TEA, x, TABLE_TOP + 0.133, z);
    }

    // Ceramic charcoal brazier (hibachi) in the back corner, with an iron kettle (tetsubin) on it.
    const BX = -2.9, BZ = 2.5;
    part(new THREE.CylinderGeometry(0.34, 0.28, 0.42, 12), mat(0x34465e, { roughness: 0.4 }), BX, floorY + 0.21, BZ);
    part(new THREE.CylinderGeometry(0.3, 0.3, 0.02, 12), mat(0x9a948a, { roughness: 1 }), BX, floorY + 0.41, BZ); // ash
    for (const [ex, ez] of [[0.17, 0.05], [-0.12, 0.15], [0.02, -0.18]]) {
      part(new THREE.BoxGeometry(0.07, 0.05, 0.07), EMBER, BX + ex, floorY + 0.43, BZ + ez);
    }
    const kettle = new THREE.Group();
    kettle.position.set(BX, floorY + 0.44, BZ);
    kettle.rotation.y = Math.atan2(-BX, -BZ); // spout toward the middle of the room
    this.group.add(kettle);
    part(new THREE.SphereGeometry(0.2, 10, 8), IRON, 0, 0.16, 0, kettle).scale.y = 0.8;
    part(new THREE.CylinderGeometry(0.09, 0.1, 0.03, 10), IRON, 0, 0.31, 0, kettle);      // lid
    part(new THREE.SphereGeometry(0.025, 6, 4), IRON, 0, 0.335, 0, kettle);               // knob
    part(new THREE.CylinderGeometry(0.02, 0.035, 0.14, 6), IRON, 0, 0.2, 0.2, kettle).rotation.x = 0.8;
    part(new THREE.TorusGeometry(0.17, 0.014, 5, 12, Math.PI), IRON, 0, 0.3, 0, kettle);  // bail handle
    this.solidCircle(BX, BZ, 0.4, floorY + 0.9);

    this.addSteam(kettle);
  }

  // A wisp of steam from the kettle's spout. The spout tip is known in the kettle's own
  // frame; multiplying by the kettle's matrix (its position + rotation) converts it into
  // the tea house's frame, where the steam particles live.
  addSteam(kettle) {
    kettle.updateMatrix();
    this.steamTip = new THREE.Vector3(0, 0.25, 0.26).applyMatrix4(kettle.matrix);
    this.steamPos = new Float32Array(STEAM_COUNT * 3);
    this.steamCol = new Float32Array(STEAM_COUNT * 4); // RGBA: alpha fades each puff out
    this.steamGeo = new THREE.BufferGeometry();
    this.steamGeo.setAttribute('position', new THREE.BufferAttribute(this.steamPos, 3));
    this.steamGeo.setAttribute('color', new THREE.BufferAttribute(this.steamCol, 4));
    const points = new THREE.Points(this.steamGeo, new THREE.PointsMaterial({
      size: 0.14, map: dotTex, vertexColors: true, transparent: true, depthWrite: false,
    }));
    // Three skips objects whose bounding sphere is off screen ("frustum culling"). The
    // sphere is computed once from the initial positions, which are all zero here, so
    // culling must be turned off or the steam could vanish when it shouldn't.
    points.frustumCulled = false;
    this.group.add(points);
  }

  update(dt, t) {
    const tip = this.steamTip, pos = this.steamPos;
    for (let i = 0; i < STEAM_COUNT; i++) {
      const age = (t / STEAM_LIFE + i / STEAM_COUNT) % 1; // staggered puffs, each living STEAM_LIFE seconds
      pos[i * 3] = tip.x + Math.sin(t * 1.3 + i) * 0.06 * age;
      pos[i * 3 + 1] = tip.y + age * 0.8;
      pos[i * 3 + 2] = tip.z + Math.cos(t * 1.1 + i * 2) * 0.06 * age;
      this.steamCol.set([1, 1, 1, 0.45 * Math.sin(age * Math.PI)], i * 4);
    }
    // Changing a typed array doesn't reach the GPU by itself: flag the attribute so
    // three re-uploads it before the next draw.
    this.steamGeo.attributes.position.needsUpdate = true;
    this.steamGeo.attributes.color.needsUpdate = true;
  }
}
export const teaThings = new TeaThings(teaHouse);
