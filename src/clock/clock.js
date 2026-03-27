import { emit, on } from '../utils/event-bus.js';
import { attachToPort, detachFromPort } from './external-clock.js';

let worker = null;
let source = 'internal';
let currentInputPort = null;

function handleTick(data) {
  emit('clock:tick', data);
}

export function init() {
  on('externalClock:transport', ({ type }) => {
    if (type === 'start' || type === 'continue') {
      emit('clock:transport', { type });
    } else if (type === 'stop') {
      emit('clock:transport', { type });
    }
  });
}

export function start({ bpm, swing, stepCount, startStep = 0 }) {
  if (source === 'internal') {
    if (!worker) {
      worker = new Worker(new URL('./internal-clock.worker.js', import.meta.url), { type: 'module' });
      worker.onmessage = (e) => {
        if (e.data.type === 'TICK') handleTick(e.data);
      };
    }
    worker.postMessage({ type: 'START', bpm, swing, stepCount, startStep });
  }
  // External clock: ticks come via attachToPort
}

export function stop() {
  if (worker) {
    worker.postMessage({ type: 'STOP' });
  }
  if (currentInputPort) {
    // don't detach — keep listening for future start
  }
}

export function setBpm(bpm) {
  if (worker) worker.postMessage({ type: 'SET_BPM', bpm });
}

export function setSwing(swing) {
  if (worker) worker.postMessage({ type: 'SET_SWING', swing });
}

export function setStepCount(stepCount) {
  if (worker) worker.postMessage({ type: 'SET_STEP_COUNT', stepCount });
}

export function setSource(mode, midiInputPort = null) {
  source = mode;
  console.log('[Clock] setSource:', mode, '| port:', midiInputPort?.name ?? 'none');

  if (mode === 'external') {
    currentInputPort = midiInputPort;
    attachToPort(midiInputPort, handleTick);
  } else {
    if (currentInputPort) {
      detachFromPort(currentInputPort);
      currentInputPort = null;
    }
  }
}

export function getSource() {
  return source;
}

export function terminate() {
  if (worker) {
    worker.terminate();
    worker = null;
  }
}
