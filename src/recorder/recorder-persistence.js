import { get, set } from './recorder-state.js';
import { emit } from '../utils/event-bus.js';

const FILE_VERSION = 1;
const FILE_TYPE    = 'tessera-recording';

export function saveRecording() {
  const state = get();

  if (!state.recording.events.length) {
    alert('Nothing recorded yet.');
    return;
  }

  const data = {
    version:    FILE_VERSION,
    type:       FILE_TYPE,
    name:       state.recording.name,
    durationMs: state.recording.durationMs,
    events:     state.recording.events,
  };

  const json = JSON.stringify(data, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const url  = URL.createObjectURL(blob);

  const a = document.createElement('a');
  a.href     = url;
  a.download = `${state.recording.name.replace(/\s+/g, '_')}.tessera-rec.json`;
  a.click();
  URL.revokeObjectURL(url);
}

export function loadRecording() {
  const input = document.createElement('input');
  input.type   = 'file';
  input.accept = '.json,.tessera-rec.json';

  input.addEventListener('change', () => {
    const file = input.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = JSON.parse(e.target.result);
        applyRecording(data);
      } catch (err) {
        alert('Failed to load recording: ' + err.message);
      }
    };
    reader.readAsText(file);
  });

  input.click();
}

function applyRecording(data) {
  if (data.type !== FILE_TYPE || !Array.isArray(data.events)) {
    alert('Not a valid Tessera recording file.');
    return;
  }

  set('recording.events',    data.events);
  set('recording.durationMs', data.durationMs ?? 0);
  set('recording.name',       data.name ?? 'Recording');

  emit('recorderStateChange', { path: 'recording', prev: null, next: data });
}
