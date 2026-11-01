import { renderer } from '../core/renderer.js';
import { player } from '../core/state.js';
import { clampPitch } from '../player/look.js';
import { toggleFly } from '../player/flight.js';
import { interaction } from '../animals/interaction.js';
import { hideHelp, overlay } from '../ui/help.js';
import { keys } from './keys.js';

// ---- Touch controls: a fixed joystick (bottom right) moves; drag anywhere else to look ----
// Pointer Events unify mouse, pen and touch. Each finger gets its own pointerId, which
// is how the joystick finger and the look-around finger are told apart.
export const touch = { enabled: false, joyId: null, jx: 0, jy: 0, lookId: null, lookX: 0, lookY: 0 };
const touchUI = document.getElementById('touch-ui');
const joyBase = document.getElementById('joy-base');
const joyKnob = document.getElementById('joy-knob');
const JOY_R = 45; // how far the knob travels from the centre
function enableTouch() {
  if (touch.enabled) return;
  touch.enabled = true;
  document.body.classList.add('touch');
  touchUI.hidden = false;
}
document.addEventListener('pointerdown', (e) => { if (e.pointerType === 'touch') enableTouch(); }, true);
// Phones and tablets get the touch controls (and touch help) straight away.
if (window.matchMedia('(pointer: coarse)').matches) enableTouch();

// Touch: tap anywhere except a button to close the help. (With a mouse, the mousedown
// handler in keyboardMouse.js grabs the pointer instead.)
overlay.addEventListener('click', (e) => {
  if (touch.enabled && !e.target.closest('button')) hideHelp();
});

// The joystick reports a vector in -1..1 on each axis, clamped to a circle.
function moveJoy(e) {
  const r = joyBase.getBoundingClientRect();
  let dx = e.clientX - (r.left + r.width / 2), dy = e.clientY - (r.top + r.height / 2);
  const d = Math.hypot(dx, dy);
  if (d > JOY_R) { dx *= JOY_R / d; dy *= JOY_R / d; }
  touch.jx = dx / JOY_R; touch.jy = dy / JOY_R;
  joyKnob.style.transform = `translate(${dx}px, ${dy}px)`;
}
joyBase.addEventListener('pointerdown', (e) => {
  e.preventDefault();
  touch.joyId = e.pointerId;
  // Pointer capture keeps sending this finger's events here even when it slides off.
  try { joyBase.setPointerCapture(e.pointerId); } catch { /* pointer already gone */ }
  moveJoy(e);
});
joyBase.addEventListener('pointermove', (e) => { if (e.pointerId === touch.joyId) moveJoy(e); });
const endJoy = (e) => {
  if (e.pointerId !== touch.joyId) return;
  touch.joyId = null;
  touch.jx = touch.jy = 0;
  joyKnob.style.transform = '';
};
for (const ev of ['pointerup', 'pointercancel', 'lostpointercapture']) joyBase.addEventListener(ev, endJoy);

const canvasEl = renderer.domElement;
canvasEl.addEventListener('pointerdown', (e) => {
  if (e.pointerType !== 'touch' || touch.lookId !== null) return;
  Object.assign(touch, { lookId: e.pointerId, lookX: e.clientX, lookY: e.clientY });
  try { canvasEl.setPointerCapture(e.pointerId); } catch { /* pointer already gone */ }
});
canvasEl.addEventListener('pointermove', (e) => {
  if (e.pointerId !== touch.lookId) return;
  player.yaw -= (e.clientX - touch.lookX) * 0.006;
  player.pitch = clampPitch(player.pitch - (e.clientY - touch.lookY) * 0.006);
  touch.lookX = e.clientX; touch.lookY = e.clientY;
});
const endLook = (e) => { if (e.pointerId === touch.lookId) touch.lookId = null; };
canvasEl.addEventListener('pointerup', endLook);
canvasEl.addEventListener('pointercancel', endLook);

// Action buttons. Jump / down are held like the Space and C keys.
const HELD_KEY = { jump: ' ', down: 'c' };
for (const btn of touchUI.querySelectorAll('[data-act]')) {
  const act = btn.dataset.act;
  btn.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    if (HELD_KEY[act]) keys[HELD_KEY[act]] = true;
    else if (act === 'fly') toggleFly();
    else if (act === 'interact') interaction.tryInteract();
  });
  if (HELD_KEY[act]) {
    for (const ev of ['pointerup', 'pointerleave', 'pointercancel']) {
      btn.addEventListener(ev, () => { keys[HELD_KEY[act]] = false; });
    }
  }
}
