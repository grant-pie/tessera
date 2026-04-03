import { get, set, setStep } from '../state/state.js';
import { defaultTrack, defaultStep } from '../state/defaults.js';
import { emit } from '../utils/event-bus.js';
import * as clock from '../clock/clock.js';

// ── Snapshot / restore helpers ────────────────────────────────

/**
 * Build a track snapshot from the given index.
 * For the active track: reads live state.pattern/transport/pitch/ccLane.
 * For other tracks: reads from state.tracks[i] directly.
 */
function snapshotTrack(trackIndex) {
  const state = get();
  const track = state.tracks[trackIndex];

  if (trackIndex === state.activeTrackIndex) {
    return {
      ...track,
      steps:      state.pattern.steps.map(s => ({ ...s, notes: [...s.notes] })),
      direction:  state.transport.direction,
      stepCount:  state.transport.stepCount,
      loopStart:  state.transport.loopStart,
      loopEnd:    state.transport.loopEnd,
      gateLength: state.transport.gateLength,
      midiChannel: state.transport.midiChannel,
      pitch:  { ...state.pitch },
      ccLane: { ...state.ccLane },
    };
  }

  return { ...track, steps: track.steps.map(s => ({ ...s, notes: [...s.notes] })) };
}

/**
 * Push the current live state into state.tracks[trackIndex].
 */
export function saveCurrentToTrack(trackIndex) {
  const tracks = get().tracks.map((t, i) =>
    i === trackIndex ? snapshotTrack(i) : t
  );
  set('tracks', tracks);
}

/**
 * Load a track's stored data into the live state (state.transport, state.pattern, etc.)
 * so all existing UI components render the correct data.
 */
export function loadTrackIntoState(trackIndex) {
  const state = get();
  const track = state.tracks[trackIndex];
  if (!track) return;

  // Per-track transport fields
  set('transport.direction',   track.direction);
  set('transport.stepCount',   track.stepCount);
  set('transport.loopStart',   track.loopStart);
  set('transport.loopEnd',     track.loopEnd);
  set('transport.gateLength',  track.gateLength);
  set('transport.midiChannel', track.midiChannel);

  clock.setSwing(get().transport.swing); // swing is global; re-sync
  clock.setStepCount(track.stepCount);

  // Pitch
  set('pitch.scale',     track.pitch.scale);
  set('pitch.rootNote',  track.pitch.rootNote);
  set('pitch.transpose', track.pitch.transpose);

  // CC lane
  set('ccLane.visible',  track.ccLane.visible);
  set('ccLane.ccNumber', track.ccLane.ccNumber);

  // Steps — fires stateChange events the grid listens to
  for (let i = 0; i < 64; i++) {
    setStep(i, { ...defaultStep(), ...(track.steps[i] || {}) });
  }

  _syncControlsUI(track);
}

function _syncControlsUI(track) {
  const el = id => document.getElementById(id);

  if (el('swing-slider'))     { /* swing is global, leave it */ }
  if (el('gate-slider'))      { el('gate-slider').value = Math.round(track.gateLength * 100); el('gate-val').textContent = Math.round(track.gateLength * 100) + '%'; }
  if (el('step-count-input')) el('step-count-input').value = track.stepCount;
  if (el('loop-start-input')) el('loop-start-input').value = track.loopStart + 1;
  if (el('loop-end-input'))   el('loop-end-input').value   = track.loopEnd + 1;
  if (el('channel-input'))    el('channel-input').value    = track.midiChannel;
  if (el('scale-select'))     el('scale-select').value     = track.pitch.scale;
  if (el('root-select'))      el('root-select').value      = track.pitch.rootNote;
  if (el('transpose-input'))  el('transpose-input').value  = track.pitch.transpose;
  if (el('cc-toggle'))        el('cc-toggle').checked      = track.ccLane.visible;
  if (el('cc-number-input'))  el('cc-number-input').value  = track.ccLane.ccNumber;

  document.querySelectorAll('.dir-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.dir === track.direction);
  });
}

// ── Public API ────────────────────────────────────────────────

/**
 * Switch the focused track.
 * Saves the current active track, loads the new one.
 */
export function switchToTrack(trackIndex) {
  const state = get();
  if (trackIndex === state.activeTrackIndex) return;
  if (trackIndex < 0 || trackIndex >= state.tracks.length) return;

  saveCurrentToTrack(state.activeTrackIndex);
  set('activeTrackIndex', trackIndex);
  loadTrackIntoState(trackIndex);

  emit('track:switched', { trackIndex });
}

/**
 * Add a new track and switch to it.
 */
export function addTrack() {
  const state = get();
  saveCurrentToTrack(state.activeTrackIndex);

  const newIndex = state.tracks.length;
  const newTrack = defaultTrack(newIndex);
  set('tracks', [...state.tracks, newTrack]);
  set('activeTrackIndex', newIndex);
  loadTrackIntoState(newIndex);

  emit('track:switched', { trackIndex: newIndex });
}

/**
 * Remove a track. Cannot remove the last one.
 */
export function removeTrack(trackIndex) {
  const state = get();
  if (state.tracks.length <= 1) return;

  saveCurrentToTrack(state.activeTrackIndex);

  const newTracks = state.tracks.filter((_, i) => i !== trackIndex);
  const newActive = Math.min(state.activeTrackIndex, newTracks.length - 1);

  set('tracks', newTracks);
  set('activeTrackIndex', newActive);
  loadTrackIntoState(newActive);

  emit('track:switched', { trackIndex: newActive });
}

/**
 * Rename a track.
 */
export function renameTrack(trackIndex, name) {
  const tracks = get().tracks.map((t, i) =>
    i === trackIndex ? { ...t, name } : t
  );
  set('tracks', tracks);
}

/**
 * Toggle mute on a track.
 */
export function toggleMute(trackIndex) {
  const tracks = get().tracks.map((t, i) =>
    i === trackIndex ? { ...t, mute: !t.mute } : t
  );
  set('tracks', tracks);
}

/**
 * Set the per-track MIDI output.
 */
export function setTrackOutput(trackIndex, outputId) {
  const tracks = get().tracks.map((t, i) =>
    i === trackIndex ? { ...t, midiOutputId: outputId || null } : t
  );
  set('tracks', tracks);
}

/**
 * Set the per-track MIDI channel.
 */
export function setTrackChannel(trackIndex, channel) {
  const tracks = get().tracks.map((t, i) =>
    i === trackIndex ? { ...t, midiChannel: channel } : t
  );
  set('tracks', tracks);
  // If this is the active track, sync to live transport too
  if (trackIndex === get().activeTrackIndex) {
    set('transport.midiChannel', channel);
  }
}

/**
 * Snapshot all tracks (called by scene-manager before saving a scene).
 * Returns a serialisable array of all track snapshots.
 */
export function snapshotAllTracks() {
  const state = get();
  return state.tracks.map((_, i) => snapshotTrack(i));
}
