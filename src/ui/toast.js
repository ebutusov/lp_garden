// ---- Toast ----
const toastEl = document.getElementById('toast');
let toastTimer = 0;
// Brief message at the top of the screen, e.g. when a mode changes.
export function showToast(text) {
  toastEl.textContent = text;
  toastEl.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toastEl.classList.remove('show'), 1600);
}
