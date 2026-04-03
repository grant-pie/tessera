import { on, emit } from '../utils/event-bus.js';
import { nextStepForTrack, getActiveNotesForTrack, getStepDuration, resetCursor } from './sequencer.js';
import { fireStep, allTracksOff, sendCC, noteOn, noteOff } from '../midi/midi-output.js';
import { get, set } from '../state/state.js';
import { getOutputById } from '../midi/midi-access.js';
import { getFactoryPortForPreset, BUILTIN_ID } from '../audio/factory-sound-engine.js';
import { switchToSceneImmediate } from '../scenes/scene-manager.js';

// Per-track cursor state — not in reactive state to avoid flooding stateChange events
// trackId -> { step, pingPongDir, randomCounter }
const trackCursors = new Map();

export function initScheduler() {
  on('clock:tick', handleTick);
  on('clock:transport', handleTransport);
}

// ── Helpers ───────────────────────────────────────────────────

/**
 * Get or create a cursor for a given track id.
 */
function getCursor(track) {
  if (!trackCursors.has(track.id)) {
    const isReverse = track.direction === 'reverse';
    trackCursors.set(track.id, {
      step: isReverse ? track.loopEnd : track.loopStart - 1,
      pingPongDir: 1,
      randomCounter: 0,
    });
  }
  return trackCursors.get(track.id);
}

/**
 * Reset all per-track cursors to their start positions.
 */
function resetAllCursors() {
  trackCursors.clear();
}

/**
 * Get the effective config for a track at the given index.
 * The active track's live state.transport/pitch/ccLane take precedence.
 */
function getTrackConfig(state, trackIndex) {
  const track = state.tracks[trackIndex];
  if (trackIndex === state.activeTrackIndex) {
    return {
      id:          track.id,
      midiChannel: state.transport.midiChannel,
      midiOutputId: track.midiOutputId,
      synthPreset: track.synthPreset,
      mute:        track.mute,
      direction:   state.transport.direction,
      stepCount:   state.transport.stepCount,
      loopStart:   state.transport.loopStart,
      loopEnd:     state.transport.loopEnd,
      gateLength:  state.transport.gateLength,
      pitch:       state.pitch,
      ccLane:      state.ccLane,
      steps:       state.pattern.steps,   // live editable pattern
    };
  }
  return {
    id:          track.id,
    midiChannel: track.midiChannel,
    midiOutputId: track.midiOutputId,
    synthPreset: track.synthPreset,
    mute:        track.mute,
    direction:   track.direction,
    stepCount:   track.stepCount,
    loopStart:   track.loopStart,
    loopEnd:     track.loopEnd,
    gateLength:  track.gateLength,
    pitch:       track.pitch,
    ccLane:      track.ccLane,
    steps:       track.steps,
  };
}

/**
 * Resolve the MIDI output port for a track config.
 * If the track (or global output) is the built-in synth AND the track has a
 * synthPreset set, return a preset-bound factory port so each track triggers
 * its own sound regardless of the global SYNTH selector.
 */
function _resolvePort(cfg, state) {
  const outputId = cfg.midiOutputId || state.midi.outputId;
  if (cfg.synthPreset && outputId === BUILTIN_ID) {
    return getFactoryPortForPreset(cfg.synthPreset);
  }
  return getOutputById(outputId);
}

// ── Transport ─────────────────────────────────────────────────

function handleTransport({ type }) {
  if (type === 'start' || type === 'continue') {
    set('transport.playing', true);
    resetAllCursors();
    resetCursor();
  } else if (type === 'stop') {
    handleStop();
  }
}

function handleStop() {
  const state = get();
  allTracksOff(state.tracks, (track) => {
    const outputId = track.midiOutputId || state.midi.outputId;
    if (track.synthPreset && outputId === BUILTIN_ID) return getFactoryPortForPreset(track.synthPreset);
    return getOutputById(outputId);
  });
  set('transport.playing', false);
  set('cursor.step', -1);
  emit('sequencer:step', { step: -1 });
}

// ── Song mode / queue ─────────────────────────────────────────

function handleLoopWrap() {
  const state = get();
  const { song } = state;

  if (song.queuedSceneIndex !== null) {
    const nextIndex = song.queuedSceneIndex;
    set('song.queuedSceneIndex', null);
    switchToSceneImmediate(nextIndex);
    resetAllCursors();
    resetCursor();
    return;
  }

  if (song.enabled && song.entries.length > 0) {
    const entry = song.entries[song.activeEntry];
    if (!entry) return;
    const nextRepeat = song.currentRepeat + 1;
    if (nextRepeat >= entry.repeats) {
      const nextEntry = (song.activeEntry + 1) % song.entries.length;
      set('song.activeEntry', nextEntry);
      set('song.currentRepeat', 0);
      switchToSceneImmediate(song.entries[nextEntry].sceneIndex);
      resetAllCursors();
      resetCursor();
    } else {
      set('song.currentRepeat', nextRepeat);
    }
  }
}

// ── Tick ──────────────────────────────────────────────────────

function handleTick({ tickTime }) {
  const state = get();
  if (!state.transport.playing) return;

  const stepDuration = getStepDuration();
  const hasSolo = state.tracks.some(t => t.solo);

  state.tracks.forEach((track, trackIndex) => {
    const cfg = getTrackConfig(state, trackIndex);

    if (cfg.mute) return;
    if (hasSolo && !track.solo) return;

    const cursor = getCursor({ id: cfg.id, direction: cfg.direction, loopStart: cfg.loopStart, loopEnd: cfg.loopEnd });
    const { step, didWrap } = nextStepForTrack(cursor, cfg);

    const stepData = cfg.steps[step];
    if (!stepData) return;

    const noteOffTime = tickTime + stepDuration * cfg.gateLength;
    const port = _resolvePort(cfg, state);

    if (stepData.substeps > 1 && !stepData.glide) {
      fireSubstepsForTrack(cfg, stepData, stepDuration, tickTime, port);
    } else {
      const notes = getActiveNotesForTrack(step, cfg.steps, cfg.pitch);
      if (!stepData.muted) {
        fireStep(cfg.midiChannel, notes, stepData.velocity, stepData.glide,
                 tickTime, noteOffTime, port, cfg.id);
      }
    }

    if (cfg.ccLane.visible && stepData.cc !== null) {
      sendCC(cfg.midiChannel, cfg.ccLane.ccNumber, stepData.cc, tickTime, port);
    }

    // Active track drives the grid playhead and song mode
    if (trackIndex === state.activeTrackIndex) {
      set('cursor.step', step);
      emit('sequencer:step', { step, tickTime });
      if (didWrap) handleLoopWrap();
    }
  });
}

function fireSubstepsForTrack(cfg, stepData, stepDuration, tickTime, port) {
  const count = stepData.substeps;
  const subDuration = stepDuration / count;
  const notes = stepData.notes
    .map(n => n + cfg.pitch.transpose)
    .filter(n => n >= 0 && n <= 127);

  if (notes.length === 0 || stepData.muted) return;

  for (let i = 0; i < count; i++) {
    const subTickTime    = tickTime + i * subDuration;
    const subNoteOffTime = subTickTime + subDuration * cfg.gateLength;
    notes.forEach(n => noteOn(cfg.midiChannel,  n, stepData.velocity, subTickTime,    port));
    notes.forEach(n => noteOff(cfg.midiChannel, n, subNoteOffTime, port));
  }
}
