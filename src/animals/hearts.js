import * as THREE from 'three';
import { scene } from '../core/scene.js';

// ---- Hearts that float up when an animal is petted ----
function makeHeartTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  g.fillStyle = '#ff5d7a';
  g.beginPath();
  g.moveTo(32, 56);
  g.bezierCurveTo(4, 36, 4, 10, 20, 10);
  g.bezierCurveTo(28, 10, 32, 16, 32, 22);
  g.bezierCurveTo(32, 16, 36, 10, 44, 10);
  g.bezierCurveTo(60, 10, 60, 36, 32, 56);
  g.fill();
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}
const heartTex = makeHeartTexture();
// A small pool of camera-facing sprites, reused round-robin (like the ripples).
const hearts = Array.from({ length: 3 }, () => {
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: heartTex, transparent: true, depthWrite: false }));
  s.scale.setScalar(0.45);
  s.visible = false;
  scene.add(s);
  return { sprite: s, age: 0 };
});
let heartNext = 0;
// Pop a heart above `head` (any Object3D, e.g. the dog's or a cat's head group).
export function spawnHeart(head) {
  const h = hearts[heartNext];
  heartNext = (heartNext + 1) % hearts.length;
  // The head is nested inside the animal's body groups, so its .position is relative
  // to its parent. getWorldPosition resolves the whole chain into world coordinates.
  head.getWorldPosition(h.sprite.position);
  h.sprite.position.y += 0.5;
  h.age = 0;
  h.sprite.visible = true;
}
export function updateHearts(dt) {
  for (const h of hearts) {
    if (!h.sprite.visible) continue;
    h.age += dt;
    h.sprite.position.y += 0.8 * dt;
    h.sprite.material.opacity = Math.max(0, 1 - h.age / 1.4);
    if (h.age >= 1.4) h.sprite.visible = false;
  }
}
