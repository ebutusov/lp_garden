import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

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
// For landingOn(): one ray, reused, and a matrix for turning normals into world space.
const downRay = new THREE.Raycaster();
const DOWN = new THREE.Vector3(0, -1, 0);
const normalMat = new THREE.Matrix3();
// For mergeStatic(): a mesh's transform relative to the group it's merged into.
const toRoot = new THREE.Matrix4(), relative = new THREE.Matrix4();

export class Feature {
  // A subclass's constructor must call super(...) before it touches `this`.
  constructor(ctx, { x = 0, z = 0, parent = ctx.scene } = {}) {
    this.ctx = ctx;
    this.group = new THREE.Group();
    // Marks where this feature's part of the scene graph begins, so mergeStatic() can
    // tell its own meshes from a feature nested inside it (the tea things in the house).
    this.group.userData.feature = this;
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

  // A spot a butterfly can land on: the top of `mesh`, (dx, dz) from its centre, as
  // { point, normal, kind } in world coordinates, or null if that bit is too steep.
  //
  // Rather than working the top out from the geometry (hard for a rock tipped at a
  // random angle), it *raycasts*: shoot a ray straight down from high above and ask
  // where it first meets the mesh's triangles. This is the same test a mouse-picking
  // ray uses. Testing just this one mesh keeps it cheap and stops it hitting anything else.
  //
  // The hit's face normal is in the mesh's own (object) space. Turning a direction into
  // world space isn't quite the same as turning a point: under a non-uniform scale (the
  // squashed zen rocks) the normal would no longer be perpendicular to the surface.
  // The "normal matrix", the inverse transpose of the world matrix, transforms it correctly.
  landingOn(mesh, dx = 0, dz = 0, kind = 'stone', minUp = 0.7) {
    mesh.updateWorldMatrix(true, false);
    const c = mesh.getWorldPosition(tmpV);
    downRay.set(new THREE.Vector3(c.x + dx, c.y + 50, c.z + dz), DOWN);
    const hit = downRay.intersectObject(mesh, false)[0];
    if (!hit) return null;
    const normal = hit.face.normal.clone().applyMatrix3(normalMat.getNormalMatrix(mesh.matrixWorld)).normalize();
    if (normal.y < minUp) return null;
    return { point: hit.point.clone(), normal, kind };
  }

  // ---- Merging static meshes: fewer draw calls ----
  // Every visible mesh costs the CPU a "draw call" per render pass: three binds its
  // shader, uploads its matrices and material settings, and asks the GPU to draw it.
  // The garden is made of hundreds of small meshes, and that per-call overhead, not the
  // GPU's drawing, is what most of a frame costs here. Meshes that never move and share
  // a material can be fused into one: their geometries are copied into one buffer, each
  // copy moved to where its mesh stood (the transform is "baked" into the vertices).
  //
  // What it trades away: the merged mesh moves as one, so nothing in it can be animated
  // on its own, and it's culled as one (when any part is in view, all of it is drawn).
  // So it's done per feature, never across the garden: one mesh per material for the
  // bridge, another for the lanterns, and so on. Leave out anything that moves, turns,
  // scales or is shown and hidden later: pass it (or a group holding it) in `skip`.
  //
  // The originals aren't removed, only hidden (three skips invisible meshes when it
  // renders, so they cost nothing to draw). Code that looks at them still works:
  // butterflies raycast onto their landing spots, perches hang off their groups, and
  // the debug fingerprint reads where they were placed. Raycasting ignores `visible`.
  //
  // `root`: the group whose meshes are merged, and where the merged meshes go (its
  // own transform, and any animation of it, carries on applying to them).
  // `into`: features nested inside `root` whose meshes may be merged too (a feature's
  // group is otherwise a boundary: the tea things in the house aren't the house's).
  // Called once, after the whole garden is built (garden.js).
  mergeStatic({ root = this.group, skip = [], into = [] } = {}) {
    const skipped = new Set(skip);
    const open = new Set([this.group, ...into.map((f) => f.group)]);
    root.updateWorldMatrix(true, true);
    toRoot.copy(root.matrixWorld).invert();
    const batches = new Map();
    const visit = (o) => {
      if (skipped.has(o) || !o.visible) return;
      if (o !== root && o.userData.feature && !open.has(o)) return; // another feature
      if (o.userData.merged) return; // merged already
      for (const child of o.children) visit(child);
      if (!o.isMesh || o.isInstancedMesh || o.isSkinnedMesh || o.children.length) return;
      const material = o.material, geo = o.geometry;
      // Transparent meshes are sorted back to front one by one before drawing, so a
      // merged one would blend in the wrong order. Morph targets animate per mesh.
      if (Array.isArray(material) || material.transparent || Object.keys(geo.morphAttributes).length) return;
      relative.multiplyMatrices(toRoot, o.matrixWorld);
      // A mirroring transform (negative scale) turns triangles inside out: three
      // corrects that per mesh when drawing, but not once it's baked into vertices.
      if (relative.determinant() < 0) return;
      // Only like with like: same material, same shadow and layer settings, and
      // geometries with the same vertex attributes (mergeGeometries needs that).
      const attrs = Object.entries(geo.attributes).map(([name, a]) => `${name}:${a.itemSize}:${a.array.constructor.name}`).sort();
      const key = [material.id, o.castShadow, o.receiveShadow, o.layers.mask, o.renderOrder,
        o.frustumCulled, geo.index !== null, ...attrs].join('|');
      if (!batches.has(key)) batches.set(key, { meshes: [], geos: [] });
      const batch = batches.get(key);
      batch.meshes.push(o);
      batch.geos.push(geo.clone().applyMatrix4(relative)); // moves the normals correctly too
    };
    visit(root);
    for (const { meshes, geos } of batches.values()) {
      if (meshes.length < 2) continue; // nothing to gain
      const merged = mergeGeometries(geos);
      if (!merged) continue; // mergeGeometries logs why
      const first = meshes[0];
      const mesh = new THREE.Mesh(merged, first.material);
      mesh.castShadow = first.castShadow;
      mesh.receiveShadow = first.receiveShadow;
      mesh.layers.mask = first.layers.mask;
      mesh.renderOrder = first.renderOrder;
      mesh.frustumCulled = first.frustumCulled;
      mesh.userData.merged = true;
      mesh.userData.sources = meshes; // the hidden originals, for debugging
      root.add(mesh);
      for (const m of meshes) m.visible = false;
    }
  }
}
