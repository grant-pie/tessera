import { emit } from '../utils/event-bus.js';

let state = {
  transport: {
    mode: 'idle',       // 'idle' | 'recording' | 'playing'
    loop: false,
    channelFilter: 0,   // 0 = all, 1-16 = specific channel
  },
  midi: {
    access: null,
    outputId: null,
    inputId: null,
    outputs: [],
    inputs: [],
  },
  recording: {
    events: [],         // RecordedEvent[]
    durationMs: 0,
    startedAt: null,    // performance.now() at record start, null when stopped
    name: 'Recording 1',
  },
  playback: {
    positionMs: 0,
  },
  trim: {
    startMs: 0,
    endMs: null, // null = full duration
  },
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

  emit('recorderStateChange', { path, prev, next: value });
}

function getByPath(obj, keys) {
  return keys.reduce((o, k) => (o ? o[k] : undefined), obj);
}
