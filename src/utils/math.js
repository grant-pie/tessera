export function clamp(val, min, max) {
  return Math.min(Math.max(val, min), max);
}

export function lerp(a, b, t) {
  return a + (b - a) * t;
}

export function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

export function swingOffset(stepIndex, swingPercent, stepDuration) {
  if (swingPercent === 0) return 0;
  // Apply swing to odd steps (every other 16th note)
  if (stepIndex % 2 === 1) {
    return (swingPercent / 100) * (stepDuration * 2 / 3);
  }
  return 0;
}

const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

export function midiNoteToName(n) {
  const octave = Math.floor(n / 12) - 1;
  const name = NOTE_NAMES[n % 12];
  return `${name}${octave}`;
}

export function noteNameToMidi(name) {
  const match = name.match(/^([A-G]#?)(-?\d+)$/);
  if (!match) return null;
  const noteIndex = NOTE_NAMES.indexOf(match[1]);
  const octave = parseInt(match[2], 10);
  return (octave + 1) * 12 + noteIndex;
}

export function isBlackKey(midiNote) {
  return [1, 3, 6, 8, 10].includes(midiNote % 12);
}
