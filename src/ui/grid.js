import { get, set, setStep, getStep } from '../state/state.js';
import { on, emit } from '../utils/event-bus.js';
import { isBlackKey, midiNoteToName } from '../utils/math.js';
import { isInScale } from '../engine/scale.js';

const ROW_H = 20;   // px per note row
const COL_W = 24;   // px per step column
const HEADER_H = 18; // step number row

let bgCanvas, contentCanvas, playheadCanvas;
let bgCtx, contentCtx, phCtx;
let wrapper;
let isDirty = false;
let rafId = null;

let paintMode = null; // 'add' | 'remove'
let lastPaintCell = null;

export function initGrid(wrapperEl) {
  wrapper = wrapperEl;

  bgCanvas = wrapper.querySelector('#canvas-bg');
  contentCanvas = wrapper.querySelector('#canvas-content');
  playheadCanvas = wrapper.querySelector('#canvas-playhead');

  bgCtx = bgCanvas.getContext('2d');
  contentCtx = contentCanvas.getContext('2d');
  phCtx = playheadCanvas.getContext('2d');

  // Sync viewRangeNotes to available height
  syncViewRange();
  resizeCanvases();
  renderAll();

  contentCanvas.addEventListener('mousedown', onMouseDown);
  contentCanvas.addEventListener('mousemove', onMouseMove);
  window.addEventListener('mouseup', onMouseUp);

  wrapper.addEventListener('wheel', onWheel, { passive: true });

  const ro = new ResizeObserver(() => {
    syncViewRange();
    resizeCanvases();
    renderAll();
  });
  // wrapper.parentElement = #lanes-scroll; its parent = #grid-area
  const gridAreaEl = wrapper.parentElement?.parentElement;
  if (gridAreaEl) ro.observe(gridAreaEl);

  window.addEventListener('resize', () => {
    syncViewRange();
    resizeCanvases();
    renderAll();
  });

  on('stateChange', ({ path }) => {
    if (path.startsWith('pattern.steps') || path.startsWith('pitch')) {
      scheduleDraw();
    }
    if (path.startsWith('transport.loop') || path === 'transport.direction') {
      renderBg();
    }
    if (path === 'ui.gridScrollTop' || path === 'ui.viewRangeNotes') {
      resizeCanvases();
      renderAll();
    }
    if (path === 'transport.stepCount') {
      resizeCanvases();
      renderAll();
    }
  });

  on('sequencer:step', ({ step }) => {
    renderPlayhead(step);
  });
}

function syncViewRange() {
  // wrapper is #grid-canvas-container, its parent is #lanes-scroll
  // We measure #grid-area height minus bottom lanes to get the piano roll height
  const lanesScroll = wrapper.parentElement;
  if (!lanesScroll) return;
  const gridArea = lanesScroll.parentElement;
  if (!gridArea) return;

  // Bottom lanes height
  const laneRows = lanesScroll.querySelectorAll('.lane-row');
  let lanesH = 0;
  laneRows.forEach(r => { lanesH += r.offsetHeight; });

  const availH = Math.max(80, gridArea.clientHeight - lanesH);
  const rows = Math.max(4, Math.floor(availH / ROW_H));
  if (rows !== get().ui.viewRangeNotes) {
    set('ui.viewRangeNotes', rows);
  }
}

function resizeCanvases() {
  const state = get();
  const cols = state.transport.stepCount;
  const rows = state.ui.viewRangeNotes;

  const w = cols * COL_W;
  const h = rows * ROW_H;

  [bgCanvas, contentCanvas, playheadCanvas].forEach(c => {
    c.width = w;
    c.height = h;
    c.style.width = w + 'px';
    c.style.height = h + 'px';
  });

  const container = bgCanvas.parentElement;
  container.style.width = w + 'px';
  container.style.height = h + 'px';
}

function renderAll() {
  renderBg();
  renderContent();
  renderPlayhead(get().cursor.step);
}

function scheduleDraw() {
  if (isDirty) return;
  isDirty = true;
  rafId = requestAnimationFrame(() => {
    isDirty = false;
    renderContent();
  });
}

function renderBg() {
  const state = get();
  const cols = state.transport.stepCount;
  const rows = state.ui.viewRangeNotes;
  const { gridScrollTop } = state.ui;
  const { scale, rootNote } = state.pitch;

  bgCtx.clearRect(0, 0, bgCanvas.width, bgCanvas.height);

  for (let row = 0; row < rows; row++) {
    const midiNote = gridScrollTop + rows - 1 - row;
    const y = row * ROW_H;
    const black = isBlackKey(midiNote);
    const inScale = isInScale(midiNote, rootNote, scale);

    // Row background
    if (black) {
      bgCtx.fillStyle = inScale ? '#1c1c24' : '#181820';
    } else {
      bgCtx.fillStyle = inScale ? '#222232' : '#1e1e26';
    }
    bgCtx.fillRect(0, y, bgCanvas.width, ROW_H);

    // C note line
    const name = midiNoteToName(midiNote);
    if (name.startsWith('C') && !name.includes('#')) {
      bgCtx.fillStyle = '#ffffff10';
      bgCtx.fillRect(0, y, bgCanvas.width, 1);
    }
  }

  // Vertical grid lines & beat highlights
  for (let col = 0; col < cols; col++) {
    const x = col * COL_W;
    const isBeat = col % 4 === 0;
    const isMeasure = col % 16 === 0;

    if (isMeasure) {
      bgCtx.fillStyle = '#ffffff12';
      bgCtx.fillRect(x, 0, COL_W, bgCanvas.height);
    } else if (isBeat) {
      bgCtx.fillStyle = '#ffffff08';
      bgCtx.fillRect(x, 0, COL_W, bgCanvas.height);
    }

    bgCtx.strokeStyle = '#ffffff08';
    bgCtx.lineWidth = 1;
    bgCtx.beginPath();
    bgCtx.moveTo(x, 0);
    bgCtx.lineTo(x, bgCanvas.height);
    bgCtx.stroke();
  }

  // Loop markers
  drawLoopMarkers(bgCtx, state);
}

function drawLoopMarkers(ctx, state) {
  const lo = state.transport.loopStart;
  const hi = state.transport.loopEnd;

  ctx.strokeStyle = '#ff3d00';
  ctx.lineWidth = 2;

  // Start marker
  ctx.beginPath();
  ctx.moveTo(lo * COL_W + 1, 0);
  ctx.lineTo(lo * COL_W + 1, bgCanvas.height);
  ctx.stroke();

  // End marker
  ctx.beginPath();
  ctx.moveTo((hi + 1) * COL_W - 1, 0);
  ctx.lineTo((hi + 1) * COL_W - 1, bgCanvas.height);
  ctx.stroke();
}

function renderContent() {
  const state = get();
  const cols = state.transport.stepCount;
  const rows = state.ui.viewRangeNotes;
  const { gridScrollTop } = state.ui;

  contentCtx.clearRect(0, 0, contentCanvas.width, contentCanvas.height);

  for (let col = 0; col < cols; col++) {
    const step = state.pattern.steps[col];
    if (!step || step.notes.length === 0) continue;

    const x = col * COL_W;

    for (const note of step.notes) {
      const row = gridScrollTop + rows - 1 - note;
      if (row < 0 || row >= rows) continue;

      const y = row * ROW_H;

      // Cell fill
      if (step.muted) {
        contentCtx.fillStyle = '#3a3a44';
      } else if (step.glide) {
        contentCtx.fillStyle = '#1a5c2a';
      } else {
        contentCtx.fillStyle = '#5a2db0';
      }
      contentCtx.fillRect(x + 1, y + 1, COL_W - 2, ROW_H - 2);

      // Bright top edge
      contentCtx.fillStyle = step.muted ? '#555566' : (step.glide ? '#00c853' : '#9060f0');
      contentCtx.fillRect(x + 1, y + 1, COL_W - 2, 2);
    }
  }
}

function renderPlayhead(step) {
  phCtx.clearRect(0, 0, playheadCanvas.width, playheadCanvas.height);
  if (step < 0) return;

  const x = step * COL_W;
  phCtx.fillStyle = 'rgba(124, 77, 255, 0.18)';
  phCtx.fillRect(x, 0, COL_W, playheadCanvas.height);

  phCtx.strokeStyle = 'rgba(163, 112, 255, 0.6)';
  phCtx.lineWidth = 1;
  phCtx.beginPath();
  phCtx.moveTo(x, 0);
  phCtx.lineTo(x, playheadCanvas.height);
  phCtx.stroke();
}

// ── Input handling ─────────────────────────────────────────────────────

function cellFromEvent(e) {
  const rect = contentCanvas.getBoundingClientRect();
  const x = e.clientX - rect.left;
  const y = e.clientY - rect.top;
  const col = Math.floor(x / COL_W);
  const row = Math.floor(y / ROW_H);
  const state = get();
  const midiNote = state.ui.gridScrollTop + state.ui.viewRangeNotes - 1 - row;
  return { col, row, midiNote };
}

function onMouseDown(e) {
  const { col, midiNote } = cellFromEvent(e);
  const state = get();
  const step = state.pattern.steps[col];

  if (!step) return;

  e.preventDefault();

  if (e.altKey) {
    // Alt+click: open step editor
    set('ui.selectedStep', col);
    emit('ui:openStepEditor', { step: col });
    return;
  }

  const hasNote = step.notes.includes(midiNote);
  paintMode = hasNote ? 'remove' : 'add';
  lastPaintCell = `${col}-${midiNote}`;

  toggleNote(col, midiNote, paintMode);
}

function onMouseMove(e) {
  if (!paintMode) return;

  const { col, midiNote } = cellFromEvent(e);
  const key = `${col}-${midiNote}`;
  if (key === lastPaintCell) return;
  lastPaintCell = key;

  toggleNote(col, midiNote, paintMode);
}

function onMouseUp() {
  paintMode = null;
  lastPaintCell = null;
}

function onWheel(e) {
  const state = get();
  const delta = e.deltaY > 0 ? -1 : 1;
  const newScroll = Math.max(0, Math.min(127 - state.ui.viewRangeNotes + 1, state.ui.gridScrollTop + delta));
  if (newScroll !== state.ui.gridScrollTop) {
    set('ui.gridScrollTop', newScroll);
  }
}

function toggleNote(col, midiNote, mode) {
  const step = getStep(col);
  if (!step) return;

  const notes = [...step.notes];

  if (mode === 'add') {
    if (!notes.includes(midiNote)) notes.push(midiNote);
  } else {
    const idx = notes.indexOf(midiNote);
    if (idx !== -1) notes.splice(idx, 1);
  }

  setStep(col, { notes });
}
