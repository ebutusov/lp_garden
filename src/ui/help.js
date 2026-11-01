// ---- Help screen: the start-up overlay, reopened with the ? button, H or Esc ----
// Pressing Esc releases the pointer lock, which shows this overlay (see pointerLock.js).
export const overlay = document.getElementById('overlay');

export const helpVisible = () => overlay.style.display !== 'none';
export function setHelpVisible(on) {
  overlay.style.display = on ? 'flex' : 'none';
}
export function showHelp() {
  if (document.pointerLockElement) document.exitPointerLock(); // the pointerlockchange handler then shows it
  setHelpVisible(true);
}
export function hideHelp() {
  setHelpVisible(false);
}
document.getElementById('help-btn').addEventListener('click', showHelp);
