import { on, emit } from '../utils/event-bus.js';
import { nextStep, getActiveNotes, getStepDuration, resetCursor } from './sequencer.js';
import { fireStep, resetGlideState, allNotesOff, sendCC, noteOn, noteOff } from '../midi/midi-output.js';
import { get, set } from '../state/state.js';

export function initScheduler() {
  on('clock:tick', handleTick);
  on('clock:transport', handleTransport);
}

function handleTransport({ type }) {
  if (type === 'start' || type === 'continue') {
    set('transport.playing', true);
    resetCursor();
  } else if (type === 'stop') {
    handleStop();
  }
}

function handleStop() {
  const state = get();
  allNotesOff(state.transport.midiChannel);
  resetGlideState();
  set('transport.playing', false);
  set('cursor.step', -1);
  emit('sequencer:step', { step: -1 });
}

function handleTick({ tickTime }) {
  const state = get();
  if (!state.transport.playing) return;

  const step = nextStep();
  const stepData = state.pattern.steps[step];

  if (!stepData) return;

  const { midiChannel, gateLength } = state.transport;
  const stepDuration = getStepDuration();
  const noteOffTime = tickTime + stepDuration * gateLength;

  if (stepData.substeps > 1 && !stepData.glide) {
    fireSubsteps(step, stepData, midiChannel, tickTime, stepDuration, gateLength);
  } else {
    const notes = getActiveNotes(step);
    if (!stepData.muted) {
      fireStep(midiChannel, notes, stepData.velocity, stepData.glide, tickTime, noteOffTime);
    }
  }

  if (state.ccLane.visible && stepData.cc !== null) {
    sendCC(midiChannel, state.ccLane.ccNumber, stepData.cc, tickTime);
  }

  emit('sequencer:step', { step, tickTime });
}

function fireSubsteps(stepIndex, stepData, channel, tickTime, stepDuration, gateLength) {
  const count = stepData.substeps;
  const subDuration = stepDuration / count;
  const state = get();
  const { transpose } = state.pitch;

  const notes = stepData.notes
    .map(n => n + transpose)
    .filter(n => n >= 0 && n <= 127);

  if (notes.length === 0 || stepData.muted) return;

  for (let i = 0; i < count; i++) {
    const subTickTime = tickTime + i * subDuration;
    const subNoteOffTime = subTickTime + subDuration * gateLength;
    notes.forEach(n => noteOn(channel, n, stepData.velocity, subTickTime));
    notes.forEach(n => noteOff(channel, n, subNoteOffTime));
  }
}
