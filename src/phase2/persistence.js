import { get, set, setStep } from '../state/state.js';
import { defaultStep, defaultTrack, defaultScene } from '../state/defaults.js';
import { loadTrackIntoState } from '../scenes/track-manager.js';
import { switchToSceneImmediate } from '../scenes/scene-manager.js';
import * as clock from '../clock/clock.js';

const FILE_VERSION = 3;
// sessionStorage key — tab-scoped, survives page navigation within the tab
// but clears when the tab is closed (unlike localStorage).
const AUTOSAVE_KEY = 'tessera_autosave';

// ── Auto-save / restore (preserves state across page navigations) ─

export function autosave() {
  flushActiveTrack();
  const state = get();
  const scenes = state.scenes.map((scene, si) => {
    if (si !== state.activeSceneIndex) return scene;
    return { ...scene, tracks: state.tracks.map(serializeTrack), swing: state.transport.swing };
  });
  const data = {
    version:          FILE_VERSION,
    transport:        { bpm: state.transport.bpm, swing: state.transport.swing },
    activeSceneIndex: state.activeSceneIndex,
    song:             { ...state.song },
    scenes:           scenes.map(scene => ({
      name:   scene.name,
      swing:  scene.swing ?? 0,
      tracks: (scene.tracks || []).map(serializeTrack),
    })),
  };
  try { sessionStorage.setItem(AUTOSAVE_KEY, JSON.stringify(data)); } catch (_) {}
}

export function restoreAutosave() {
  const raw = sessionStorage.getItem(AUTOSAVE_KEY);
  if (!raw) return false;
  try {
    const data = JSON.parse(raw);
    if (!data.scenes?.length) return false;
    applyFullData(data);
    return true;
  } catch (_) {
    return false;
  }
}

// ── Helpers ───────────────────────────────────────────────────

function serializeStep(s) {
  return {
    notes:       s.notes,
    velocity:    s.velocity,
    probability: s.probability,
    muted:       s.muted,
    glide:       s.glide,
    substeps:    s.substeps,
    cc:          s.cc,
  };
}

function serializeTrack(track) {
  return {
    name:         track.name,
    color:        track.color,
    midiOutputId: track.midiOutputId,
    synthPreset:  track.synthPreset,
    midiChannel:  track.midiChannel,
    mute:         track.mute,
    direction:    track.direction,
    stepCount:    track.stepCount,
    loopStart:    track.loopStart,
    loopEnd:      track.loopEnd,
    gateLength:   track.gateLength,
    pitch:        { ...track.pitch },
    ccLane:       { ...track.ccLane },
    steps:        track.steps.map(serializeStep),
  };
}

/** Snapshot the active track's live state into state.tracks before saving. */
function flushActiveTrack() {
  const state = get();
  const i = state.activeTrackIndex;
  const track = state.tracks[i];
  const flushed = {
    ...track,
    steps:       state.pattern.steps.map(s => ({ ...s, notes: [...s.notes] })),
    direction:   state.transport.direction,
    stepCount:   state.transport.stepCount,
    loopStart:   state.transport.loopStart,
    loopEnd:     state.transport.loopEnd,
    gateLength:  state.transport.gateLength,
    midiChannel: state.transport.midiChannel,
    pitch:       { ...state.pitch },
    ccLane:      { ...state.ccLane },
  };
  const tracks = state.tracks.map((t, idx) => idx === i ? flushed : t);
  set('tracks', tracks);
}

// ── Save ──────────────────────────────────────────────────────

export function save() {
  // Flush live edits into the active track and active scene before snapshotting
  flushActiveTrack();

  const state = get();

  // Also flush current tracks into the active scene
  const scenes = state.scenes.map((scene, si) => {
    if (si !== state.activeSceneIndex) return scene;
    return {
      ...scene,
      tracks: state.tracks.map(serializeTrack),
      swing:  state.transport.swing,
    };
  });

  const data = {
    version:          FILE_VERSION,
    transport:        { bpm: state.transport.bpm, swing: state.transport.swing },
    activeSceneIndex: state.activeSceneIndex,
    song:             { ...state.song },
    scenes:           scenes.map((scene, si) => ({
      name:   scene.name,
      swing:  scene.swing ?? 0,
      tracks: (scene.tracks || []).map(serializeTrack),
    })),
  };

  const name = state.scenes[state.activeSceneIndex]?.name ?? 'tessera';
  const json = JSON.stringify(data, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = `${name.replace(/\s+/g, '_')}.tessera.json`;
  a.click();
  URL.revokeObjectURL(url);
}

// ── Load ──────────────────────────────────────────────────────

export function load() {
  const input = document.createElement('input');
  input.type   = 'file';
  input.accept = '.json,.tessera.json';

  input.addEventListener('change', () => {
    const file = input.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = JSON.parse(e.target.result);
        if (data.scenes) {
          applyFullData(data);
        } else if (data.tracks) {
          applyMultiTrackData(data);
        } else {
          applyData(data);
        }
      } catch (err) {
        alert('Failed to load file: ' + err.message);
      }
    };
    reader.readAsText(file);
  });

  input.click();
}

// ── Apply v3 (full scenes + tracks) ──────────────────────────

export function applyFullData(data) {
  if (!data.scenes?.length) { alert('Invalid Tessera file.'); return; }

  // Global BPM
  if (data.transport?.bpm != null) {
    set('transport.bpm', data.transport.bpm);
    clock.setBpm(data.transport.bpm);
  }

  // Rebuild scenes
  const loadedScenes = data.scenes.map((sd, si) => {
    const base = defaultScene(si);
    const tracks = (sd.tracks || []).map((td, ti) => buildTrack(td, ti));
    return {
      ...base,
      name:   sd.name ?? base.name,
      swing:  sd.swing ?? 0,
      tracks,
    };
  });

  set('scenes', loadedScenes);

  // Restore song mode
  if (data.song) {
    set('song.enabled',      data.song.enabled      ?? false);
    set('song.entries',      data.song.entries       ?? []);
    set('song.activeEntry',  data.song.activeEntry   ?? 0);
    set('song.currentRepeat',data.song.currentRepeat ?? 0);
    set('song.queuedSceneIndex', null);
  }

  // Switch to saved active scene (loads its tracks into live state)
  const sceneIndex = Math.min(data.activeSceneIndex ?? 0, loadedScenes.length - 1);
  switchToSceneImmediate(sceneIndex);

  syncControlsUI();
}

// ── Apply v1 legacy (single pattern) ─────────────────────────

export function applyData(data) {
  if (!data.pattern?.steps) { alert('Invalid Tessera file.'); return; }

  if (data.transport) {
    const t = data.transport;
    if (t.bpm        != null) { set('transport.bpm', t.bpm); clock.setBpm(t.bpm); }
    if (t.swing      != null) set('transport.swing',      t.swing);
    if (t.gateLength != null) set('transport.gateLength', t.gateLength);
    if (t.direction  != null) set('transport.direction',  t.direction);
    if (t.stepCount  != null) { set('transport.stepCount', t.stepCount); clock.setStepCount(t.stepCount); }
    if (t.loopStart  != null) set('transport.loopStart',  t.loopStart);
    if (t.loopEnd    != null) set('transport.loopEnd',    t.loopEnd);
    if (t.midiChannel != null) set('transport.midiChannel', t.midiChannel);
  }
  if (data.pitch) {
    const p = data.pitch;
    if (p.scale     != null) set('pitch.scale',     p.scale);
    if (p.rootNote  != null) set('pitch.rootNote',  p.rootNote);
    if (p.transpose != null) set('pitch.transpose', p.transpose);
  }
  if (data.ccLane) {
    if (data.ccLane.visible  != null) set('ccLane.visible',  data.ccLane.visible);
    if (data.ccLane.ccNumber != null) set('ccLane.ccNumber', data.ccLane.ccNumber);
  }
  if (data.pattern.name) set('pattern.name', data.pattern.name);

  const steps = data.pattern.steps;
  for (let i = 0; i < 64; i++) {
    setStep(i, { ...defaultStep(), ...(steps[i] || {}) });
  }

  syncControlsUI();
}

// ── Apply v2 multi-track (from generators) ────────────────────

export function applyMultiTrackData(data) {
  if (!data.tracks?.length) return;

  if (data.transport) {
    const t = data.transport;
    if (t.bpm      != null) { set('transport.bpm', t.bpm); clock.setBpm(t.bpm); }
    if (t.stepCount != null) {
      set('transport.stepCount', t.stepCount);
      set('transport.loopEnd',   t.stepCount - 1);
      clock.setStepCount(t.stepCount);
    }
  }

  const tracks = data.tracks.map((td, i) => buildTrack(td, i));

  set('tracks', tracks);
  set('activeTrackIndex', 0);
  loadTrackIntoState(0);

  const sceneCount = Math.max(1, Math.min(8, data.sceneCount ?? 1));
  if (sceneCount > 1) {
    const scenes = get().scenes.slice();
    for (let i = 0; i < sceneCount; i++) {
      scenes[i] = {
        ...(scenes[i] || {}),
        tracks: tracks.map(t => ({ ...t, steps: t.steps.map(s => ({ ...s, notes: [...s.notes] })) })),
        swing: get().transport.swing,
      };
    }
    set('scenes', scenes);
    set('activeSceneIndex', 0);
  }

  syncControlsUI();
}

// ── Apply pending to a specific scene + track slot ───────────

/**
 * Merge a single-pattern payload (v1) into a specific scene and track
 * without touching any other scenes or tracks.
 */
export function applyPatternToTarget(data, sceneIndex, trackIndex) {
  const state   = get();
  const scenes  = state.scenes.slice();

  // Ensure the target scene exists
  while (scenes.length <= sceneIndex) {
    scenes.push(defaultScene(scenes.length));
  }

  const scene  = { ...scenes[sceneIndex] };
  const tracks = scene.tracks ? scene.tracks.map(t => ({ ...t })) : state.tracks.map(t => ({ ...t }));

  // Ensure the target track exists
  while (tracks.length <= trackIndex) {
    tracks.push(defaultTrack(tracks.length));
  }

  const base    = tracks[trackIndex];
  const t       = data.transport || {};
  const steps   = Array.from({ length: 64 }, defaultStep);
  (data.pattern?.steps || []).forEach((s, i) => { if (i < 64) steps[i] = { ...defaultStep(), ...s }; });

  tracks[trackIndex] = {
    ...base,
    direction:   t.direction   ?? base.direction,
    stepCount:   t.stepCount   ?? base.stepCount,
    loopStart:   t.loopStart   ?? base.loopStart,
    loopEnd:     t.loopEnd     ?? base.loopEnd,
    gateLength:  t.gateLength  ?? base.gateLength,
    midiChannel: t.midiChannel ?? base.midiChannel,
    pitch:       data.pitch    ? { ...data.pitch }   : { ...base.pitch },
    ccLane:      data.ccLane   ? { ...data.ccLane }  : { ...base.ccLane },
    steps,
  };

  scenes[sceneIndex] = { ...scene, tracks };
  set('scenes', scenes);

  // If the target scene is active, also load the track into live state
  if (sceneIndex === state.activeSceneIndex) {
    set('tracks', tracks);
    if (trackIndex === state.activeTrackIndex) {
      loadTrackIntoState(trackIndex);
    }
  }

  syncControlsUI();
}

/**
 * Merge a multi-track payload (v2, drums) into scenes starting at targetScene.
 */
export function applyMultiTrackToTarget(data, startSceneIndex) {
  const state  = get();
  const scenes = state.scenes.slice();

  const builtTracks = data.tracks.map((td, i) => buildTrack(td, i));
  const sceneCount  = Math.max(1, Math.min(8, data.sceneCount ?? 1));

  for (let si = 0; si < sceneCount; si++) {
    const idx = startSceneIndex + si;
    while (scenes.length <= idx) scenes.push(defaultScene(scenes.length));
    scenes[idx] = {
      ...scenes[idx],
      tracks: builtTracks.map(t => ({ ...t, steps: t.steps.map(s => ({ ...s, notes: [...s.notes] })) })),
      swing: scenes[idx].swing ?? 0,
    };
  }

  set('scenes', scenes);

  // Load into live state if the target scene is active
  if (startSceneIndex === state.activeSceneIndex) {
    set('tracks', scenes[startSceneIndex].tracks);
    set('activeTrackIndex', 0);
    loadTrackIntoState(0);
  }

  if (data.transport?.bpm != null) {
    set('transport.bpm', data.transport.bpm);
    clock.setBpm(data.transport.bpm);
  }

  syncControlsUI();
}

// ── Shared track builder ──────────────────────────────────────

function buildTrack(td, i) {
  const base = defaultTrack(i);
  return {
    ...base,
    name:         td.name         ?? base.name,
    color:        td.color        ?? base.color,
    midiOutputId: td.midiOutputId ?? null,
    synthPreset:  td.synthPreset  ?? null,
    midiChannel:  td.midiChannel  ?? base.midiChannel,
    mute:         td.mute         ?? false,
    direction:    td.direction    ?? 'forward',
    stepCount:    td.stepCount    ?? 64,
    loopStart:    td.loopStart    ?? 0,
    loopEnd:      td.loopEnd      ?? (td.stepCount ?? 64) - 1,
    gateLength:   td.gateLength   ?? 0.5,
    pitch:        td.pitch        ? { ...td.pitch }  : { ...base.pitch },
    ccLane:       td.ccLane       ? { ...td.ccLane } : { ...base.ccLane },
    steps: (() => {
      const s = Array.from({ length: 64 }, defaultStep);
      (td.steps || []).forEach((step, idx) => {
        if (idx < 64) s[idx] = { ...defaultStep(), ...step };
      });
      return s;
    })(),
  };
}

// ── Sync UI controls after load ───────────────────────────────

function syncControlsUI() {
  const state = get();
  const t = state.transport;
  const p = state.pitch;
  const el = id => document.getElementById(id);

  if (el('bpm-display'))    el('bpm-display').textContent = t.bpm;
  if (el('swing-slider'))   { el('swing-slider').value = t.swing; el('swing-val').textContent = t.swing + '%'; }
  if (el('gate-slider'))    { const g = Math.round(t.gateLength * 100); el('gate-slider').value = g; el('gate-val').textContent = g + '%'; }
  if (el('step-count-input'))  el('step-count-input').value  = t.stepCount;
  if (el('loop-start-input'))  el('loop-start-input').value  = t.loopStart + 1;
  if (el('loop-end-input'))    el('loop-end-input').value    = t.loopEnd + 1;
  if (el('channel-input'))     el('channel-input').value     = t.midiChannel;
  if (el('scale-select'))      el('scale-select').value      = p.scale;
  if (el('root-select'))       el('root-select').value       = p.rootNote;
  if (el('transpose-input'))   el('transpose-input').value   = p.transpose;
  if (el('cc-toggle'))         el('cc-toggle').checked       = state.ccLane.visible;
  if (el('cc-number-input'))   el('cc-number-input').value   = state.ccLane.ccNumber;

  document.querySelectorAll('.dir-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.dir === t.direction);
  });
}
