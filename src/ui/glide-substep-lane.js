import { get, setStep } from '../state/state.js';
import { on } from '../utils/event-bus.js';

const COL_W = 24;
const LANE_H = 22;

let glideCanvas, glideCtx;
let substepCanvas, substepCtx;

export function initGlideSubstepLane(glideEl, substepEl) {
  glideCanvas = glideEl;
  glideCtx = glideCanvas.getContext('2d');
  substepCanvas = substepEl;
  substepCtx = substepCanvas.getContext('2d');

  resizeCanvases();
  render();

  glideCanvas.addEventListener('click', onGlideClick);
  substepCanvas.addEventListener('click', onSubstepClick);
  substepCanvas.addEventListener('contextmenu', onSubstepContext);

  on('stateChange', ({ path }) => {
    if (path.startsWith('pattern.steps')) render();
    if (path === 'transport.stepCount') { resizeCanvases(); render(); }
  });
}

function resizeCanvases() {
  const cols = get().transport.stepCount;
  [glideCanvas, substepCanvas].forEach(c => {
    c.width = cols * COL_W;
    c.height = LANE_H;
  });
}

function render() {
  const state = get();
  const cols = state.transport.stepCount;

  [glideCtx, substepCtx].forEach(ctx => {
    ctx.clearRect(0, 0, cols * COL_W, LANE_H);
  });

  for (let col = 0; col < cols; col++) {
    const step = state.pattern.steps[col];
    const x = col * COL_W;
    const hasNotes = step && step.notes.length > 0;

    // Glide cell
    glideCtx.fillStyle = step?.glide ? '#1a5c2a' : '#1a1a22';
    glideCtx.fillRect(x + 1, 1, COL_W - 2, LANE_H - 2);

    if (step?.glide) {
      glideCtx.fillStyle = '#00c853';
      glideCtx.fillRect(x + 1, 1, COL_W - 2, 3);
      glideCtx.fillStyle = '#00c853';
      glideCtx.font = '8px Inter,sans-serif';
      glideCtx.textAlign = 'center';
      glideCtx.fillText('G', x + COL_W / 2, LANE_H - 5);
    }

    // Substep cell
    const sub = step?.substeps ?? 1;
    substepCtx.fillStyle = sub > 1 ? '#4a3800' : '#1a1a22';
    substepCtx.fillRect(x + 1, 1, COL_W - 2, LANE_H - 2);

    if (sub > 1) {
      substepCtx.fillStyle = '#ffab00';
      substepCtx.fillRect(x + 1, 1, COL_W - 2, 3);
      substepCtx.fillStyle = '#ffab00';
      substepCtx.font = '8px Inter,sans-serif';
      substepCtx.textAlign = 'center';
      substepCtx.fillText(sub, x + COL_W / 2, LANE_H - 5);
    }
  }
}

function colFromEvent(canvas, e) {
  const rect = canvas.getBoundingClientRect();
  const x = e.clientX - rect.left;
  return Math.max(0, Math.min(get().transport.stepCount - 1, Math.floor(x / COL_W)));
}

function onGlideClick(e) {
  const col = colFromEvent(glideCanvas, e);
  const step = get().pattern.steps[col];
  if (step.substeps > 1) return; // can't glide while substeps active
  setStep(col, { glide: !step.glide });
}

function onSubstepClick(e) {
  const col = colFromEvent(substepCanvas, e);
  const step = get().pattern.steps[col];
  // Left click: cycle 1→2→3→4→1
  const next = (step.substeps % 4) + 1;
  setStep(col, { substeps: next });
}

function onSubstepContext(e) {
  e.preventDefault();
  const col = colFromEvent(substepCanvas, e);
  setStep(col, { substeps: 1 });
}
