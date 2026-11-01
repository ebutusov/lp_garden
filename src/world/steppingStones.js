import * as THREE from 'three';
import { scene } from '../core/scene.js';
import { M } from '../core/materials.js';
import { rand } from '../core/random.js';
import { POND_Z, POND_R, TEA_PATH } from '../core/layout.js';

// ---- Stepping stones (tobi-ishi): torii → bridge, and tea house → pond ----
function addSteppingStone(x, z) {
  const stone = new THREE.Mesh(
    new THREE.CylinderGeometry(0.7 + rand() * 0.4, 0.9, 0.25, 7),
    M.stone
  );
  stone.position.set(x, 0.12, z);
  stone.rotation.y = rand() * Math.PI;
  // A mesh can both cast shadows onto others and receive them from others.
  stone.receiveShadow = true; stone.castShadow = true;
  scene.add(stone);
}
const stoneCount = 9;
const stoneStartZ = 31, stoneEndZ = POND_Z + POND_R + 3;
for (let i = 0; i < stoneCount; i++) {
  const z = stoneStartZ + (stoneEndZ - stoneStartZ) * (i / (stoneCount - 1));
  addSteppingStone((i % 2 ? 0.6 : -0.6) + (rand() - 0.5) * 0.4, z);
}
for (const [x, z] of TEA_PATH) addSteppingStone(x, z);
