import { initMidi } from './midi/midi-access.js';
import * as clock from './clock/clock.js';
import { initScheduler } from './engine/scheduler.js';
import { initGrid } from './ui/grid.js';
import { initPianoKeys } from './ui/piano-keys.js';
import { initVelocityLane } from './ui/velocity-lane.js';
import { initCcLane } from './ui/cc-lane.js';
import { initGlideSubstepLane } from './ui/glide-substep-lane.js';
import { initStepEditor } from './ui/step-editor.js';
import { initToolbar } from './ui/toolbar.js';
import { initControls } from './ui/controls.js';
import { initRandomize } from './ui/randomize.js';
import { initSceneBar } from './ui/scene-bar.js';
import { initTrackStrip } from './ui/track-strip.js';
import { initScenes } from './scenes/scene-manager.js';
import { get, setStep } from './state/state.js';
import { save, load, applyData, applyMultiTrackData, applyPatternToTarget, applyMultiTrackToTarget, autosave, restoreAutosave } from './phase2/persistence.js';

async function main() {
  // 1. MIDI
  await initMidi();

  // 2. Clock
  clock.init();

  // 3. Scheduler (bridges clock ticks → sequencer → MIDI)
  initScheduler();

  // 4. UI
  initGrid(document.getElementById('grid-canvas-container'));
  initPianoKeys(document.getElementById('piano-keys-canvas'));
  initVelocityLane(document.getElementById('velocity-canvas'));
  initCcLane(document.getElementById('cc-canvas'));
  initGlideSubstepLane(
    document.getElementById('glide-canvas'),
    document.getElementById('substep-canvas'),
  );
  initStepEditor(document.getElementById('step-editor'));
  initToolbar(document.getElementById('toolbar'));
  initControls();
  initRandomize(document.getElementById('randomize-panel'));
  initScenes();
  initSceneBar();
  initTrackStrip();

  // 5. Initial CC lane visibility
  const state = get();
  document.getElementById('cc-lane-row').style.display = state.ccLane.visible ? 'flex' : 'none';

  // 6. Disable browser context menu everywhere except track cards (right-click to remove)
  document.addEventListener('contextmenu', e => {
    if (!e.target.closest('.track-card')) e.preventDefault();
  });

  // 7. Clear button
  document.getElementById('clear-btn').addEventListener('click', () => {
    const stepCount = get().transport.stepCount;
    for (let i = 0; i < stepCount; i++) {
      setStep(i, { notes: [], glide: false, substeps: 1, velocity: 100, probability: 100, muted: false, cc: null });
    }
  });

  // 8. Save / Load
  document.getElementById('save-btn').addEventListener('click', save);
  document.getElementById('load-btn').addEventListener('click', load);

  // 9. Always restore session state first (preserves scenes/tracks across page navigations).
  //    sessionStorage is tab-scoped so a fresh tab always starts clean.
  restoreAutosave();

  // 10. Load pattern sent from Generate / Recorder page (applied on top of restored state).
  const pending = localStorage.getItem('tessera_pending');
  if (pending) {
    localStorage.removeItem('tessera_pending');
    try {
      const data = JSON.parse(pending);
      const hasTarget = data.targetScene != null;

      if (data.tracks) {
        hasTarget
          ? applyMultiTrackToTarget(data, data.targetScene)
          : applyMultiTrackData(data);
      } else {
        hasTarget
          ? applyPatternToTarget(data, data.targetScene, data.targetTrack ?? 0)
          : applyData(data);
      }
    } catch (e) { console.error('Failed to load pending pattern', e); }
  }

  // 11. Auto-save on every navigation away from this page.
  //     Both pagehide and nav link clicks are covered for maximum reliability.
  window.addEventListener('pagehide', autosave);
  document.querySelectorAll('#page-nav a').forEach(a => {
    a.addEventListener('click', autosave, { capture: true });
  });

  // 10. Keyboard shortcuts
  document.addEventListener('keydown', (e) => {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT') return;

    switch (e.code) {
      case 'Space':
        e.preventDefault();
        document.getElementById('play-btn').click();
        break;
      case 'Escape':
        document.getElementById('stop-btn').click();
        document.getElementById('step-editor').classList.remove('open');
        document.getElementById('randomize-panel').classList.remove('open');
        document.getElementById('overlay').classList.remove('open');
        break;
    }
  });
}

main().catch(console.error);
