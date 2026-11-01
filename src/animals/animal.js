import * as THREE from 'three';
import { Feature } from '../world/feature.js';

// ---- Animal: the base class of the dog, the cats and the birds ----
// An animal is a Feature whose group is the root of its body: moving or turning the
// group carries the whole animal along. On top of that it keeps its logical position
// (x, z) apart from the meshes, and can have a collision circle (`solid`) that the
// player and the other animals bump into.
//
// The helpers here are the parts the animals have in common, written once:
// blob() builds body parts, blocked() asks whether a spot is off limits, and
// freeHeading() is the obstacle-avoiding "feeler" steering of the dog and the cats.

// Every body part is the same 20-faced low-poly "sphere", scaled into shape, so all
// of them share ONE geometry; only their transforms differ.
const blobGeo = new THREE.IcosahedronGeometry(1, 0);

export class Animal extends Feature {
  // `radius` > 0 gives the animal a collision circle `height` tall.
  constructor(ctx, { x = 0, z = 0, radius = 0, height = 0, parent } = {}) {
    super(ctx, { x, z, parent });
    this.x = x;
    this.z = z;
    this.radius = radius;
    this.solid = null;
    if (radius > 0) this.solid = ctx.physics.addCircleSolid(x, z, radius, height);
  }

  // A body part: a blob scaled to (sx, sy, sz) at (x, y, z) inside `parent`.
  blob(material, sx, sy, sz, x, y, z, parent = this.group, cast = true) {
    const mesh = new THREE.Mesh(blobGeo, material);
    mesh.scale.set(sx, sy, sz);
    mesh.position.set(x, y, z);
    mesh.castShadow = cast;
    parent.add(mesh);
    return mesh;
  }

  // Places this animal won't go (see groundBlocked in physics.js). Its own collision
  // circle doesn't count, or it would always be in its own way.
  blocked(x, z) {
    return this.ctx.physics.groundBlocked(x, z, this.radius, this.solid);
  }

  // Height of the ground it stands on at (x, z).
  groundAt(x, z) {
    return this.ctx.physics.surfaceHeightAt(x, z);
  }

  // "Feelers": probe a point `reach` ahead at each heading desired + offset, in the
  // order given, and return the first free one as { angle, off }, or null if every
  // direction is blocked. Far simpler than real path-finding, and good enough in an
  // open garden.
  freeHeading(desired, offsets, reach) {
    for (const off of offsets) {
      const angle = desired + off;
      if (!this.blocked(this.x + Math.sin(angle) * reach, this.z + Math.cos(angle) * reach)) return { angle, off };
    }
    return null;
  }

  // Move the collision circle to where the animal now is.
  syncSolid() {
    this.solid.x = this.x;
    this.solid.z = this.z;
  }
}
