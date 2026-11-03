import * as THREE from 'three';
import { Feature } from '../world/feature.js';

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
const HEART_COUNT = 3, HEART_LIFE = 1.4;

// A small pool of camera-facing sprites, reused round-robin (like the ripples).
// The group stays at the world origin, so a sprite's position is its world position.
export class Hearts extends Feature {
  constructor(ctx) {
    super(ctx);
    const tex = makeHeartTexture();
    this.pool = Array.from({ length: HEART_COUNT }, () => {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false }));
      s.scale.setScalar(0.45);
      s.visible = false;
      this.group.add(s);
      return { sprite: s, age: 0 };
    });
    this.next = 0;
  }

  // Pop a heart above `head` (any Object3D, e.g. the dog's or a cat's head group).
  spawn(head) {
    const h = this.pool[this.next];
    this.next = (this.next + 1) % this.pool.length;
    // The head is nested inside the animal's body groups, so its .position is relative
    // to its parent. getWorldPosition resolves the whole chain into world coordinates.
    head.getWorldPosition(h.sprite.position);
    h.sprite.position.y += 0.5;
    h.age = 0;
    h.sprite.visible = true;
  }

  update(dt) {
    for (const h of this.pool) {
      if (!h.sprite.visible) continue;
      h.age += dt;
      h.sprite.position.y += 0.8 * dt;
      h.sprite.material.opacity = Math.max(0, 1 - h.age / HEART_LIFE);
      if (h.age >= HEART_LIFE) h.sprite.visible = false;
    }
  }
}
