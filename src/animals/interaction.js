import { cameraGroup } from '../core/camera.js';
import { player } from '../core/state.js';
import { Dog } from './dog.js';
import { Cats } from './cats.js';

// ---- Interacting with the animals ----
// One place decides what the E key (or the ✋ button) does, given the animals and the
// koi food it can act on.
export class Interaction {
  constructor({ dog, cats, feeding }) {
    Object.assign(this, { dog, cats, feeding });
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

  // Pet whichever animal is closest, otherwise feed the koi.
  tryInteract() {
    const pet = this.nearestPettable();
    if (pet) { pet.animal.pet(); return true; }
    return this.feeding.tryFeed();
  }
}
