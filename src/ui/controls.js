import { get, set } from '../state/state.js';
import { on } from '../utils/event-bus.js';
import { SCALE_NAMES } from '../engine/scale.js';
import * as clock from '../clock/clock.js';
import { getInput } from '../midi/midi-access.js';
import { BUILTIN_ID, PRESET_NAMES, setPreset, getPreset } from '../audio/factory-sound-engine.js';

const NOTE_NAMES = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'];

// Use document.getElementById so elements can live in any container
function el(id) { return document.getElementById(id); }

export function initControls() {
  const state = get();

  // ── Direction ──────────────────────────────────────────
  const dirBtns = document.querySelectorAll('.dir-btn');
  dirBtns.forEach(btn => {
    btn.classList.toggle('active', btn.dataset.dir === state.transport.direction);
    btn.addEventListener('click', () => {
      set('transport.direction', btn.dataset.dir);
      dirBtns.forEach(b => b.classList.toggle('active', b.dataset.dir === btn.dataset.dir));
    });
  });

  // ── Swing ──────────────────────────────────────────────
  el('swing-slider').value = state.transport.swing;
  el('swing-val').textContent = state.transport.swing + '%';
  el('swing-slider').addEventListener('input', () => {
    const v = parseInt(el('swing-slider').value, 10);
    el('swing-val').textContent = v + '%';
    set('transport.swing', v);
    clock.setSwing(v);
  });

  // ── Gate ───────────────────────────────────────────────
  el('gate-slider').value = Math.round(state.transport.gateLength * 100);
  el('gate-val').textContent = Math.round(state.transport.gateLength * 100) + '%';
  el('gate-slider').addEventListener('input', () => {
    const v = parseInt(el('gate-slider').value, 10);
    el('gate-val').textContent = v + '%';
    set('transport.gateLength', v / 100);
  });

  // ── Scale ──────────────────────────────────────────────
  Object.entries(SCALE_NAMES).forEach(([key, name]) => {
    const opt = document.createElement('option');
    opt.value = key; opt.textContent = name;
    el('scale-select').appendChild(opt);
  });
  el('scale-select').value = state.pitch.scale;
  el('scale-select').addEventListener('change', () => set('pitch.scale', el('scale-select').value));

  // ── Root note ──────────────────────────────────────────
  NOTE_NAMES.forEach((name, i) => {
    const opt = document.createElement('option');
    opt.value = 60 + i; // C4=60 as baseline
    opt.textContent = name;
    el('root-select').appendChild(opt);
  });
  el('root-select').value = state.pitch.rootNote;
  el('root-select').addEventListener('change', () => {
    set('pitch.rootNote', parseInt(el('root-select').value, 10));
  });

  // ── Transpose ──────────────────────────────────────────
  el('transpose-input').value = state.pitch.transpose;
  el('transpose-input').addEventListener('change', () => {
    set('pitch.transpose', Math.max(-24, Math.min(24, parseInt(el('transpose-input').value, 10) || 0)));
  });

  // ── Channel ────────────────────────────────────────────
  el('channel-input').value = state.transport.midiChannel;
  el('channel-input').addEventListener('change', () => {
    set('transport.midiChannel', Math.max(1, Math.min(16, parseInt(el('channel-input').value, 10) || 1)));
  });

  // ── Step count ─────────────────────────────────────────
  el('step-count-input').value = state.transport.stepCount;
  el('step-count-input').addEventListener('change', () => {
    const v = Math.max(1, Math.min(64, parseInt(el('step-count-input').value, 10) || 16));
    set('transport.stepCount', v);
    clock.setStepCount(v);
    if (get().transport.loopEnd >= v) {
      set('transport.loopEnd', v - 1);
      el('loop-end-input').value = v;
    }
  });

  // ── Loop markers ───────────────────────────────────────
  el('loop-start-input').value = state.transport.loopStart + 1;
  el('loop-end-input').value   = state.transport.loopEnd + 1;

  el('loop-start-input').addEventListener('change', () => {
    const v = Math.max(1, Math.min(get().transport.stepCount, parseInt(el('loop-start-input').value, 10) || 1));
    el('loop-start-input').value = v;
    set('transport.loopStart', v - 1);
  });

  el('loop-end-input').addEventListener('change', () => {
    const v = Math.max(1, Math.min(get().transport.stepCount, parseInt(el('loop-end-input').value, 10) || 1));
    el('loop-end-input').value = v;
    set('transport.loopEnd', v - 1);
  });

  // ── MIDI ports ─────────────────────────────────────────
  function refreshPorts() {
    const s = get();

    const outputSelect = el('output-select');
    outputSelect.innerHTML = '<option value="">— No Output —</option>';
    s.midi.outputs.forEach(({ id, name }) => {
      const opt = document.createElement('option');
      opt.value = id; opt.textContent = name;
      outputSelect.appendChild(opt);
    });
    outputSelect.value = s.midi.outputId || '';

    updateSynthPresetVisibility(s.midi.outputId);

    const inputSelect = el('input-select');
    inputSelect.innerHTML = '<option value="">— No Input —</option>';
    s.midi.inputs.forEach(({ id, name }) => {
      const opt = document.createElement('option');
      opt.value = id; opt.textContent = name;
      inputSelect.appendChild(opt);
    });
    inputSelect.value = s.midi.inputId || '';
  }

  function updateSynthPresetVisibility(outputId) {
    const group = el('synth-preset-group');
    if (group) group.style.display = outputId === BUILTIN_ID ? '' : 'none';
  }

  // ── Synth preset selector ──────────────────────────────
  const presetSelect = el('synth-preset-select');
  if (presetSelect) {
    PRESET_NAMES.forEach(({ id, label }) => {
      const opt = document.createElement('option');
      opt.value = id; opt.textContent = label;
      presetSelect.appendChild(opt);
    });
    presetSelect.value = getPreset();
    presetSelect.addEventListener('change', () => setPreset(presetSelect.value));
  }

  refreshPorts();

  el('output-select').addEventListener('change', () => {
    const val = el('output-select').value || null;
    set('midi.outputId', val);
    updateSynthPresetVisibility(val);
  });

  el('input-select').addEventListener('change', () => {
    set('midi.inputId', el('input-select').value || null);
    if (get().transport.clockSource === 'external') {
      clock.setSource('external', getInput());
    }
  });

  on('stateChange', ({ path }) => {
    if (path === 'midi.outputs' || path === 'midi.inputs') refreshPorts();
  });

  // ── CC lane ────────────────────────────────────────────
  el('cc-toggle').checked = state.ccLane.visible;
  el('cc-toggle').addEventListener('change', () => set('ccLane.visible', el('cc-toggle').checked));

  el('cc-number-input').value = state.ccLane.ccNumber;
  el('cc-number-input').addEventListener('change', () => {
    set('ccLane.ccNumber', Math.max(0, Math.min(127, parseInt(el('cc-number-input').value, 10) || 74)));
  });

  on('stateChange', ({ path }) => {
    if (path === 'ccLane.visible') {
      const row = el('cc-lane-row');
      if (row) row.style.display = get().ccLane.visible ? 'flex' : 'none';
    }
  });

  // ── Randomize panel trigger ─────────────────────────────
  el('randomize-btn').addEventListener('click', () => {
    el('randomize-panel').classList.add('open');
    el('overlay').classList.add('open');
  });
}
