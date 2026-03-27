const MAX_TAPS = 8;
const RESET_INTERVAL = 2000; // ms

let taps = [];

export function tap() {
  const now = performance.now();

  if (taps.length > 0 && now - taps[taps.length - 1] > RESET_INTERVAL) {
    taps = [];
  }

  taps.push(now);

  if (taps.length > MAX_TAPS) taps.shift();
  if (taps.length < 2) return null;

  const intervals = [];
  for (let i = 1; i < taps.length; i++) {
    intervals.push(taps[i] - taps[i - 1]);
  }

  const avg = intervals.reduce((a, b) => a + b, 0) / intervals.length;
  return Math.round(60000 / avg);
}

export function reset() {
  taps = [];
}
