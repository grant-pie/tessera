import { get, set } from '../state/state.js';
import { isInScale } from './scale.js';

/**
 * Pure step-advancement function used by the multi-track scheduler.
 * Mutates `cursor` in-place and returns { step, didWrap }.
 * @param {{ step: number, pingPongDir: number, randomCounter: number }} cursor
 * @param {{ direction: string, loopStart: number, loopEnd: number }} config
 */
export function nextStepForTrack(cursor, config) {
  const { direction, loopStart, loopEnd } = config;
  const lo = Math.min(loopStart, loopEnd);
  const hi = Math.max(loopStart, loopEnd);

  let step          = cursor.step;
  let pingPongDir   = cursor.pingPongDir   ?? 1;
  let randomCounter = cursor.randomCounter ?? 0;
  let didWrap       = false;

  switch (direction) {
    case 'forward':
      if (step < lo || step > hi) {
        step = lo;
      } else {
        step++;
        if (step > hi) { step = lo; didWrap = true; }
      }
      break;

    case 'reverse':
      if (step < lo || step > hi) {
        step = hi;
      } else {
        step--;
        if (step < lo) { step = hi; didWrap = true; }
      }
      break;

    case 'ping-pong':
      step = cursor.step + pingPongDir;
      if (step > hi) { step = hi - 1; pingPongDir = -1; }
      if (step < lo) { step = lo + 1; pingPongDir =  1; didWrap = true; }
      break;

    case 'random':
      step = lo + Math.floor(Math.random() * (hi - lo + 1));
      randomCounter++;
      if (randomCounter >= (hi - lo + 1)) { randomCounter = 0; didWrap = true; }
      break;
  }

  cursor.step          = step;
  cursor.pingPongDir   = pingPongDir;
  cursor.randomCounter = randomCounter;

  return { step, didWrap };
}

/**
 * Pure note-filter function for a given track's step.
 * @param {number}  stepIndex
 * @param {Array}   steps      - track's steps array
 * @param {{ scale, rootNote, transpose }} pitch
 */
export function getActiveNotesForTrack(stepIndex, steps, pitch) {
  const step = steps[stepIndex];
  if (!step || step.muted || step.notes.length === 0) return [];
  if (step.probability < 100 && Math.random() * 100 > step.probability) return [];

  return step.notes
    .map(n => n + pitch.transpose)
    .filter(n => n >= 0 && n <= 127)
    .filter(n => isInScale(n, pitch.rootNote, pitch.scale));
}

/**
 * Returns step duration in ms based on current BPM (global).
 */
export function getStepDuration() {
  return 60000 / get().transport.bpm / 4;
}

/**
 * Resets the active track's cursor display in state.
 */
export function resetCursor() {
  const state = get();
  const { loopStart, loopEnd, direction } = state.transport;
  set('cursor.step', direction === 'reverse' ? loopEnd : loopStart - 1);
  set('cursor.subStep', 0);
  set('cursor.pingPongDir', 1);
}
