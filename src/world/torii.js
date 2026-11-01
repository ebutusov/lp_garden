import * as THREE from 'three';
import { scene } from '../core/scene.js';
import { M } from '../core/materials.js';
import { TORII_Z } from '../core/layout.js';
import { addCircleSolid } from '../core/physics.js';

// ---- Torii gate (entrance) ----
function makeTorii() {
  const g = new THREE.Group();
  // One geometry, two meshes: geometry data is uploaded to the GPU once and drawn twice.
  const postGeo = new THREE.CylinderGeometry(0.5, 0.6, 7, 10);
  const pL = new THREE.Mesh(postGeo, M.maple), pR = new THREE.Mesh(postGeo, M.maple);
  pL.position.set(-5, 3.5, 0); pR.position.set(5, 3.5, 0);
  pL.castShadow = pR.castShadow = true;
  g.add(pL, pR);
  // top beam (shi)
  const top = new THREE.Mesh(new THREE.BoxGeometry(13, 0.9, 1.2), M.maple);
  top.position.y = 7.2; top.castShadow = true;
  const top2 = new THREE.Mesh(new THREE.BoxGeometry(12.2, 0.6, 0.9), M.maple);
  top2.position.y = 6.1;
  g.add(top, top2);
  return g;
}
export const torii = makeTorii();
torii.position.set(0, 0, TORII_Z);
scene.add(torii);
addCircleSolid(-5, TORII_Z, 0.65, 8);
addCircleSolid(5, TORII_Z, 0.65, 8);
