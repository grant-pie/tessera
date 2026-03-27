import { initMidi, getMidiAccess } from '../midi/midi-access.js';
import { get as getRecState, set as setRecState } from './recorder-state.js';
import { initRecorderUI } from './recorder-ui.js';
import { initRecorderVis } from '../ui/recorder-vis.js';
import { undo, redo } from './recorder-history.js';

async function main() {
  // 1. Request MIDI access
  const ok = await initMidi();
  if (!ok) {
    document.getElementById('midi-status').textContent =
      'Web MIDI not available — use Chrome or Edge';
  }

  // 2. Mirror MIDI port list into recorder state
  syncMidiPorts();

  // 3. Visualisation
  initRecorderVis(
    document.getElementById('vis-canvas-bg'),
    document.getElementById('vis-canvas-cursor'),
  );

  // 4. UI
  initRecorderUI();

  // 5. Keyboard shortcuts
  document.addEventListener('contextmenu', e => e.preventDefault());
  document.addEventListener('keydown', (e) => {
    if (e.target.tagName === 'INPUT') return;

    if (e.ctrlKey && e.key === 'z') { e.preventDefault(); undo(); return; }
    if (e.ctrlKey && e.key === 'r') { e.preventDefault(); redo(); return; }
    if (e.code === 'Space') {
      e.preventDefault();
      const mode = getRecState().transport.mode;
      if (mode === 'recording') {
        document.getElementById('rec-record-btn').click();
      } else if (mode === 'playing') {
        document.getElementById('rec-play-btn').click();
      } else {
        document.getElementById('rec-record-btn').click();
      }
    }
    if (e.code === 'Escape') {
      document.getElementById('rec-stop-btn').click();
    }
  });
}

function syncMidiPorts() {
  // The shared midi-access module stores ports in the sequencer's state.
  // Read directly from MIDIAccess to avoid coupling.
  const access = getMidiAccess();
  if (!access) return;

  const outputs = [];
  access.outputs.forEach(p => outputs.push({ id: p.id, name: p.name }));
  const inputs = [];
  access.inputs.forEach(p => inputs.push({ id: p.id, name: p.name }));

  setRecState('midi.outputs', outputs);
  setRecState('midi.inputs',  inputs);

  // Re-sync when devices are plugged/unplugged
  access.onstatechange = () => syncMidiPorts();
}

main().catch(console.error);
