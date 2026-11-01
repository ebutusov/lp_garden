import { renderer } from '../core/renderer.js';
import { setHelpVisible } from '../ui/help.js';

// ---- Pointer lock ----
// First-person mouse look needs the Pointer Lock API: it hides the cursor and reports
// raw mouse movement (movementX/Y) without the pointer ever hitting the screen edge.
let locked = false;
export const isPointerLocked = () => locked;

// Grab the mouse for looking around. Always call this, never requestPointerLock()
// directly: the browser may refuse (e.g. just after Esc, or without a real click),
// and then a later click simply tries again.
export function lockPointer() {
  try {
    const p = renderer.domElement.requestPointerLock();
    if (p && p.catch) p.catch(() => {});
  } catch { /* not allowed right now */ }
}

document.addEventListener('pointerlockchange', () => {
  locked = document.pointerLockElement === renderer.domElement;
  setHelpVisible(!locked);
});
