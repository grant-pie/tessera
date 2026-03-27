import { getOutput } from './midi-access.js';

// Track notes that are currently on per channel so we can send proper note-offs
const activeNotes = new Map(); // channel -> Set of note numbers
let previousStepNotes = [];
let previousStepGlide = false;

export function noteOn(channel, note, velocity, time) {
  const port = getOutput();
  if (!port) return;

  const ch = (channel - 1) & 0x0F;
  port.send([0x90 | ch, note & 0x7F, velocity & 0x7F], time);

  if (!activeNotes.has(channel)) activeNotes.set(channel, new Set());
  activeNotes.get(channel).add(note);
}

export function noteOff(channel, note, time) {
  const port = getOutput();
  if (!port) return;

  const ch = (channel - 1) & 0x0F;
  port.send([0x80 | ch, note & 0x7F, 0], time);

  activeNotes.get(channel)?.delete(note);
}

export function sendCC(channel, ccNumber, value, time) {
  const port = getOutput();
  if (!port) return;

  const ch = (channel - 1) & 0x0F;
  port.send([0xB0 | ch, ccNumber & 0x7F, value & 0x7F], time);
}

export function allNotesOff(channel) {
  const port = getOutput();
  if (!port) return;

  const ch = (channel - 1) & 0x0F;
  port.send([0xB0 | ch, 123, 0]); // All Notes Off CC
  activeNotes.get(channel)?.clear();
  previousStepNotes = [];
}

/**
 * Fire a step: sends note-offs for previous step (unless glide), then note-ons for current step.
 * @param {number} channel
 * @param {number[]} notes - MIDI note numbers to play
 * @param {number} velocity
 * @param {boolean} glide - if true, overlap with previous notes (legato)
 * @param {number} tickTime - DOMHighResTimeStamp for scheduling
 * @param {number} noteOffTime - when to send note-off
 */
export function fireStep(channel, notes, velocity, glide, tickTime, noteOffTime) {
  const hasNotes = notes.length > 0;
  const comingFromGlide = previousStepGlide && hasNotes;

  if (comingFromGlide) {
    // Glide/portamento transition:
    // Send note-on for NEW pitches first, while previous notes are still held.
    // On slide synths (Monologue, 303 etc.) this overlap is what triggers portamento.
    for (const note of notes) {
      if (!previousStepNotes.includes(note)) {
        noteOn(channel, note, velocity, tickTime);
      }
      // Same note continuing — no note-on, no note-off (seamless hold)
    }
    // Release previous notes that aren't continuing
    for (const note of previousStepNotes) {
      if (!notes.includes(note)) {
        noteOff(channel, note, tickTime);
      }
    }
  } else {
    // Normal step: close previous notes, then open new ones
    for (const note of previousStepNotes) {
      noteOff(channel, note, tickTime);
    }
    for (const note of notes) {
      noteOn(channel, note, velocity, tickTime);
    }
  }

  // Schedule note-offs — unless this step is gliding (hold into next step)
  if (!glide && hasNotes) {
    for (const note of notes) {
      noteOff(channel, note, noteOffTime);
    }
  }

  previousStepNotes = hasNotes ? [...notes] : [];
  previousStepGlide = glide && hasNotes;
}

export function resetGlideState() {
  previousStepNotes = [];
  previousStepGlide = false;
}
