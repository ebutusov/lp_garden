import * as THREE from 'three';

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
//
// Dependency injection: a feature never reaches out for the world it lives in. Its
// constructor is *given* everything it needs:
//  - `ctx`, the shared context: { scene, physics, placement, rand }. The scene graph
//    to add itself to, the colliders to register, where props may go, and the seeded
//    random generator;
//  - its options: where it stands, how big it is, and any other feature it works with
//    (the ripples are handed the pond they ripple).
// So reading a constructor call tells you exactly what a feature depends on, and
// nothing happens until someone calls `new`. garden.js is the one place that does
// (the "composition root"), in a deliberate order.
const tmpV = new THREE.Vector3();

export class Feature {
  // A subclass's constructor must call super(...) before it touches `this`.
  constructor(ctx, { x = 0, z = 0, parent = ctx.scene } = {}) {
    this.ctx = ctx;
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

  // Colliders and walkable surfaces, given in local coordinates (physics wants world
  // ones). Radii and heights are in world units. Boxes stay axis-aligned, so they only
  // suit groups that are moved but not turned.
  solidCircle(lx, lz, r, h) {
    const p = this.toWorld(lx, lz);
    return this.ctx.physics.addCircleSolid(p.x, p.z, r, h);
  }
  solidBox(minX, maxX, minZ, maxZ, h) {
    const { x, z } = this.toWorld(0, 0);
    return this.ctx.physics.addBoxSolid(x + minX, x + maxX, z + minZ, z + maxZ, h);
  }
  platform(minX, maxX, minZ, maxZ, y) {
    const { x, z } = this.toWorld(0, 0);
    return this.ctx.physics.addPlatform(x + minX, x + maxX, z + minZ, z + maxZ, y);
  }
}
