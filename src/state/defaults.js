export function defaultStep() {
  return {
    notes: [],
    velocity: 100,
    probability: 100,
    muted: false,
    glide: false,
    substeps: 1,
    cc: null,
  };
}

export function defaultPattern() {
  return {
    id: 'default',
    name: 'Pattern 1',
    steps: Array.from({ length: 64 }, defaultStep),
  };
}

export const TRACK_COLORS = [
  '#7c4dff', '#00c853', '#ffab00', '#00e5ff',
  '#ff3d00', '#e040fb', '#40c4ff', '#69f0ae',
];

export function defaultTrack(index) {
  return {
    id: `track-${index}-${Date.now()}`,
    name: `Track ${index + 1}`,
    color: TRACK_COLORS[index % TRACK_COLORS.length],
    midiOutputId: null,   // null = use global output from toolbar
    synthPreset: null,    // null = use global SYNTH selector; set to a preset id for per-track sound
    midiChannel: Math.min(16, index + 1),
    mute: false,
    solo: false,
    // per-track sequencer settings
    direction:  'forward',
    stepCount:  64,
    loopStart:  0,
    loopEnd:    63,
    gateLength: 0.5,
    pitch:   { scale: 'chromatic', rootNote: 60, transpose: 0 },
    ccLane:  { visible: false, ccNumber: 74 },
    steps: Array.from({ length: 64 }, defaultStep),
  };
}

export function defaultScene(index) {
  return {
    name: `Scene ${index + 1}`,
    steps: Array.from({ length: 64 }, defaultStep),
    transport: {
      direction: 'forward',
      stepCount: 64,
      loopStart: 0,
      loopEnd: 63,
      gateLength: 0.5,
      swing: 0,
      midiChannel: 1,
    },
    pitch: {
      scale: 'chromatic',
      rootNote: 60,
      transpose: 0,
    },
    ccLane: {
      visible: false,
      ccNumber: 74,
    },
  };
}
