import * as THREE from 'three';
import { scene } from '../core/scene.js';
import { M } from '../core/materials.js';
import { POND_Z, SHISHI } from '../core/layout.js';
import { addCircleSolid } from '../core/physics.js';
import { spawnRipple } from './ripples.js';
import { SFX, distVol } from '../audio/sfx.js';

// ---- Bamboo water spout (shishi-odoshi) on the pond rim ----
// A feeder pipe trickles into a pivoting bamboo tube. When full it tips, pours into
// the pond, then swings back and its closed end knocks against a stone.
const SHISHI_REST = 0.35;   // tube angle with the mouth up
const SHISHI_TIP = -0.55;   // mouth down, pouring
const SHISHI_LEN = 2.2, SHISHI_PIVOT_Y = 1.2, SHISHI_MOUTH = 1.2; // mouth's distance from the pivot
const shishi = (() => {
  const g = new THREE.Group();
  g.position.set(SHISHI.x, 0, SHISHI.z);
  // local +X points at the pond centre
  g.rotation.y = Math.atan2(-(POND_Z - SHISHI.z), -SHISHI.x);
  const bamboo = (r, len, m = M.bamboo) => new THREE.Mesh(new THREE.CylinderGeometry(r, r, len, 8), m);

  for (const z of [0.45, -0.45]) {
    const s = new THREE.Mesh(new THREE.DodecahedronGeometry(0.35, 0), M.stoneD);
    s.position.set(-0.3, 0.15, z);
    g.add(s);
  }
  const anvil = new THREE.Mesh(new THREE.DodecahedronGeometry(0.3, 0), M.stone); // the stone it knocks
  anvil.position.set(-0.95, 0.45, 0);
  g.add(anvil);
  for (const z of [0.3, -0.3]) {
    const post = bamboo(0.07, SHISHI_PIVOT_Y + 0.15, M.bambooD);
    post.position.set(0, (SHISHI_PIVOT_Y + 0.15) / 2, z);
    g.add(post);
  }
  const axle = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.75, 6).rotateX(Math.PI / 2), M.darkWood);
  axle.position.y = SHISHI_PIVOT_Y;
  g.add(axle);

  // The tube hangs on an empty pivot group at the axle. The tube is offset inside it so
  // the axle sits off-centre along the tube; rotating the pivot then see-saws the tube
  // about that point, like the real thing.
  const pivot = new THREE.Group();
  pivot.position.y = SHISHI_PIVOT_Y;
  const tube = bamboo(0.12, SHISHI_LEN);
  tube.rotation.z = Math.PI / 2; // cylinders stand along Y; lay it along X
  tube.position.x = SHISHI_MOUTH - SHISHI_LEN / 2;
  tube.castShadow = true;
  pivot.add(tube);
  for (const x of [-0.45, 0.55]) {
    const node = new THREE.Mesh(new THREE.CylinderGeometry(0.135, 0.135, 0.06, 8), M.bambooD);
    node.rotation.z = Math.PI / 2;
    node.position.x = x;
    pivot.add(node);
  }
  const mouth = new THREE.Mesh(new THREE.CircleGeometry(0.1, 8).rotateY(Math.PI / 2), M.darkWood);
  mouth.position.x = SHISHI_MOUTH + 0.001;
  pivot.add(mouth);
  pivot.rotation.z = SHISHI_REST;
  g.add(pivot);

  // feeder pipe on its own post, ending above the mouth's resting position
  // (the mouth rotated by SHISHI_REST around the pivot: basic trigonometry).
  const mouthX = SHISHI_MOUTH * Math.cos(SHISHI_REST);
  const mouthY = SHISHI_PIVOT_Y + SHISHI_MOUTH * Math.sin(SHISHI_REST);
  const FEED_Y = mouthY + 0.45;
  const feedPost = bamboo(0.08, FEED_Y + 0.1, M.bambooD);
  feedPost.position.set(-1.5, (FEED_Y + 0.1) / 2, 0);
  const feed = bamboo(0.06, mouthX + 1.5);
  feed.rotation.z = Math.PI / 2;
  feed.position.set((mouthX - 1.5) / 2, FEED_Y, 0);
  const stream = new THREE.Mesh(
    new THREE.CylinderGeometry(0.025, 0.025, FEED_Y - mouthY, 6),
    new THREE.MeshStandardMaterial({ color: 0x9fd3e6, transparent: true, opacity: 0.55, roughness: 0.2 })
  );
  stream.position.set(mouthX, (FEED_Y + mouthY) / 2, 0);
  g.add(feedPost, feed, stream);
  scene.add(g);
  return { group: g, pivot, state: 'fill', timer: 0, angle: SHISHI_REST };
})();
addCircleSolid(SHISHI.x, SHISHI.z, 1.1, 2.4);

// ---- Shishi-odoshi cycle: fill → tip → pour → swing back → knock ----
// A finite state machine: the object is always in exactly one named state, each state
// has its own behaviour, and a timer or event moves it on to the next.
const SHISHI_FILL = 4.5;
const tmpV = new THREE.Vector3(); // reused every time, to avoid allocating per frame
export function updateShishi(dt) {
  const s = shishi;
  s.timer += dt;
  const go = (state) => { s.state = state; s.timer = 0; };
  const ease = (a, b, k) => a + (b - a) * k * k; // ease-in: starts slow, speeds up (gravity)
  if (s.state === 'fill') {
    s.angle = SHISHI_REST - 0.12 * Math.min(1, s.timer / SHISHI_FILL); // sags as it fills
    if (s.timer >= SHISHI_FILL) go('tip');
  } else if (s.state === 'tip') {
    const k = Math.min(1, s.timer / 0.35);
    s.angle = ease(SHISHI_REST - 0.12, SHISHI_TIP, k);
    if (k >= 1) {
      go('pour');
      // Where is the mouth in the world right now? localToWorld runs a point through
      // the pivot's and all its parents' transforms. Matrices are normally refreshed
      // just before rendering, so force an update first.
      s.group.updateMatrixWorld(true);
      const m = s.pivot.localToWorld(tmpV.set(SHISHI_MOUTH, 0, 0));
      spawnRipple(m.x, m.z - POND_Z, 1.2, 1.8);
      spawnRipple(m.x, m.z - POND_Z, 0.6, 1.2);
      SFX.splash(0.5 * distVol(m.x, m.z, 40));
    }
  } else if (s.state === 'pour') {
    if (s.timer >= 0.6) go('return');
  } else if (s.state === 'return') {
    const k = Math.min(1, s.timer / 0.2);
    s.angle = ease(SHISHI_TIP, SHISHI_REST, k);
    if (k >= 1) {
      go('fill');
      SFX.clack(distVol(SHISHI.x, SHISHI.z, 45));
    }
  }
  // After the knock the tube rebounds briefly off the stone: a damped oscillation
  // (a fast sine wave scaled by a decaying exponential).
  const rebound = s.state === 'fill' ? 0.06 * Math.exp(-s.timer * 9) * Math.abs(Math.sin(s.timer * 30)) : 0;
  s.pivot.rotation.z = s.angle - rebound;
}
