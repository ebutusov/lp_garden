import { nearestPettable } from '../animals/interaction.js';
import { feedTarget, pellets } from '../animals/feeding.js';
import { touch } from '../input/touch.js';

// ---- Action hint ("Press E to pet the dog") ----
const hintEl = document.getElementById('hint');
export function updateHint() {
  const pet = nearestPettable();
  const action = pet ? `pet the ${pet.kind}`
    : feedTarget() !== null && pellets.length === 0 ? 'feed the koi' : '';
  const text = action ? `${touch.enabled ? 'Tap ✋' : 'Press E'} to ${action}` : '';
  // Only touch the DOM when the text changes: writing to it every frame forces work.
  if (hintEl.textContent !== text) {
    hintEl.textContent = text;
    hintEl.hidden = !text;
  }
}
