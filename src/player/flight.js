import { player } from '../core/state.js';
import { showToast } from '../ui/toast.js';

// ---- Walk ↔ fly ----
const statusRef = document.getElementById('status');

export function updateStatus() {
  statusRef.textContent = `Mode: ${player.flyMode ? 'flight' : 'walk'}`;
  document.querySelector('[data-act="down"]').hidden = !player.flyMode; // touch "fly down" button
}
export function toggleFly() {
  player.flyMode = !player.flyMode;
  // Dropping out of flight: fall from wherever we are, no mid-air jump.
  player.verticalVel = 0;
  player.onGround = false;
  updateStatus();
  const touchUI = document.body.classList.contains('touch'); // set by touch.js
  const upDown = touchUI ? '⤒ / ⤓' : 'Space / C';
  showToast(player.flyMode ? `✈️ Flight mode · ${upDown} up·down` : '🚶 Walking');
}
