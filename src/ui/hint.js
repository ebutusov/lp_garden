import { touch } from '../input/touch.js';

// ---- Action hint ("Press E to pet the dog") ----
const hintEl = document.getElementById('hint');
// What the E key would do: handed over by main.js.
let interaction, feeding;
export function initHint(deps) {
  ({ interaction, feeding } = deps);
}
export function updateHint() {
  const near = interaction.nearest();
  const action = near?.kind === 'gardener' ? 'greet the Gardener'
    : near?.kind === 'bell' ? (near.animal.busy ? '' : 'ring the bell')
    : near ? `pet the ${near.kind}`
    : feeding.target() !== null && feeding.pellets.length === 0 ? 'feed the koi' : '';
  const text = action ? `${touch.enabled ? 'Tap ✋' : 'Press E'} to ${action}` : '';
  // Only touch the DOM when the text changes: writing to it every frame forces work.
  if (hintEl.textContent !== text) {
    hintEl.textContent = text;
    hintEl.hidden = !text;
  }
}
