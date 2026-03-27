import { get, set } from './recorder-state.js';

const MAX = 50;

let undoStack = [];
let redoStack = [];

/** Call before any mutation to recording.events, durationMs, or trim. */
export function pushHistory() {
  undoStack.push(snapshot());
  if (undoStack.length > MAX) undoStack.shift();
  redoStack = [];
}

export function undo() {
  if (!undoStack.length) return;
  redoStack.push(snapshot());
  restore(undoStack.pop());
}

export function redo() {
  if (!redoStack.length) return;
  undoStack.push(snapshot());
  restore(redoStack.pop());
}

export function canUndo() { return undoStack.length > 0; }
export function canRedo() { return redoStack.length > 0; }

export function clear() {
  undoStack = [];
  redoStack = [];
}

function snapshot() {
  const state = get();
  return {
    events:     state.recording.events.map(e => ({ ...e })),
    durationMs: state.recording.durationMs,
    trimStart:  state.trim.startMs,
    trimEnd:    state.trim.endMs,
  };
}

function restore(snap) {
  set('recording.events',     snap.events);
  set('recording.durationMs', snap.durationMs);
  set('trim.startMs',         snap.trimStart);
  set('trim.endMs',           snap.trimEnd);
}
