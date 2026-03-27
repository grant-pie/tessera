import { get, set } from './recorder-state.js';
import { emit } from '../utils/event-bus.js';
import { getMidiAccess } from '../midi/midi-access.js';

let attachedPort = null;

export function startRecording() {
  const state = get();
  if (state.transport.mode === 'recording') return;

  set('recording.events', []);
  set('recording.durationMs', 0);
  set('recording.startedAt', performance.now());
  set('transport.mode', 'recording');

  attachInputPort(state.midi.inputId);
  emit('recorder:recordingStarted');
}

export function stopRecording() {
  const state = get();
  if (state.transport.mode !== 'recording') return;

  const duration = performance.now() - state.recording.startedAt;
  set('recording.durationMs', duration);
  set('recording.startedAt', null);
  set('transport.mode', 'idle');

  detachInputPort();
  emit('recorder:recordingStopped', { durationMs: duration });
}

function attachInputPort(inputId) {
  const access = getMidiAccess();
  if (!access || !inputId) {
    console.warn('[RecorderEngine] No MIDI input selected');
    return;
  }

  const port = access.inputs.get(inputId);
  if (!port) {
    console.warn('[RecorderEngine] Input port not found:', inputId);
    return;
  }

  attachedPort = port;
  port.onmidimessage = handleMidiMessage;
  console.log('[RecorderEngine] Recording on:', port.name);
}

function detachInputPort() {
  if (attachedPort) {
    attachedPort.onmidimessage = null;
    attachedPort = null;
  }
}

function handleMidiMessage(e) {
  const state = get();
  if (state.transport.mode !== 'recording') return;

  const [status, data1, data2] = e.data;
  const msgType  = status & 0xF0;
  const channel  = (status & 0x0F) + 1;

  // Apply channel filter
  if (state.transport.channelFilter !== 0 && channel !== state.transport.channelFilter) return;

  const offsetMs = performance.now() - state.recording.startedAt;
  let event = null;

  if (msgType === 0x90 && data2 > 0) {
    // Note on
    event = { type: 'noteOn', offsetMs, channel, note: data1, velocity: data2 };
  } else if (msgType === 0x80 || (msgType === 0x90 && data2 === 0)) {
    // Note off (including zero-velocity note-on)
    event = { type: 'noteOff', offsetMs, channel, note: data1, velocity: 0 };
  } else if (msgType === 0xB0) {
    // CC
    event = { type: 'cc', offsetMs, channel, cc: data1, value: data2 };
  }

  if (!event) return;

  const events = [...state.recording.events, event];
  set('recording.events', events);
  emit('recorder:eventCaptured', event);
}

export function refreshInputPort() {
  const state = get();
  if (state.transport.mode === 'recording') {
    detachInputPort();
    attachInputPort(state.midi.inputId);
  }
}
