// Phase 2: Euclidean rhythm generator (Bjorklund algorithm)
// TODO: wire up UI panel and apply to active pattern

/**
 * Generates a Euclidean rhythm pattern.
 * @param {number} hits - number of active steps
 * @param {number} steps - total number of steps
 * @param {number} rotation - shift offset
 * @returns {boolean[]} array of booleans (true = active step)
 */
export function euclidean(hits, steps, rotation = 0) {
  if (hits <= 0) return new Array(steps).fill(false);
  if (hits >= steps) return new Array(steps).fill(true);

  // Bjorklund algorithm
  let pattern = [];
  let counts = [];
  let remainders = [];

  let divisor = steps - hits;
  remainders.push(hits);
  let level = 0;

  while (true) {
    counts.push(Math.floor(divisor / remainders[level]));
    remainders.push(divisor % remainders[level]);
    divisor = remainders[level];
    level++;
    if (remainders[level] <= 1) break;
  }

  counts.push(divisor);

  function build(l) {
    if (l === -1) {
      pattern.push(false);
    } else if (l === -2) {
      pattern.push(true);
    } else {
      for (let i = 0; i < counts[l]; i++) build(l - 1);
      if (remainders[l] !== 0) build(l - 2);
    }
  }

  build(level);

  // Rotate
  const rot = ((rotation % steps) + steps) % steps;
  return [...pattern.slice(rot), ...pattern.slice(0, rot)];
}

export function applyEuclidean(/* state, hits, steps, rotation, note, velocity */) {
  console.warn('Phase 2: applyEuclidean not yet implemented');
}
