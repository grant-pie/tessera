export const SCALES = {
  chromatic:       [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11],
  major:           [0, 2, 4, 5, 7, 9, 11],
  minor:           [0, 2, 3, 5, 7, 8, 10],
  harmonicMinor:   [0, 2, 3, 5, 7, 8, 11],
  melodicMinor:    [0, 2, 3, 5, 7, 9, 11],
  dorian:          [0, 2, 3, 5, 7, 9, 10],
  phrygian:        [0, 1, 3, 5, 7, 8, 10],
  lydian:          [0, 2, 4, 6, 7, 9, 11],
  mixolydian:      [0, 2, 4, 5, 7, 9, 10],
  locrian:         [0, 1, 3, 5, 6, 8, 10],
  pentatonicMajor: [0, 2, 4, 7, 9],
  pentatonicMinor: [0, 3, 5, 7, 10],
  blues:           [0, 3, 5, 6, 7, 10],
  wholeTone:       [0, 2, 4, 6, 8, 10],
  diminished:      [0, 2, 3, 5, 6, 8, 9, 11],
};

export const SCALE_NAMES = {
  chromatic:       'Chromatic',
  major:           'Major',
  minor:           'Natural Minor',
  harmonicMinor:   'Harmonic Minor',
  melodicMinor:    'Melodic Minor',
  dorian:          'Dorian',
  phrygian:        'Phrygian',
  lydian:          'Lydian',
  mixolydian:      'Mixolydian',
  locrian:         'Locrian',
  pentatonicMajor: 'Pentatonic Major',
  pentatonicMinor: 'Pentatonic Minor',
  blues:           'Blues',
  wholeTone:       'Whole Tone',
  diminished:      'Diminished',
};

/**
 * Returns true if the MIDI note is in the given scale with the given root.
 */
export function isInScale(midiNote, rootNote, scaleName) {
  if (scaleName === 'chromatic') return true;
  const intervals = SCALES[scaleName] || SCALES.chromatic;
  const semitone = ((midiNote - rootNote) % 12 + 12) % 12;
  return intervals.includes(semitone);
}

/**
 * Snaps a MIDI note to the nearest in-scale note.
 */
export function quantizeToScale(midiNote, rootNote, scaleName, transpose = 0) {
  const note = midiNote + transpose;
  if (isInScale(note, rootNote, scaleName)) return clamp(note, 0, 127);

  const intervals = SCALES[scaleName] || SCALES.chromatic;
  const semitone = ((note - rootNote) % 12 + 12) % 12;

  // Find nearest interval
  let closest = intervals[0];
  let minDist = Math.abs(semitone - intervals[0]);
  for (const interval of intervals) {
    const d = Math.abs(semitone - interval);
    if (d < minDist) { minDist = d; closest = interval; }
  }

  const octave = Math.floor((note - rootNote) / 12);
  const quantized = rootNote + octave * 12 + closest;
  return clamp(quantized, 0, 127);
}

/**
 * Returns all MIDI notes in the given scale across the full range (0-127).
 */
export function getScaleNotes(rootNote, scaleName) {
  const intervals = SCALES[scaleName] || SCALES.chromatic;
  const notes = [];
  for (let n = 0; n <= 127; n++) {
    const semitone = ((n - rootNote) % 12 + 12) % 12;
    if (intervals.includes(semitone)) notes.push(n);
  }
  return notes;
}

function clamp(v, min, max) {
  return Math.min(Math.max(v, min), max);
}
