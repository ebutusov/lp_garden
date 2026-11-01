import * as THREE from 'three';
import { scene } from '../core/scene.js';
import { addCircleSolid, addBoxSolid, platforms } from '../core/physics.js';

// ---- Feature: the base class of every garden feature ----
// A class bundles some data (fields on `this`) with the functions that work on it
// (methods). Each garden feature is a subclass: `class Torii extends Feature`. It
// inherits the helpers below, so they're written once here instead of in every file.
//
// A feature *has* a THREE.Group (composition) rather than *being* one (inheritance).
// The group holds the feature's meshes, so their positions are local to it, and
// moving, turning or scaling the group carries the whole feature along.
//
// Every feature answers update(dt, t), which animate() in main.js calls once per frame
// (dt: seconds since the last frame, t: seconds since the start). The base version does
// nothing; static features keep it and animated ones override it. The same call works
// on any feature, whatever it is: that is polymorphism.
const tmpV = new THREE.Vector3();

export class Feature {
  // A subclass's constructor must call super(...) before it touches `this`.
  constructor(x = 0, z = 0, parent = scene) {
    this.group = new THREE.Group();
    this.group.position.set(x, 0, z);
    parent.add(this.group);
  }

  update(dt, t) {}

  // Make a mesh at a local position and add it to the group (or another parent).
  mesh(geo, material, x = 0, y = 0, z = 0, { cast = false, receive = false, parent = this.group } = {}) {
    const m = new THREE.Mesh(geo, material);
    m.position.set(x, y, z);
    m.castShadow = cast;
    m.receiveShadow = receive;
    parent.add(m);
    return m;
  }

  // A local point (lx, 0, lz) in world coordinates. localToWorld applies the group's
  // transform and all its parents', so it works for nested features too (the tea things
  // inside the tea house). The matrices are normally refreshed just before rendering, so
  // bring them up to date first.
  toWorld(lx, lz) {
    this.group.updateWorldMatrix(true, false);
    return this.group.localToWorld(tmpV.set(lx, 0, lz));
  }

  // Colliders and walkable surfaces, given in local coordinates (physics.js wants world
  // ones). Radii and heights are in world units. Boxes stay axis-aligned, so they only
  // suit groups that are moved but not turned.
  solidCircle(lx, lz, r, h) {
    const p = this.toWorld(lx, lz);
    addCircleSolid(p.x, p.z, r, h);
  }
  solidBox(minX, maxX, minZ, maxZ, h) {
    const { x, z } = this.toWorld(0, 0);
    addBoxSolid(x + minX, x + maxX, z + minZ, z + maxZ, h);
  }
  platform(minX, maxX, minZ, maxZ, y) {
    const { x, z } = this.toWorld(0, 0);
    platforms.push({ minX: x + minX, maxX: x + maxX, minZ: z + minZ, maxZ: z + maxZ, y });
  }
}
