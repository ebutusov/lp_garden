import { cameraGroup } from '../core/camera.js';
import { player } from '../core/state.js';
import { dog, petDog, DOG_PET_R } from './dog.js';
import { cats, petCat, CAT_PET_R } from './cats.js';
import { tryFeed } from './feeding.js';

// ---- Interacting with the animals ----
// The closest animal within petting reach: { kind: 'dog' | 'cat', cat? }, or null.
export function nearestPettable() {
  if (player.flyMode) return null;
  const p = cameraGroup.position;
  let best = null, bestD = Infinity;
  const dd = Math.hypot(p.x - dog.x, p.z - dog.z);
  if (dd < DOG_PET_R) { best = { kind: 'dog' }; bestD = dd; }
  for (const c of cats) {
    const d = Math.hypot(p.x - c.x, p.z - c.z);
    if (d < CAT_PET_R && d < bestD) { best = { kind: 'cat', cat: c }; bestD = d; }
  }
  return best;
}
// E / the touch button: pet whichever animal is closest, otherwise feed the koi.
export function tryInteract() {
  const pet = nearestPettable();
  if (pet?.kind === 'dog') { petDog(); return true; }
  if (pet?.kind === 'cat') { petCat(pet.cat); return true; }
  return tryFeed();
}
