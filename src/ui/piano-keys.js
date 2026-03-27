import { get, set } from '../state/state.js';
import { on } from '../utils/event-bus.js';
import { isBlackKey, midiNoteToName } from '../utils/math.js';
import { noteOn, noteOff } from '../midi/midi-output.js';
import { isInScale } from '../engine/scale.js';

const KEY_HEIGHT = 20;
const WIDTH = 52;

// Color constants matching CSS variables
const C = {
  keyActive:       '#7c4dff',
  keyBlack:        '#1a1a1e',
  keyBlackScale:   '#252530',
  keyWhite:        '#c8c8d0',
  keyWhiteScale:   '#c4b0ff',
  border:          '#33333a',
};

let canvas, ctx;

export function initPianoKeys(canvasEl) {
  canvas = canvasEl;
  ctx = canvas.getContext('2d');

  canvas.addEventListener('mousedown', onMouseDown);
  window.addEventListener('mouseup', onMouseUp);

  on('stateChange', ({ path }) => {
    if (path.startsWith('ui.') || path.startsWith('pitch.') || path === 'transport.midiChannel') {
      render();
      // Keep piano-keys-wrapper height in sync with canvas
      if (canvas.parentElement) {
        canvas.parentElement.style.height = canvas.height + 'px';
      }
    }
  });
  on('sequencer:step', () => render());

  render();
}

function render() {
  const state = get();
  const { gridScrollTop, viewRangeNotes, activeNotes } = state.ui;
  const { scale, rootNote } = state.pitch;

  const h = viewRangeNotes * KEY_HEIGHT;
  canvas.width = WIDTH;
  canvas.height = h;
  canvas.style.width  = WIDTH + 'px';
  canvas.style.height = h + 'px';

  ctx.clearRect(0, 0, WIDTH, h);

  for (let i = 0; i < viewRangeNotes; i++) {
    const midiNote = gridScrollTop + viewRangeNotes - 1 - i;
    if (midiNote < 0 || midiNote > 127) continue;

    const y = i * KEY_HEIGHT;
    const black = isBlackKey(midiNote);
    const inScale = isInScale(midiNote, rootNote, scale);
    const active = activeNotes.has(midiNote);

    if (active) {
      ctx.fillStyle = C.keyActive;
    } else if (black) {
      ctx.fillStyle = inScale ? C.keyBlackScale : C.keyBlack;
    } else {
      ctx.fillStyle = inScale ? C.keyWhiteScale : C.keyWhite;
    }
    ctx.fillRect(0, y, WIDTH, KEY_HEIGHT);

    ctx.strokeStyle = C.border;
    ctx.lineWidth = 1;
    ctx.strokeRect(0, y, WIDTH, KEY_HEIGHT);

    // Black key right-side shadow
    if (black) {
      ctx.fillStyle = 'rgba(0,0,0,0.35)';
      ctx.fillRect(WIDTH * 0.62, y, WIDTH * 0.38, KEY_HEIGHT);
    }

    // C label
    const name = midiNoteToName(midiNote);
    if (name.startsWith('C') && !name.includes('#')) {
      ctx.fillStyle = active ? '#fff' : '#555566';
      ctx.font = '9px Inter, system-ui, sans-serif';
      ctx.textAlign = 'right';
      ctx.textBaseline = 'bottom';
      ctx.fillText(name, WIDTH - 3, y + KEY_HEIGHT - 2);
    }
  }
}

let pressedNote = null;

function onMouseDown(e) {
  const state = get();
  const rect = canvas.getBoundingClientRect();
  const y = e.clientY - rect.top;
  const i = Math.floor(y / KEY_HEIGHT);
  const midiNote = state.ui.gridScrollTop + state.ui.viewRangeNotes - 1 - i;
  if (midiNote < 0 || midiNote > 127) return;

  pressedNote = midiNote;
  noteOn(state.transport.midiChannel, midiNote, 100, performance.now());

  const active = new Set(state.ui.activeNotes);
  active.add(midiNote);
  set('ui.activeNotes', active);
}

function onMouseUp() {
  if (pressedNote === null) return;
  const state = get();
  noteOff(state.transport.midiChannel, pressedNote, performance.now());
  const active = new Set(state.ui.activeNotes);
  active.delete(pressedNote);
  set('ui.activeNotes', active);
  pressedNote = null;
}
