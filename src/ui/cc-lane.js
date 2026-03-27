import { get, set, setStep } from '../state/state.js';
import { on } from '../utils/event-bus.js';

const COL_W = 24;
const LANE_H = 64;

let canvas, ctx;
let dragging = false;

export function initCcLane(canvasEl) {
  canvas = canvasEl;
  ctx = canvas.getContext('2d');

  resizeCanvas();
  render();

  canvas.addEventListener('mousedown', onMouseDown);
  canvas.addEventListener('mousemove', onMouseMove);
  window.addEventListener('mouseup', () => { dragging = false; });

  on('stateChange', ({ path }) => {
    if (path.startsWith('pattern.steps') || path === 'ccLane.visible') render();
    if (path === 'transport.stepCount') { resizeCanvas(); render(); }
  });
}

function resizeCanvas() {
  const cols = get().transport.stepCount;
  canvas.width = cols * COL_W;
  canvas.height = LANE_H;
}

function render() {
  const state = get();
  const cols = state.transport.stepCount;
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  for (let col = 0; col < cols; col++) {
    const step = state.pattern.steps[col];
    const cc = step ? step.cc : null;
    const x = col * COL_W;

    ctx.fillStyle = '#1c1c24';
    ctx.fillRect(x + 1, 0, COL_W - 2, LANE_H);

    if (cc !== null) {
      const barH = Math.round((cc / 127) * (LANE_H - 4));
      ctx.fillStyle = '#00e5ff';
      ctx.fillRect(x + 3, LANE_H - barH - 2, COL_W - 6, barH);
    }
  }

  // Midline
  ctx.strokeStyle = '#ffffff15';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(0, LANE_H / 2);
  ctx.lineTo(canvas.width, LANE_H / 2);
  ctx.stroke();
}

function colFromEvent(e) {
  const rect = canvas.getBoundingClientRect();
  const x = e.clientX - rect.left;
  return Math.max(0, Math.min(get().transport.stepCount - 1, Math.floor(x / COL_W)));
}

function ccFromEvent(e) {
  const rect = canvas.getBoundingClientRect();
  const y = e.clientY - rect.top;
  return Math.max(0, Math.min(127, Math.round((1 - y / LANE_H) * 127)));
}

function onMouseDown(e) {
  dragging = true;
  const col = colFromEvent(e);
  const cc = e.shiftKey ? null : ccFromEvent(e); // Shift+click clears
  setStep(col, { cc });
}

function onMouseMove(e) {
  if (!dragging) return;
  const col = colFromEvent(e);
  setStep(col, { cc: ccFromEvent(e) });
}
