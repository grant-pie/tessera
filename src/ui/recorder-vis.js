import { get, set } from '../recorder/recorder-state.js';
import { on } from '../utils/event-bus.js';
import { midiNoteToName, isBlackKey } from '../utils/math.js';
import { pushHistory } from '../recorder/recorder-history.js';

const MIN_DURATION_MS = 4000;
const HANDLE_HIT      = 12;  // px grab zone for trim handles
const HANDLE_W        = 8;

let bgCanvas, cursorCanvas;
let bgCtx, cursorCtx;
let rafId      = null;
let rafRunning = false;
let currentPositionMs = 0;

// Precomputed note rects for hit-testing — rebuilt on each drawBackground
// { noteOnIdx, noteOffIdx, x, y, w, h, note }
let noteRects = [];

// Trim drag state
let trimDragging = null; // 'start' | 'end'

// Note drag state
let noteDrag = null;
/*
  noteDrag = {
    noteOnIdx, noteOffIdx,
    origNoteOnMs, origNoteOffMs, origNote,
    startX, startY,
    snapDuration,              // getDuration() at drag start
    snapLoNote, snapHiNote,    // note range at drag start
    localEvents,               // mutable copy during drag
  }
*/

export function initRecorderVis(bgEl, cursorEl) {
  bgCanvas     = bgEl;
  cursorCanvas = cursorEl;
  bgCtx        = bgCanvas.getContext('2d');
  cursorCtx    = cursorCanvas.getContext('2d');

  cursorCanvas.style.pointerEvents = 'auto';
  cursorCanvas.style.cursor = 'default';

  resizeCanvases();
  drawBackground();
  drawOverlay();

  const ro = new ResizeObserver(() => { resizeCanvases(); drawBackground(); drawOverlay(); });
  ro.observe(bgCanvas.parentElement);

  on('recorderStateChange', ({ path }) => {
    if (path.startsWith('recording')) { resizeCanvases(); drawBackground(); drawOverlay(); }
    if (path.startsWith('trim'))      { drawOverlay(); }
  });
  on('recorder:eventCaptured',    () => drawBackground());
  on('recorder:tick', ({ positionMs }) => { currentPositionMs = positionMs; });
  on('recorder:playing',          () => startRaf());
  on('recorder:stopped',          () => stopRaf());
  on('recorder:recordingStarted', () => { drawBackground(); startRaf(); });
  on('recorder:recordingStopped', () => { stopRaf(); currentPositionMs = 0; drawOverlay(); });

  cursorCanvas.addEventListener('mousedown', onMouseDown);
  cursorCanvas.addEventListener('mousemove', onMouseMove);
  window.addEventListener('mouseup', onMouseUp);
}

// ── Resize ──────────────────────────────────────────────────

function resizeCanvases() {
  const container = bgCanvas.parentElement;
  const w = container.clientWidth  || 800;
  const h = container.clientHeight || 400;
  [bgCanvas, cursorCanvas].forEach(c => { c.width = w; c.height = h; });
}

function getDuration() {
  const state = get();
  const recEnd   = state.recording.durationMs;
  const outHandle = state.trim.endMs;
  const extended  = (outHandle != null && outHandle > recEnd) ? outHandle + 500 : 0;
  return Math.max(MIN_DURATION_MS, recEnd, extended);
}

function getTrimMs() {
  const state = get();
  return {
    startMs: state.trim.startMs ?? 0,
    endMs:   state.trim.endMs   ?? getDuration(),
  };
}

// ── Background + notes ──────────────────────────────────────

function drawBackground(eventsOverride) {
  const state    = get();
  const events   = eventsOverride ?? state.recording.events;
  const duration = getDuration();
  const w = bgCanvas.width;
  const h = bgCanvas.height;

  bgCtx.clearRect(0, 0, w, h);

  const { lo: loNote, hi: hiNote } = getNoteRange(events);
  const numRows = hiNote - loNote + 1;
  const rowH    = h / numRows;

  // Pitch rows
  for (let n = loNote; n <= hiNote; n++) {
    const y = noteToY(n, loNote, hiNote, h);
    bgCtx.fillStyle = isBlackKey(n) ? '#181820' : '#1e1e26';
    bgCtx.fillRect(0, y, w, rowH);

    const name = midiNoteToName(n);
    if (name.startsWith('C') && !name.includes('#')) {
      bgCtx.fillStyle = '#ffffff18';
      bgCtx.fillRect(0, y, w, 1);
      bgCtx.fillStyle = '#555566';
      bgCtx.font = '9px JetBrains Mono, monospace';
      bgCtx.textAlign = 'left';
      bgCtx.textBaseline = 'bottom';
      bgCtx.fillText(name, 4, y + rowH - 1);
    }
  }

  // Time grid
  const gridInterval = duration > 10000 ? 2000 : duration > 4000 ? 1000 : 500;
  bgCtx.strokeStyle = '#ffffff0a';
  bgCtx.lineWidth = 1;
  for (let t = gridInterval; t < duration; t += gridInterval) {
    const x = (t / duration) * w;
    bgCtx.beginPath(); bgCtx.moveTo(x, 0); bgCtx.lineTo(x, h); bgCtx.stroke();
    bgCtx.fillStyle = '#555566';
    bgCtx.font = '9px JetBrains Mono, monospace';
    bgCtx.textAlign = 'center'; bgCtx.textBaseline = 'top';
    bgCtx.fillText(formatTime(t), x, 2);
  }

  // Note bars + build noteRects for hit-testing
  noteRects = [];
  const activeNotes = new Map();

  for (let i = 0; i < events.length; i++) {
    const ev = events[i];
    if (ev.type === 'noteOn') {
      if (!activeNotes.has(ev.note)) activeNotes.set(ev.note, []);
      activeNotes.get(ev.note).push({ ev, idx: i });
    } else if (ev.type === 'noteOff') {
      const stack = activeNotes.get(ev.note);
      if (stack?.length > 0) {
        const { ev: onEv, idx: onIdx } = stack.shift();
        drawNoteBar(onEv, ev.offsetMs, duration, loNote, hiNote, w, h, rowH, onIdx, i);
      }
    }
  }
  for (const stack of activeNotes.values()) {
    for (const { ev: onEv, idx: onIdx } of stack) {
      drawNoteBar(onEv, duration, duration, loNote, hiNote, w, h, rowH, onIdx, -1);
    }
  }

  // CC ticks
  const ccH = Math.max(4, h * 0.04);
  for (const ev of events) {
    if (ev.type !== 'cc') continue;
    const x = (ev.offsetMs / duration) * w;
    bgCtx.fillStyle = `rgba(255,171,0,${0.4 + 0.6 * (ev.value / 127)})`;
    bgCtx.fillRect(x - 1, h - ccH, 2, ccH);
  }

  if (events.length === 0) {
    bgCtx.fillStyle = '#ffffff20';
    bgCtx.font = '14px Inter, system-ui, sans-serif';
    bgCtx.textAlign = 'center'; bgCtx.textBaseline = 'middle';
    bgCtx.fillText('Press Record then play your instrument', w / 2, h / 2);
  }
}

function drawNoteBar(noteOnEv, noteOffMs, duration, loNote, hiNote, w, h, rowH, noteOnIdx, noteOffIdx) {
  const x1   = (noteOnEv.offsetMs / duration) * w;
  const x2   = (noteOffMs / duration) * w;
  const barW = Math.max(2, x2 - x1 - 1);
  const y    = noteToY(noteOnEv.note, loNote, hiNote, h);
  const alpha = 0.5 + 0.5 * (noteOnEv.velocity / 127);

  bgCtx.fillStyle = `rgba(124,77,255,${alpha})`;
  bgCtx.fillRect(x1, y + 1, barW, rowH - 2);
  bgCtx.fillStyle = `rgba(163,112,255,${alpha})`;
  bgCtx.fillRect(x1, y + 1, barW, 2);

  // Store rect for hit-testing
  noteRects.push({ noteOnIdx, noteOffIdx, x: x1, y: y + 1, w: barW, h: rowH - 2 });
}

// ── Overlay: trim + cursor ──────────────────────────────────

function drawOverlay(eventsOverride) {
  cursorCtx.clearRect(0, 0, cursorCanvas.width, cursorCanvas.height);
  const state    = get();
  const duration = getDuration();
  const w        = cursorCanvas.width;
  const h        = cursorCanvas.height;
  const { startMs, endMs } = getTrimMs();

  const xStart = (startMs / duration) * w;
  const xEnd   = (endMs   / duration) * w;

  // Dim regions outside trim
  cursorCtx.fillStyle = 'rgba(0,0,0,0.45)';
  if (xStart > 0) cursorCtx.fillRect(0, 0, xStart, h);
  if (xEnd < w)   cursorCtx.fillRect(xEnd, 0, w - xEnd, h);

  // Trim region border
  cursorCtx.strokeStyle = '#ff3d0099';
  cursorCtx.lineWidth = 1;
  cursorCtx.strokeRect(xStart, 0, xEnd - xStart, h);

  // Handles
  drawHandle(xStart, h, 'start');
  drawHandle(xEnd,   h, 'end');

  // Recording end marker
  const recEndX = (state.recording.durationMs / duration) * w;
  if (recEndX > 0 && recEndX < w - 1) {
    cursorCtx.setLineDash([4, 4]);
    cursorCtx.strokeStyle = '#ffffff25';
    cursorCtx.lineWidth = 1;
    cursorCtx.beginPath();
    cursorCtx.moveTo(recEndX, 0); cursorCtx.lineTo(recEndX, h);
    cursorCtx.stroke();
    cursorCtx.setLineDash([]);
  }

  // Playback / record cursor
  const mode = state.transport.mode;
  let posMs = currentPositionMs;
  if (mode === 'recording' && state.recording.startedAt !== null) {
    posMs = performance.now() - state.recording.startedAt;
  }
  if (posMs > 0 || mode !== 'idle') {
    const cx = (posMs / duration) * w;
    cursorCtx.strokeStyle = mode === 'recording' ? '#ff3d00' : '#00e5ff';
    cursorCtx.lineWidth = 1.5;
    cursorCtx.beginPath(); cursorCtx.moveTo(cx, 0); cursorCtx.lineTo(cx, h); cursorCtx.stroke();
  }
}

function drawHandle(x, h, side) {
  const isStart = side === 'start';
  cursorCtx.fillStyle = '#ff3d00';
  cursorCtx.fillRect(isStart ? x : x - HANDLE_W, 0, HANDLE_W, h);

  cursorCtx.beginPath();
  const tabW = 14, tabH = 20;
  if (isStart) {
    cursorCtx.moveTo(x, 0); cursorCtx.lineTo(x + tabW, 0);
    cursorCtx.lineTo(x + tabW, tabH * 0.7); cursorCtx.lineTo(x, tabH);
  } else {
    cursorCtx.moveTo(x, 0); cursorCtx.lineTo(x - tabW, 0);
    cursorCtx.lineTo(x - tabW, tabH * 0.7); cursorCtx.lineTo(x, tabH);
  }
  cursorCtx.closePath();
  cursorCtx.fill();

  cursorCtx.fillStyle = '#fff';
  cursorCtx.font = 'bold 9px Inter, sans-serif';
  cursorCtx.textBaseline = 'top';
  cursorCtx.textAlign = isStart ? 'left' : 'right';
  cursorCtx.fillText(isStart ? 'IN' : 'OUT', isStart ? x + 2 : x - 2, 2);
}

// ── RAF ─────────────────────────────────────────────────────

function startRaf() {
  if (rafRunning) return;
  rafRunning = true;
  (function frame() {
    if (!rafRunning) return;
    drawOverlay();
    rafId = requestAnimationFrame(frame);
  })();
}

function stopRaf() {
  rafRunning = false;
  if (rafId) { cancelAnimationFrame(rafId); rafId = null; }
  drawOverlay();
}

// ── Mouse interaction ───────────────────────────────────────

function xToMs(x) {
  return (x / cursorCanvas.width) * getDuration();
}

function hitTrimHandle(x) {
  const { startMs, endMs } = getTrimMs();
  const duration = getDuration();
  const w        = cursorCanvas.width;
  if (Math.abs(x - (startMs / duration) * w) <= HANDLE_HIT) return 'start';
  if (Math.abs(x - (endMs   / duration) * w) <= HANDLE_HIT) return 'end';
  return null;
}

function hitNote(x, y) {
  for (let i = noteRects.length - 1; i >= 0; i--) {
    const r = noteRects[i];
    if (x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h) return r;
  }
  return null;
}

function onMouseDown(e) {
  const rect = cursorCanvas.getBoundingClientRect();
  const x    = e.clientX - rect.left;
  const y    = e.clientY - rect.top;

  // Trim handles take priority
  const trimHit = hitTrimHandle(x);
  if (trimHit) { trimDragging = trimHit; return; }

  // Note hit
  const nr = hitNote(x, y);
  if (!nr) return;

  const state    = get();
  const events   = state.recording.events;
  const { lo: loNote, hi: hiNote } = getNoteRange(events);

  noteDrag = {
    noteOnIdx:    nr.noteOnIdx,
    noteOffIdx:   nr.noteOffIdx,
    origNoteOnMs: events[nr.noteOnIdx].offsetMs,
    origNoteOffMs: nr.noteOffIdx >= 0 ? events[nr.noteOffIdx].offsetMs : null,
    origNote:     events[nr.noteOnIdx].note,
    startX: x,
    startY: y,
    snapDuration: getDuration(),
    snapLoNote:   loNote,
    snapHiNote:   hiNote,
    localEvents:  events.map(ev => ({ ...ev })), // mutable local copy
  };

  cursorCanvas.style.cursor = 'grabbing';
}

function onMouseMove(e) {
  const rect = cursorCanvas.getBoundingClientRect();
  const x    = e.clientX - rect.left;
  const y    = e.clientY - rect.top;

  // ── Trim handle drag ──
  if (trimDragging) {
    const { startMs, endMs } = getTrimMs();
    if (trimDragging === 'start') {
      const ms = Math.max(0, Math.min(endMs - 50, xToMs(x)));
      set('trim.startMs', ms);
    } else {
      const ms = Math.max(startMs + 50, xToMs(x));
      set('trim.endMs', ms);
    }
    return;
  }

  // ── Note drag ──
  if (noteDrag) {
    const { snapDuration, snapLoNote, snapHiNote, startX, startY,
            noteOnIdx, noteOffIdx, origNoteOnMs, origNoteOffMs, origNote,
            localEvents } = noteDrag;

    const w = cursorCanvas.width;
    const h = cursorCanvas.height;

    // Horizontal: time shift
    const dMs = ((x - startX) / w) * snapDuration;
    const noteDuration = origNoteOffMs != null ? origNoteOffMs - origNoteOnMs : 0;
    const newOnMs  = Math.max(0, origNoteOnMs + dMs);
    const newOffMs = origNoteOffMs != null ? newOnMs + noteDuration : null;

    // Vertical: pitch shift (each row = 1 semitone)
    const rowH   = h / (snapHiNote - snapLoNote + 1);
    const dNote  = -Math.round((y - startY) / rowH);
    const newNote = Math.max(0, Math.min(127, origNote + dNote));

    localEvents[noteOnIdx] = { ...localEvents[noteOnIdx], offsetMs: newOnMs, note: newNote };
    if (noteOffIdx >= 0 && newOffMs != null) {
      localEvents[noteOffIdx] = { ...localEvents[noteOffIdx], offsetMs: newOffMs, note: newNote };
    }

    // Redraw with local copy — no state update yet
    drawBackground(localEvents);
    drawOverlay();
    return;
  }

  // ── Cursor style ──
  const trimHit = hitTrimHandle(x);
  if (trimHit) {
    cursorCanvas.style.cursor = 'ew-resize';
  } else if (hitNote(x, y)) {
    cursorCanvas.style.cursor = 'grab';
  } else {
    cursorCanvas.style.cursor = 'default';
  }
}

function onMouseUp() {
  trimDragging = null;

  if (noteDrag) {
    // Commit localEvents to state, sorted by offsetMs
    pushHistory();
    const sorted = noteDrag.localEvents.slice().sort((a, b) => a.offsetMs - b.offsetMs);
    set('recording.events', sorted);
    noteDrag = null;
    cursorCanvas.style.cursor = 'default';
  }
}

// ── Helpers ─────────────────────────────────────────────────

function noteToY(note, loNote, hiNote, h) {
  const rowH = h / (hiNote - loNote + 1);
  return (hiNote - note) * rowH;
}

function getNoteRange(events) {
  const noteEvents = events.filter(e => e.type === 'noteOn' || e.type === 'noteOff');
  if (!noteEvents.length) return { lo: 36, hi: 84 };
  const notes = noteEvents.map(e => e.note);
  return {
    lo: Math.max(0,   Math.min(...notes) - 4),
    hi: Math.min(127, Math.max(...notes) + 4),
  };
}

function formatTime(ms) {
  const s = Math.floor(ms / 1000);
  const min = Math.floor(s / 60);
  const sec = s % 60;
  return min > 0 ? `${min}:${String(sec).padStart(2,'0')}` : `${sec}s`;
}
