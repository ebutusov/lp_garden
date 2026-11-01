import { player } from '../core/state.js';

// ---- HUD compass ----
// A plain 2D canvas over the 3D view, redrawn every frame from the player's yaw.
const compassCanvas = document.getElementById('compass-canvas');
const compassCtx = compassCanvas.getContext('2d');
export function drawCompass() {
  const w = compassCanvas.width, h = compassCanvas.height, cx = w / 2, cy = h / 2, r = 34;
  compassCtx.clearRect(0, 0, w, h);
  compassCtx.strokeStyle = 'rgba(0,0,0,0.15)';
  compassCtx.lineWidth = 2;
  compassCtx.beginPath(); compassCtx.arc(cx, cy, r, 0, Math.PI * 2); compassCtx.stroke();
  compassCtx.fillStyle = '#e74c3c';
  compassCtx.save();
  compassCtx.translate(cx, cy);
  compassCtx.rotate(player.yaw);
  // North pointer (N = -Z, toward Mt. Fuji; the initial view faces north)
  compassCtx.beginPath();
  compassCtx.moveTo(0, -r + 4);
  compassCtx.lineTo(-6, 4); compassCtx.lineTo(6, 4);
  compassCtx.closePath();
  compassCtx.fill();
  compassCtx.fillStyle = '#233';
  compassCtx.font = '12px system-ui';
  compassCtx.textAlign = 'center';
  compassCtx.fillText('N', 0, -r + 16);
  compassCtx.restore();
}
