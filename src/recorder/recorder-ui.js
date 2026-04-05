import { get, set } from './recorder-state.js';
import { on } from '../utils/event-bus.js';
import { startRecording, stopRecording } from './recorder-engine.js';
import { startPlayback, stopPlayback, isPlaying, sendAllNotesOff } from './playback-scheduler.js';
import { saveRecording, loadRecording } from './recorder-persistence.js';
import { getMidiAccess } from '../midi/midi-access.js';
import { quantize } from './quantize.js';
import { convertToPattern } from './recorder-to-sequencer.js';
import { pushHistory, undo, redo } from './recorder-history.js';

function el(id) { return document.getElementById(id); }

export function initRecorderUI() {
  const recordBtn   = el('rec-record-btn');
  const playBtn     = el('rec-play-btn');
  const stopBtn     = el('rec-stop-btn');
  const loopBtn     = el('rec-loop-btn');
  const clearBtn    = el('rec-clear-btn');
  const saveBtn     = el('rec-save-btn');
  const loadBtn     = el('rec-load-btn');
  const outputSel   = el('rec-output-select');
  const inputSel    = el('rec-input-select');
  const channelSel  = el('rec-channel-select');
  const durationEl  = el('rec-duration');
  const eventCountEl = el('rec-event-count');
  const nameInput   = el('rec-name-input');

  // ── Transport ──────────────────────────────────────────

  recordBtn.addEventListener('click', () => {
    const state = get();
    if (state.transport.mode === 'recording') {
      stopRecording();
    } else {
      if (state.transport.mode === 'playing') stopPlayback();
      startRecording();
    }
  });

  playBtn.addEventListener('click', () => {
    const state = get();
    if (!state.recording.events.length) return;
    if (state.transport.mode === 'recording') stopRecording();
    if (state.transport.mode === 'playing') {
      stopPlayback();
    } else {
      startPlayback();
    }
  });

  stopBtn.addEventListener('click', () => {
    const state = get();
    if (state.transport.mode === 'recording') stopRecording();
    else if (state.transport.mode === 'playing') stopPlayback();
    // Always send all notes off — clears any stuck notes regardless of mode
    sendAllNotesOff();
  });

  loopBtn.addEventListener('click', () => {
    const next = !get().transport.loop;
    set('transport.loop', next);
    loopBtn.classList.toggle('active', next);
  });

  clearBtn.addEventListener('click', () => {
    if (get().transport.mode !== 'idle') return;
    pushHistory();
    set('recording.events', []);
    set('recording.durationMs', 0);
    updateStats();
  });

  // ── Quantize ───────────────────────────────────────────
  const bpmInput       = el('rec-bpm-input');
  const gridSelect     = el('rec-grid-select');
  const strengthSlider = el('rec-strength-slider');
  const strengthVal    = el('rec-strength-val');
  const quantizeBtn    = el('rec-quantize-btn');

  strengthSlider.addEventListener('input', () => {
    strengthVal.textContent = strengthSlider.value + '%';
  });

  quantizeBtn.addEventListener('click', () => {
    if (get().transport.mode !== 'idle') return;
    pushHistory();
    const bpm         = Math.max(20, Math.min(300, parseInt(bpmInput.value, 10) || 120));
    const subdivision = parseInt(gridSelect.value, 10);
    const strength    = parseInt(strengthSlider.value, 10) / 100;
    quantize(bpm, subdivision, strength);
  });

  el('rec-send-btn').addEventListener('click', () => {
    const state = get();
    if (state.transport.mode !== 'idle') return;
    if (!state.recording.events.length) return;

    const bpm         = Math.max(20, Math.min(300, parseInt(bpmInput.value, 10) || 120));
    const subdivision = parseInt(gridSelect.value, 10);
    const data        = convertToPattern(state.recording.events, bpm, subdivision, state.recording.durationMs);

    data.targetScene = Math.max(1, parseInt(el('rec-send-scene')?.value, 10) || 1) - 1;
    data.targetTrack = Math.max(1, parseInt(el('rec-send-track')?.value, 10) || 1) - 1;

    localStorage.setItem('tessera_pending', JSON.stringify(data));
    window.location.href = 'index.html';
  });

  // ── Trim ───────────────────────────────────────────────
  el('rec-trim-btn').addEventListener('click', () => {
    const state = get();
    if (state.transport.mode !== 'idle') return;
    pushHistory();

    const duration = Math.max(0, state.recording.durationMs);
    const startMs  = state.trim.startMs ?? 0;
    const endMs    = state.trim.endMs   ?? duration;

    if (startMs <= 0 && endMs >= duration) return; // nothing to trim

    // Keep only events within [startMs, endMs], rebased so startMs → 0
    const trimmed = state.recording.events
      .filter(ev => ev.offsetMs >= startMs && ev.offsetMs <= endMs)
      .map(ev => ({ ...ev, offsetMs: ev.offsetMs - startMs }));

    set('recording.events',     trimmed);
    set('recording.durationMs', endMs - startMs);
    set('trim.startMs', 0);
    set('trim.endMs',   null);
  });

  // ── File ───────────────────────────────────────────────
  saveBtn.addEventListener('click', saveRecording);
  loadBtn.addEventListener('click', loadRecording);

  // ── Name ───────────────────────────────────────────────
  nameInput.value = get().recording.name;
  nameInput.addEventListener('change', () => set('recording.name', nameInput.value.trim() || 'Recording'));

  // ── MIDI ports ─────────────────────────────────────────
  function refreshPorts() {
    const state = get();

    outputSel.innerHTML = '<option value="">— No Output —</option>';
    state.midi.outputs.forEach(({ id, name }) => {
      const opt = document.createElement('option');
      opt.value = id; opt.textContent = name;
      outputSel.appendChild(opt);
    });
    outputSel.value = state.midi.outputId || '';

    inputSel.innerHTML = '<option value="">— No Input —</option>';
    state.midi.inputs.forEach(({ id, name }) => {
      const opt = document.createElement('option');
      opt.value = id; opt.textContent = name;
      inputSel.appendChild(opt);
    });
    inputSel.value = state.midi.inputId || '';
  }

  refreshPorts();

  outputSel.addEventListener('change', () => set('midi.outputId', outputSel.value || null));
  inputSel.addEventListener('change',  () => set('midi.inputId',  inputSel.value  || null));

  // Channel filter
  channelSel.innerHTML = '<option value="0">All channels</option>';
  for (let i = 1; i <= 16; i++) {
    const opt = document.createElement('option');
    opt.value = i; opt.textContent = `Ch ${i}`;
    channelSel.appendChild(opt);
  }
  channelSel.value = get().transport.channelFilter;
  channelSel.addEventListener('change', () => set('transport.channelFilter', parseInt(channelSel.value, 10)));

  // ── State listeners ─────────────────────────────────────
  on('recorderStateChange', ({ path }) => {
    if (path === 'midi.outputs' || path === 'midi.inputs') refreshPorts();
    if (path.startsWith('recording')) updateStats();
    if (path === 'transport.mode') updateTransportUI();
  });

  on('recorder:tick', ({ positionMs }) => {
    if (durationEl) durationEl.textContent = formatTime(positionMs);
  });

  on('recorder:recordingStarted', () => updateTransportUI());
  on('recorder:recordingStopped', ({ durationMs }) => {
    updateTransportUI();
    updateStats();
    if (durationEl) durationEl.textContent = formatTime(durationMs);
  });

  on('recorder:eventCaptured', () => updateStats());

  // Initial state
  updateTransportUI();
  updateStats();

  function updateTransportUI() {
    const mode = get().transport.mode;
    recordBtn.classList.toggle('active', mode === 'recording');
    recordBtn.style.color = mode === 'recording' ? 'var(--red)' : '';
    recordBtn.textContent = mode === 'recording' ? '⏹ Stop Rec' : '● Record';
    playBtn.classList.toggle('active', mode === 'playing');
    playBtn.textContent = mode === 'playing' ? '⏸ Pause' : '▶ Play';
  }

  function updateStats() {
    const state = get();
    if (eventCountEl) eventCountEl.textContent = `${state.recording.events.length} events`;
    if (durationEl && state.transport.mode === 'idle') {
      durationEl.textContent = formatTime(state.recording.durationMs);
    }
  }
}

function formatTime(ms) {
  if (!ms) return '0:00.000';
  const totalSec = ms / 1000;
  const min  = Math.floor(totalSec / 60);
  const sec  = Math.floor(totalSec % 60);
  const msec = Math.floor(ms % 1000);
  return `${min}:${String(sec).padStart(2,'0')}.${String(msec).padStart(3,'0')}`;
}
