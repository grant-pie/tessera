import { get, set, setStep } from '../state/state.js';
import { defaultScene, defaultTrack, defaultStep } from '../state/defaults.js';
import { emit } from '../utils/event-bus.js';
import * as clock from '../clock/clock.js';
import { snapshotAllTracks, loadTrackIntoState } from './track-manager.js';

/**
 * Called once on startup. Captures the current state into scene 0.
 */
export function initScenes() {
  const scenes = get().scenes.slice();
  scenes[0] = _snapshotCurrentState(scenes[0]);
  set('scenes', scenes);
  set('activeSceneIndex', 0);
}

function _snapshotCurrentState(existingScene) {
  const state = get();
  return {
    ...existingScene,
    // All tracks (multi-track format)
    tracks: snapshotAllTracks(),
    // Swing is global (not per-track)
    swing: state.transport.swing,
  };
}

export function saveCurrentToScene(sceneIndex) {
  const scenes = get().scenes.map((s, i) =>
    i === sceneIndex ? _snapshotCurrentState(s) : s
  );
  set('scenes', scenes);
}

export function switchToScene(sceneIndex) {
  saveCurrentToScene(get().activeSceneIndex);
  _applyScene(sceneIndex);
}

export function switchToSceneImmediate(sceneIndex) {
  _applyScene(sceneIndex);
}

function _applyScene(sceneIndex) {
  const scene = get().scenes[sceneIndex];
  if (!scene) return;

  // Global swing
  if (scene.swing != null) {
    set('transport.swing', scene.swing);
    clock.setSwing(scene.swing);
    const el = document.getElementById('swing-slider');
    if (el) { el.value = scene.swing; document.getElementById('swing-val').textContent = scene.swing + '%'; }
  }

  if (scene.tracks && scene.tracks.length > 0) {
    // ── Multi-track scene ──
    const activeIdx = Math.min(get().activeTrackIndex, scene.tracks.length - 1);

    // Restore all non-active tracks into state.tracks first
    const restoredTracks = scene.tracks.map(t => ({
      ...t,
      steps: t.steps.map(s => ({ ...s, notes: [...s.notes] })),
    }));
    set('tracks', restoredTracks);
    set('activeTrackIndex', activeIdx);

    // Load the active track into live state
    loadTrackIntoState(activeIdx);
  } else {
    // ── Legacy single-track scene ──
    _applySingleTrackScene(scene);
  }

  set('activeSceneIndex', sceneIndex);
  emit('scene:loaded', { sceneIndex });
}

function _applySingleTrackScene(scene) {
  const t = scene.transport || {};
  const p = scene.pitch    || {};

  if (t.direction   != null) set('transport.direction',   t.direction);
  if (t.stepCount   != null) { set('transport.stepCount',   t.stepCount);   clock.setStepCount(t.stepCount); }
  if (t.loopStart   != null) set('transport.loopStart',   t.loopStart);
  if (t.loopEnd     != null) set('transport.loopEnd',     t.loopEnd);
  if (t.gateLength  != null) set('transport.gateLength',  t.gateLength);
  if (t.midiChannel != null) set('transport.midiChannel', t.midiChannel);

  if (p.scale     != null) set('pitch.scale',     p.scale);
  if (p.rootNote  != null) set('pitch.rootNote',  p.rootNote);
  if (p.transpose != null) set('pitch.transpose', p.transpose);

  if (scene.ccLane?.visible  != null) set('ccLane.visible',  scene.ccLane.visible);
  if (scene.ccLane?.ccNumber != null) set('ccLane.ccNumber', scene.ccLane.ccNumber);

  const steps = scene.steps || [];
  for (let i = 0; i < 64; i++) {
    setStep(i, { ...defaultStep(), ...(steps[i] || {}) });
  }

  // Also update tracks[0] to reflect this scene
  const currentTracks = get().tracks;
  const updatedTrack = {
    ...currentTracks[0],
    direction:  t.direction  ?? currentTracks[0].direction,
    stepCount:  t.stepCount  ?? currentTracks[0].stepCount,
    loopStart:  t.loopStart  ?? currentTracks[0].loopStart,
    loopEnd:    t.loopEnd    ?? currentTracks[0].loopEnd,
    gateLength: t.gateLength ?? currentTracks[0].gateLength,
    midiChannel: t.midiChannel ?? currentTracks[0].midiChannel,
    pitch: { ...p },
    ccLane: { ...(scene.ccLane || currentTracks[0].ccLane) },
    steps: get().pattern.steps.map(s => ({ ...s, notes: [...s.notes] })),
  };
  set('tracks', [updatedTrack, ...currentTracks.slice(1)]);
}

export function renameScene(sceneIndex, name) {
  const scenes = get().scenes.map((s, i) =>
    i === sceneIndex ? { ...s, name } : s
  );
  set('scenes', scenes);
}
