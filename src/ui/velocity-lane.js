import { get, setStep } from '../state/state.js';
import { on } from '../utils/event-bus.js';

const COL_W = 24;
const LANE_H = 48;

let canvas, ctx;
let dragging = false;

export function initVelocityLane(canvasEl) {
  canvas = canvasEl;
  ctx = canvas.getContext('2d');

  resizeCanvas();
  render();

  canvas.addEventListener('mousedown', onMouseDown);
  canvas.addEventListener('mousemove', onMouseMove);
  window.addEventListener('mouseup', () => { dragging = false; });

  on('stateChange', ({ path }) => {
    if (path.startsWith('pattern.steps')) render();
    if (path === 'transport.stepCount') { resizeCanvas(); render(); }
  });

  on('sequencer:step', ({ step }) => renderPlayhead(step));
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
    const vel = step ? step.velocity : 0;
    const hasNotes = step && step.notes.length > 0;
    const barH = Math.round((vel / 127) * (LANE_H - 4));
    const x = col * COL_W;

    // Background
    ctx.fillStyle = '#1c1c24';
    ctx.fillRect(x + 1, 0, COL_W - 2, LANE_H);

    if (hasNotes) {
      ctx.fillStyle = step.muted ? '#44445a' : '#7c4dff';
      ctx.fillRect(x + 3, LANE_H - barH - 2, COL_W - 6, barH);
    }
  }
}

function renderPlayhead(step) {
  if (step < 0) return;
  render();
  const x = step * COL_W;
  ctx.fillStyle = 'rgba(124,77,255,0.2)';
  ctx.fillRect(x, 0, COL_W, LANE_H);
}

function colFromEvent(e) {
  const rect = canvas.getBoundingClientRect();
  const x = e.clientX - rect.left;
  return Math.floor(x / COL_W);
}

function velFromEvent(e) {
  const rect = canvas.getBoundingClientRect();
  const y = e.clientY - rect.top;
  return Math.max(1, Math.min(127, Math.round((1 - y / LANE_H) * 127)));
}

function onMouseDown(e) {
  dragging = true;
  const col = colFromEvent(e);
  const vel = velFromEvent(e);
  setStep(col, { velocity: vel });
}

function onMouseMove(e) {
  if (!dragging) return;
  const col = colFromEvent(e);
  const vel = velFromEvent(e);
  setStep(col, { velocity: vel });
}
