import { get, set } from '../state/state.js';

let midiAccess = null;

export async function initMidi() {
  if (!navigator.requestMIDIAccess) {
    console.warn('Web MIDI API not supported in this browser.');
    return false;
  }

  try {
    midiAccess = await navigator.requestMIDIAccess({ sysex: false });
    set('midi.access', midiAccess);
    refreshPorts();

    midiAccess.onstatechange = () => refreshPorts();
    return true;
  } catch (err) {
    console.error('MIDI access denied:', err);
    return false;
  }
}

function refreshPorts() {
  if (!midiAccess) return;

  const outputs = [];
  midiAccess.outputs.forEach((port) => {
    outputs.push({ id: port.id, name: port.name });
  });

  const inputs = [];
  midiAccess.inputs.forEach((port) => {
    inputs.push({ id: port.id, name: port.name });
  });

  set('midi.outputs', outputs);
  set('midi.inputs', inputs);
}

export function getOutput() {
  const state = get();
  if (!midiAccess || !state.midi.outputId) return null;
  return midiAccess.outputs.get(state.midi.outputId) || null;
}

export function getInput() {
  const state = get();
  if (!midiAccess || !state.midi.inputId) return null;
  return midiAccess.inputs.get(state.midi.inputId) || null;
}

export function getMidiAccess() {
  return midiAccess;
}
