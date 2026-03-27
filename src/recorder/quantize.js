import { get, set } from './recorder-state.js';

/**
 * Quantize grid sizes as note subdivisions.
 * gridMs = (60000 / bpm) / (subdivision / 4)
 * e.g. 1/16 at 120bpm = (60000/120) / (16/4) = 500 / 4 = 125ms
 */
export const GRIDS = {
  '1/4':  4,
  '1/8':  8,
  '1/16': 16,
  '1/32': 32,
};

/**
 * Quantize all noteOn events to the nearest grid line,
 * shifting the matching noteOff by the same delta to preserve note duration.
 *
 * @param {number} bpm
 * @param {number} subdivision  - e.g. 16 for 1/16th notes
 * @param {number} strength     - 0.0–1.0, how far to pull toward the grid (1.0 = full)
 */
export function quantize(bpm, subdivision, strength = 1.0) {
  const state  = get();
  const events = state.recording.events;
  if (!events.length) return;

  const gridMs = (60000 / bpm) / (subdivision / 4);

  // Clone events so we can mutate safely
  const quantized = events.map(e => ({ ...e }));

  // Build index: for each noteOn find its paired noteOff
  // We need to shift noteOff by the same delta as its noteOn
  const noteOnStack = new Map(); // note -> [index in quantized array]

  const deltas = new Map(); // original offsetMs of noteOn -> shift applied

  for (let i = 0; i < quantized.length; i++) {
    const ev = quantized[i];

    if (ev.type === 'noteOn') {
      const snapped = snap(ev.offsetMs, gridMs);
      const delta   = (snapped - ev.offsetMs) * strength;
      quantized[i]  = { ...ev, offsetMs: Math.max(0, ev.offsetMs + delta) };

      // Track the delta by original time so we can apply it to the noteOff
      if (!noteOnStack.has(ev.note)) noteOnStack.set(ev.note, []);
      noteOnStack.get(ev.note).push({ origTime: ev.offsetMs, delta });

    } else if (ev.type === 'noteOff') {
      const stack = noteOnStack.get(ev.note);
      if (stack && stack.length > 0) {
        const { delta } = stack.shift();
        quantized[i] = { ...ev, offsetMs: Math.max(0, ev.offsetMs + delta) };
      }
    }
  }

  // Re-sort by offsetMs after quantization (notes may have shifted past each other)
  quantized.sort((a, b) => a.offsetMs - b.offsetMs);

  set('recording.events', quantized);
}

function snap(timeMs, gridMs) {
  return Math.round(timeMs / gridMs) * gridMs;
}
