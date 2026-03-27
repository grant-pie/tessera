import { get, set } from './recorder-state.js';
import { emit } from '../utils/event-bus.js';
import { getMidiAccess } from '../midi/midi-access.js';

const LOOKAHEAD_MS = 100;
const INTERVAL_MS  = 25;

let playing       = false;
let looping       = false;
let events        = [];
let durationMs    = 0;
let originTime    = 0;       // performance.now() at start of current loop iteration
let nextIdx       = 0;
let timerId       = null;

export function startPlayback() {
  const state = get();
  if (!state.recording.events.length) return;

  events     = [...state.recording.events].sort((a, b) => a.offsetMs - b.offsetMs);
  durationMs = state.recording.durationMs;
  looping    = state.transport.loop;
  originTime = performance.now();
  nextIdx    = 0;
  playing    = true;

  set('transport.mode', 'playing');
  emit('recorder:playing');
  schedule();
}

export function stopPlayback() {
  playing = false;
  clearTimeout(timerId);
  sendAllNotesOff();
  set('transport.mode', 'idle');
  set('playback.positionMs', 0);
  emit('recorder:stopped');
}

function schedule() {
  if (!playing) return;

  const now     = performance.now();
  const horizon = now + LOOKAHEAD_MS;

  // Send all events whose scheduled time falls within the lookahead window
  while (nextIdx < events.length) {
    const ev = events[nextIdx];
    const absTime = originTime + ev.offsetMs;
    if (absTime > horizon) break;
    sendEvent(ev, absTime);
    nextIdx++;
  }

  // Update playback position for the UI
  const positionMs = Math.min(now - originTime, durationMs);
  set('playback.positionMs', positionMs);
  emit('recorder:tick', { positionMs });

  // Check if we've passed the end of the recording
  if (now - originTime >= durationMs) {
    if (looping) {
      // Advance origin by exactly one duration to preserve timing accuracy
      originTime += durationMs;
      nextIdx = 0;
      emit('recorder:loopRestart');
    } else {
      stopPlayback();
      return;
    }
  }

  timerId = setTimeout(schedule, INTERVAL_MS);
}

function sendEvent(ev, absTime) {
  const port = getOutputPort();
  if (!port) return;

  const ch = (ev.channel - 1) & 0x0F;

  if (ev.type === 'noteOn') {
    port.send([0x90 | ch, ev.note & 0x7F, ev.velocity & 0x7F], absTime);
  } else if (ev.type === 'noteOff') {
    port.send([0x80 | ch, ev.note & 0x7F, 0], absTime);
  } else if (ev.type === 'cc') {
    port.send([0xB0 | ch, ev.cc & 0x7F, ev.value & 0x7F], absTime);
  }
}

export function sendAllNotesOff() {
  const port = getOutputPort();
  if (!port) return;

  const state = get();
  const channels = state.transport.channelFilter === 0
    ? [1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16]
    : [state.transport.channelFilter];

  for (const ch of channels) {
    port.send([0xB0 | (ch - 1), 123, 0]); // All Notes Off
  }
}

function getOutputPort() {
  const state = get();
  const access = getMidiAccess();
  if (!access || !state.midi.outputId) return null;
  return access.outputs.get(state.midi.outputId) || null;
}

export function isPlaying() {
  return playing;
}
