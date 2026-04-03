import { get, set } from '../state/state.js';
import { factoryPort, BUILTIN_ID, BUILTIN_NAME } from '../audio/factory-sound-engine.js';

let midiAccess = null;

export async function initMidi() {
  // Always populate the built-in synth even if Web MIDI is unavailable
  refreshPorts();

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
    console.warn('MIDI access denied — only Built-in Synth available:', err);
    return false;
  }
}

function refreshPorts() {
  // Always include the built-in synth as the first output option
  const outputs = [{ id: BUILTIN_ID, name: BUILTIN_NAME }];

  if (midiAccess) {
    midiAccess.outputs.forEach((port) => {
      outputs.push({ id: port.id, name: port.name });
    });
  }

  const inputs = [];
  if (midiAccess) {
    midiAccess.inputs.forEach((port) => {
      inputs.push({ id: port.id, name: port.name });
    });
  }

  set('midi.outputs', outputs);
  set('midi.inputs', inputs);
}

export function getOutput() {
  const state = get();
  if (!state.midi.outputId) return null;
  if (state.midi.outputId === BUILTIN_ID) return factoryPort;
  if (!midiAccess) return null;
  return midiAccess.outputs.get(state.midi.outputId) || null;
}

export function getInput() {
  const state = get();
  if (!midiAccess || !state.midi.inputId) return null;
  return midiAccess.inputs.get(state.midi.inputId) || null;
}

export function getOutputById(id) {
  if (!id) return null;
  if (id === BUILTIN_ID) return factoryPort;
  if (!midiAccess) return null;
  return midiAccess.outputs.get(id) || null;
}

export function getMidiAccess() {
  return midiAccess;
}
