import { get, set, setStep } from '../state/state.js';
import { defaultStep } from '../state/defaults.js';

const FILE_VERSION = 1;

export function save() {
  const state = get();

  const data = {
    version: FILE_VERSION,
    transport: {
      bpm:        state.transport.bpm,
      swing:      state.transport.swing,
      gateLength: state.transport.gateLength,
      direction:  state.transport.direction,
      stepCount:  state.transport.stepCount,
      loopStart:  state.transport.loopStart,
      loopEnd:    state.transport.loopEnd,
      midiChannel: state.transport.midiChannel,
    },
    pitch: {
      scale:     state.pitch.scale,
      rootNote:  state.pitch.rootNote,
      transpose: state.pitch.transpose,
    },
    ccLane: {
      visible:  state.ccLane.visible,
      ccNumber: state.ccLane.ccNumber,
    },
    pattern: {
      name:  state.pattern.name,
      steps: state.pattern.steps.map(step => ({
        notes:       step.notes,
        velocity:    step.velocity,
        probability: step.probability,
        muted:       step.muted,
        glide:       step.glide,
        substeps:    step.substeps,
        cc:          step.cc,
      })),
    },
  };

  const json = JSON.stringify(data, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const url  = URL.createObjectURL(blob);

  const a = document.createElement('a');
  a.href = url;
  a.download = `${state.pattern.name.replace(/\s+/g, '_')}.tessera.json`;
  a.click();
  URL.revokeObjectURL(url);
}

export function load() {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.json,.tessera.json';

  input.addEventListener('change', () => {
    const file = input.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = JSON.parse(e.target.result);
        applyData(data);
      } catch (err) {
        alert('Failed to load file: ' + err.message);
      }
    };
    reader.readAsText(file);
  });

  input.click();
}

export function applyData(data) {
  if (!data.pattern?.steps) {
    alert('Invalid Tessera file.');
    return;
  }

  // Transport
  if (data.transport) {
    const t = data.transport;
    if (t.bpm        != null) set('transport.bpm',         t.bpm);
    if (t.swing      != null) set('transport.swing',       t.swing);
    if (t.gateLength != null) set('transport.gateLength',  t.gateLength);
    if (t.direction  != null) set('transport.direction',   t.direction);
    if (t.stepCount  != null) set('transport.stepCount',   t.stepCount);
    if (t.loopStart  != null) set('transport.loopStart',   t.loopStart);
    if (t.loopEnd    != null) set('transport.loopEnd',     t.loopEnd);
    if (t.midiChannel != null) set('transport.midiChannel', t.midiChannel);
  }

  // Pitch
  if (data.pitch) {
    const p = data.pitch;
    if (p.scale     != null) set('pitch.scale',     p.scale);
    if (p.rootNote  != null) set('pitch.rootNote',  p.rootNote);
    if (p.transpose != null) set('pitch.transpose', p.transpose);
  }

  // CC lane
  if (data.ccLane) {
    if (data.ccLane.visible  != null) set('ccLane.visible',  data.ccLane.visible);
    if (data.ccLane.ccNumber != null) set('ccLane.ccNumber', data.ccLane.ccNumber);
  }

  // Pattern name
  if (data.pattern.name) set('pattern.name', data.pattern.name);

  // Steps — merge with defaults so missing fields don't break anything
  const steps = data.pattern.steps;
  for (let i = 0; i < 64; i++) {
    const loaded = steps[i];
    if (loaded) {
      setStep(i, { ...defaultStep(), ...loaded });
    } else {
      setStep(i, defaultStep());
    }
  }

  // Sync controls UI to loaded state
  syncControlsUI();
}

function syncControlsUI() {
  const state = get();
  const t = state.transport;
  const p = state.pitch;

  const el = id => document.getElementById(id);

  const bpmDisplay = el('bpm-display');
  if (bpmDisplay) bpmDisplay.textContent = t.bpm;

  if (el('swing-slider'))       { el('swing-slider').value = t.swing; el('swing-val').textContent = t.swing + '%'; }
  if (el('gate-slider'))        { el('gate-slider').value = Math.round(t.gateLength * 100); el('gate-val').textContent = Math.round(t.gateLength * 100) + '%'; }
  if (el('step-count-input'))   el('step-count-input').value = t.stepCount;
  if (el('loop-start-input'))   el('loop-start-input').value = t.loopStart + 1;
  if (el('loop-end-input'))     el('loop-end-input').value   = t.loopEnd + 1;
  if (el('channel-input'))      el('channel-input').value    = t.midiChannel;
  if (el('scale-select'))       el('scale-select').value     = p.scale;
  if (el('root-select'))        el('root-select').value      = p.rootNote;
  if (el('transpose-input'))    el('transpose-input').value  = p.transpose;
  if (el('cc-toggle'))          el('cc-toggle').checked      = state.ccLane.visible;
  if (el('cc-number-input'))    el('cc-number-input').value  = state.ccLane.ccNumber;

  document.querySelectorAll('.dir-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.dir === t.direction);
  });
}
