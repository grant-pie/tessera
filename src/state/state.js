import { emit } from '../utils/event-bus.js';
import { defaultPattern, defaultScene, defaultTrack } from './defaults.js';

let state = {
  transport: {
    playing: false,
    bpm: 120,
    swing: 0,
    gateLength: 0.5,
    direction: 'forward',
    clockSource: 'internal',
    midiChannel: 1,
    loopStart: 0,
    loopEnd: 63,
    stepCount: 64,
  },
  pitch: {
    scale: 'chromatic',
    rootNote: 60,
    transpose: 0,
  },
  cursor: {
    step: -1,
    subStep: 0,
    pingPongDir: 1,
  },
  pattern: defaultPattern(),
  ccLane: {
    visible: false,
    ccNumber: 74,
  },
  midi: {
    access: null,
    outputId: null,
    inputId: null,
    outputs: [],
    inputs: [],
  },
  ui: {
    selectedStep: null,
    gridScrollTop: 48, // start around middle C area (MIDI 48 = C3)
    viewRangeNotes: 24,
    activeNotes: new Set(),
  },
  tracks: [defaultTrack(0)],
  activeTrackIndex: 0,
  scenes: Array.from({ length: 8 }, (_, i) => defaultScene(i)),
  activeSceneIndex: 0,
  song: {
    enabled: false,
    entries: [],        // [{ sceneIndex: number, repeats: number }]
    activeEntry: 0,
    currentRepeat: 0,
    queuedSceneIndex: null,
  },
  // Phase 2 stubs
  patterns: [],
  history: [],
  clipboard: null,
};

export function get() {
  return state;
}

export function set(path, value) {
  const keys = path.split('.');
  const prev = getByPath(state, keys);

  let obj = state;
  for (let i = 0; i < keys.length - 1; i++) {
    obj = obj[keys[i]];
  }
  obj[keys[keys.length - 1]] = value;

  emit('stateChange', { path, prev, next: value });
}

export function getStep(index) {
  return state.pattern.steps[index];
}

export function setStep(index, partial) {
  const step = state.pattern.steps[index];
  const prev = { ...step };
  Object.assign(step, partial);

  // Enforce glide/substeps mutual exclusivity
  if (partial.substeps !== undefined && partial.substeps > 1) {
    step.glide = false;
  } else if (partial.glide === true) {
    step.substeps = 1;
  }

  emit('stateChange', { path: `pattern.steps.${index}`, prev, next: { ...step } });
}

export function getTransport() {
  return state.transport;
}

export function getPitch() {
  return state.pitch;
}

function getByPath(obj, keys) {
  return keys.reduce((o, k) => (o ? o[k] : undefined), obj);
}
