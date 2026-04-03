import { getOutput } from './midi-access.js';

// Per-channel active note tracking (channel -> Set<note>)
const activeNotes = new Map();

// Per-track glide state (trackKey -> { previousNotes, previousGlide })
const glideState = new Map();

function getGlide(trackKey) {
  if (!glideState.has(trackKey)) {
    glideState.set(trackKey, { previousNotes: [], previousGlide: false });
  }
  return glideState.get(trackKey);
}

export function noteOn(channel, note, velocity, time, port) {
  const p = port ?? getOutput();
  if (!p) return;

  const ch = (channel - 1) & 0x0F;
  p.send([0x90 | ch, note & 0x7F, velocity & 0x7F], time);

  if (!activeNotes.has(channel)) activeNotes.set(channel, new Set());
  activeNotes.get(channel).add(note);
}

export function noteOff(channel, note, time, port) {
  const p = port ?? getOutput();
  if (!p) return;

  const ch = (channel - 1) & 0x0F;
  p.send([0x80 | ch, note & 0x7F, 0], time);

  activeNotes.get(channel)?.delete(note);
}

export function sendCC(channel, ccNumber, value, time, port) {
  const p = port ?? getOutput();
  if (!p) return;

  const ch = (channel - 1) & 0x0F;
  p.send([0xB0 | ch, ccNumber & 0x7F, value & 0x7F], time);
}

export function allNotesOff(channel, port, trackKey) {
  const p = port ?? getOutput();
  if (!p) return;

  const ch = (channel - 1) & 0x0F;
  p.send([0xB0 | ch, 123, 0]); // All Notes Off CC
  activeNotes.get(channel)?.clear();

  if (trackKey !== undefined) {
    const g = getGlide(trackKey);
    g.previousNotes = [];
    g.previousGlide = false;
  }
}

/**
 * Send all-notes-off to every known track. Called on transport stop.
 * @param {Array} tracks - array of track objects from state
 * @param {Function} getPortFn - (track) => MIDIOutput | null
 */
export function allTracksOff(tracks, getPortFn) {
  tracks.forEach(track => {
    const port = getPortFn(track);
    if (port) {
      const ch = (track.midiChannel - 1) & 0x0F;
      port.send([0xB0 | ch, 123, 0]);
    }
  });
  glideState.clear();
  activeNotes.clear();
}

/**
 * Fire a step for a specific track.
 * @param {number}  channel
 * @param {number[]} notes
 * @param {number}  velocity
 * @param {boolean} glide
 * @param {number}  tickTime
 * @param {number}  noteOffTime
 * @param {object|null} port      - MIDIOutput port (null = use global)
 * @param {*}       trackKey      - unique key per track for glide state isolation
 */
export function fireStep(channel, notes, velocity, glide, tickTime, noteOffTime, port, trackKey = 0) {
  const g = getGlide(trackKey);
  const hasNotes = notes.length > 0;
  const comingFromGlide = g.previousGlide && hasNotes;

  if (comingFromGlide) {
    for (const note of notes) {
      if (!g.previousNotes.includes(note)) {
        noteOn(channel, note, velocity, tickTime, port);
      }
      // Same note continuing — seamless hold, no note-on/off
    }
    for (const note of g.previousNotes) {
      if (!notes.includes(note)) {
        noteOff(channel, note, tickTime, port);
      }
    }
  } else {
    for (const note of g.previousNotes) {
      noteOff(channel, note, tickTime, port);
    }
    for (const note of notes) {
      noteOn(channel, note, velocity, tickTime, port);
    }
  }

  if (!glide && hasNotes) {
    for (const note of notes) {
      noteOff(channel, note, noteOffTime, port);
    }
  }

  g.previousNotes = hasNotes ? [...notes] : [];
  g.previousGlide = glide && hasNotes;
}

export function resetGlideState(trackKey = 0) {
  glideState.delete(trackKey);
}

export function resetAllGlideStates() {
  glideState.clear();
}
