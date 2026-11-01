import * as THREE from 'three';
import { scene } from '../core/scene.js';
import { M } from '../core/materials.js';
import { LANTERN_SPOTS, PATH_LANTERN_SPOTS, PATH_LANTERN_SCALE, PATH_LANTERN_GLOW } from '../core/layout.js';
import { addCircleSolid } from '../core/physics.js';

// ---- Stone Lantern (Tōrō) ----
export const LANTERN_INTENSITY = 8;
// Brightness set by day/night (see dayNight.js); each lantern scales it by its own glow.
let lanternIntensity = LANTERN_INTENSITY;
export const setLanternIntensity = (v) => { lanternIntensity = v; };

// `glow` scales the light it gives off; `paperMat` is the material of its glowing box.
function makeLantern(scale = 1, glow = 1, paperMat = M.paper) {
  const g = new THREE.Group();
  g.scale.setScalar(scale);
  g.userData.glow = glow; // userData: a free slot on every Object3D for your own data
  const base = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.6, 0.5, 6), M.stoneD);
  base.position.y = 0.25; base.castShadow = true;
  const post = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.3, 1.4, 6), M.stone);
  post.position.y = 1.0; post.castShadow = true;
  // glowing paper fire box (the lit part of the lantern)
  const paper = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.6, 0.9), paperMat);
  paper.position.y = 2.0;
  // A 4-sided cone is a pyramid; turned 45° its edges line up with the box below.
  const roof = new THREE.Mesh(new THREE.ConeGeometry(1.1, 0.8, 4), M.stoneD);
  roof.position.y = 2.7; roof.rotation.y = Math.PI / 4; roof.castShadow = true;
  // Physical light units (three r155+): intensity is in candela.
  // PointLight(color, intensity, distance, decay): light fades to zero at `distance`,
  // with decay 2 being physically correct inverse-square falloff. Every extra light
  // costs shading work on every lit pixel, so these don't cast shadows.
  const light = new THREE.PointLight(0xffd27a, LANTERN_INTENSITY * glow, 12 * scale, 2);
  light.position.y = 2.0;
  g.add(base, post, paper, roof, light);
  return g;
}
export const lanterns = [];
function placeLantern(x, z, scale = 1, glow = 1, paperMat = M.paper) {
  const l = makeLantern(scale, glow, paperMat);
  l.position.set(x, 0, z);
  scene.add(l); lanterns.push(l);
  addCircleSolid(x, z, 0.6 * scale, 3.1 * scale);
}
for (const [x, z] of LANTERN_SPOTS) placeLantern(x, z);
for (const [x, z] of PATH_LANTERN_SPOTS) {
  placeLantern(x, z, PATH_LANTERN_SCALE, PATH_LANTERN_GLOW, M.pathPaper);
}

// Lantern glow pulse: a gentle flicker, out of step between lanterns (each object's
// unique id offsets its sine wave).
export function updateLanterns(t) {
  for (const l of lanterns) {
    const gl = l.children.find((c) => c.type === 'PointLight');
    if (gl) gl.intensity = lanternIntensity * l.userData.glow * (1 + Math.sin(t * 3 + l.id) * 0.25);
  }
}
