import { cameraGroup } from '../core/camera.js';
import { player } from '../core/state.js';
import { Dog } from './dog.js';
import { Cats } from './cats.js';
import { Gardener } from '../people/gardener.js';

// ---- Interacting with the animals (and the Gardener, and the bell) ----
// One place decides what the E key (or the ✋ button) does, given the animals, the
// Gardener, the temple bell and the koi food it can act on.
export class Interaction {
  constructor({ dog, cats, feeding, gardener, bell }) {
    Object.assign(this, { dog, cats, feeding, gardener, bell });
  }

  // The closest animal within petting reach: { kind: 'dog' | 'cat', animal }, or null.
  nearestPettable() {
    if (player.flyMode) return null;
    const p = cameraGroup.position;
    let best = null, bestD = Infinity;
    const dd = Math.hypot(p.x - this.dog.x, p.z - this.dog.z);
    if (dd < Dog.PET_R) { best = { kind: 'dog', animal: this.dog }; bestD = dd; }
    for (const c of this.cats.list) {
      const d = Math.hypot(p.x - c.x, p.z - c.z);
      if (d < Cats.PET_R && d < bestD) { best = { kind: 'cat', animal: c }; bestD = d; }
    }
    return best;
  }

  // Whoever the E key would act on: the nearest pettable animal or the Gardener,
  // whichever is closer, else the bell if it's in reach.
  // { kind: 'dog' | 'cat' | 'gardener' | 'bell', animal }, or null.
  nearest() {
    if (player.flyMode) return null;
    return this.nearestBeing() ?? (this.bell.inReach(cameraGroup.position.x, cameraGroup.position.z)
      ? { kind: 'bell', animal: this.bell } : null);
  }

  nearestBeing() {
    const pet = this.nearestPettable();
    const p = cameraGroup.position, g = this.gardener;
    const dg = Math.hypot(p.x - g.x, p.z - g.z);
    if (dg >= Gardener.GREET_R) return pet;
    if (pet && Math.hypot(p.x - pet.animal.x, p.z - pet.animal.z) < dg) return pet;
    return { kind: 'gardener', animal: g };
  }

  // Greet the Gardener, pet whichever animal is closest or ring the bell, otherwise
  // feed the koi.
  tryInteract() {
    const near = this.nearest();
    if (near?.kind === 'gardener') { near.animal.greet(); return true; }
    if (near?.kind === 'bell') return near.animal.ring();
    if (near) { near.animal.pet(); return true; }
    return this.feeding.tryFeed();
  }
}
