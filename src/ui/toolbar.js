import { get, set } from '../state/state.js';
import { on, emit } from '../utils/event-bus.js';
import { tap as tapTempo } from '../utils/tap-tempo.js';
import * as clock from '../clock/clock.js';
import { resetCursor } from '../engine/sequencer.js';
import { resetAllTrackCursors } from '../engine/scheduler.js';
import { allTracksOff, resetAllGlideStates } from '../midi/midi-output.js';
import { getInput, getOutputById } from '../midi/midi-access.js';

export function initToolbar(toolbarEl) {
  const playBtn        = toolbarEl.querySelector('#play-btn');
  const stopBtn        = toolbarEl.querySelector('#stop-btn');
  const bpmDisplay     = toolbarEl.querySelector('#bpm-display');
  const bpmUp          = toolbarEl.querySelector('#bpm-up');
  const bpmDown        = toolbarEl.querySelector('#bpm-down');
  const tapBtn         = toolbarEl.querySelector('#tap-btn');
  const clockSourceBtn = toolbarEl.querySelector('#clock-source-btn');

  // ── Transport ──────────────────────────────────────────
  let paused = false;

  playBtn.addEventListener('click', () => {
    const state = get();

    if (state.transport.playing) {
      // Pause — stop clock but keep cursor positions
      clock.stop();
      set('transport.playing', false);
      paused = true;
      return;
    }

    // Resume from pause or fresh play
    if (!paused) {
      // Fresh start — reset all cursors to the beginning
      resetAllTrackCursors();
      resetCursor();
    }
    paused = false;
    set('transport.playing', true);
    clock.start({
      bpm: state.transport.bpm,
      swing: state.transport.swing,
      stepCount: state.transport.stepCount,
    });
  });

  stopBtn.addEventListener('click', doStop);

  function doStop() {
    const state = get();
    paused = false;
    clock.stop();
    resetAllTrackCursors();
    allTracksOff(state.tracks, (track) => {
      return getOutputById(track.midiOutputId || state.midi.outputId);
    });
    resetAllGlideStates();
    set('transport.playing', false);
    set('cursor.step', -1);
    emit('sequencer:step', { step: -1 });
  }

  // ── BPM ────────────────────────────────────────────────
  function updateBpm(newBpm) {
    const clamped = Math.max(20, Math.min(300, Math.round(newBpm)));
    set('transport.bpm', clamped);
    clock.setBpm(clamped);
    bpmDisplay.textContent = clamped;
  }

  bpmUp.addEventListener('click', () => updateBpm(get().transport.bpm + 1));
  bpmDown.addEventListener('click', () => updateBpm(get().transport.bpm - 1));

  bpmDisplay.addEventListener('dblclick', () => {
    const current = get().transport.bpm;
    const input = document.createElement('input');
    input.type = 'number';
    input.value = current;
    input.min = 20; input.max = 300;
    Object.assign(input.style, {
      width: '56px', fontSize: '18px', fontWeight: '700',
      fontFamily: 'var(--font-mono)', background: 'var(--bg-3)',
      color: 'var(--text-primary)', border: '1px solid var(--accent)',
      borderRadius: '2px', textAlign: 'center',
    });
    bpmDisplay.replaceWith(input);
    input.focus(); input.select();
    const finish = () => {
      const val = parseInt(input.value, 10);
      if (!isNaN(val)) updateBpm(val);
      input.replaceWith(bpmDisplay);
      bpmDisplay.textContent = get().transport.bpm;
    };
    input.addEventListener('blur', finish);
    input.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); finish(); } });
  });

  bpmDisplay.addEventListener('wheel', (e) => {
    e.preventDefault();
    updateBpm(get().transport.bpm + (e.deltaY < 0 ? 1 : -1));
  }, { passive: false });

  // ── Tap tempo ──────────────────────────────────────────
  tapBtn.addEventListener('click', () => {
    const bpm = tapTempo();
    if (bpm !== null) {
      updateBpm(bpm);
      tapBtn.classList.add('flash');
      setTimeout(() => tapBtn.classList.remove('flash'), 150);
    }
  });

  // ── Clock source ───────────────────────────────────────
  function updateClockSourceBtn() {
    const src = get().transport.clockSource;
    clockSourceBtn.textContent = src === 'internal' ? 'INT' : 'EXT';
    clockSourceBtn.classList.toggle('active', src === 'external');
    clockSourceBtn.title = src === 'internal'
      ? 'Clock: Internal — click to switch to External MIDI'
      : 'Clock: External MIDI — click to switch to Internal';
  }

  updateClockSourceBtn();

  clockSourceBtn.addEventListener('click', () => {
    const current = get().transport.clockSource;
    const next = current === 'internal' ? 'external' : 'internal';
    set('transport.clockSource', next);
    clock.setSource(next, next === 'external' ? getInput() : null);
    updateClockSourceBtn();
  });

  // ── React to state ─────────────────────────────────────
  on('stateChange', ({ path }) => {
    if (path === 'transport.bpm') bpmDisplay.textContent = get().transport.bpm;
    if (path === 'transport.playing') {
      const playing = get().transport.playing;
      playBtn.classList.toggle('active', playing);
      playBtn.textContent = playing ? '⏸' : '▶';
      playBtn.title = playing ? 'Pause (Space)' : 'Play (Space)';
    }
  });

  // Sync BPM display on load
  bpmDisplay.textContent = get().transport.bpm;

  // Update BPM display (read-only) when driven by external clock
  on('externalClock:bpm', ({ bpm }) => {
    if (get().transport.clockSource === 'external') {
      bpmDisplay.textContent = bpm;
    }
  });
}
