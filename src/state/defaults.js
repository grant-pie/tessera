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
