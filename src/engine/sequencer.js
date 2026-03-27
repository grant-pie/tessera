import { get, set } from '../state/state.js';
import { isInScale } from './scale.js';

/**
 * Advances the cursor to the next step based on direction, loop markers, and ping-pong.
 * Returns the new step index.
 */
export function nextStep() {
  const state = get();
  const { direction, loopStart, loopEnd, stepCount } = state.transport;
  const cursor = state.cursor;

  const lo = Math.min(loopStart, loopEnd);
  const hi = Math.max(loopStart, loopEnd);

  let next = cursor.step;
  let pingPongDir = cursor.pingPongDir;

  switch (direction) {
    case 'forward':
      next = next < lo || next > hi ? lo : next + 1;
      if (next > hi) next = lo;
      break;

    case 'reverse':
      next = next < lo || next > hi ? hi : next - 1;
      if (next < lo) next = hi;
      break;

    case 'ping-pong':
      next = cursor.step + pingPongDir;
      if (next > hi) { next = hi - 1; pingPongDir = -1; }
      if (next < lo) { next = lo + 1; pingPongDir = 1; }
      break;

    case 'random':
      next = lo + Math.floor(Math.random() * (hi - lo + 1));
      break;
  }

  set('cursor.step', next);
  set('cursor.pingPongDir', pingPongDir);

  return next;
}

/**
 * Returns the MIDI notes for a given step, filtered by current scale + transpose.
 * Returns empty array for muted steps or steps with no notes.
 */
export function getActiveNotes(stepIndex) {
  const state = get();
  const step = state.pattern.steps[stepIndex];

  if (!step || step.muted || step.notes.length === 0) return [];

  const { scale, rootNote, transpose } = state.pitch;

  // Probability check
  if (step.probability < 100 && Math.random() * 100 > step.probability) return [];

  return step.notes
    .map(n => n + transpose)
    .filter(n => n >= 0 && n <= 127)
    .filter(n => isInScale(n, rootNote, scale));
}

/**
 * Returns step duration in ms based on current BPM.
 */
export function getStepDuration() {
  return 60000 / get().transport.bpm / 4;
}

/**
 * Resets the cursor to the loop start position.
 */
export function resetCursor() {
  const { loopStart, direction } = get().transport;
  const lo = loopStart;
  set('cursor.step', direction === 'reverse' ? get().transport.loopEnd : lo - 1);
  set('cursor.subStep', 0);
  set('cursor.pingPongDir', 1);
}
