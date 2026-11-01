// ---- Held keys ----
// Which keys are down right now, by lower-case `KeyboardEvent.key` (' ' is Space).
// Movement polls this every frame instead of reacting to individual key events, so
// motion is smooth and doesn't depend on the keyboard's auto-repeat rate.
// The touch buttons write into it too (see touch.js).
export const keys = {};
// Keyup never arrives if focus leaves mid-press, so release everything.
window.addEventListener('blur', () => { for (const k in keys) keys[k] = false; });
