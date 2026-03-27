// Web Worker: lookahead clock scheduler
// Posts { type: 'TICK', tickTime, stepIndex, swingOffset } messages

let bpm = 120;
let swing = 0;
let stepCount = 64;
let playing = false;
let stepIndex = 0;
let nextTickTime = 0;
const LOOKAHEAD = 100;   // ms — how far ahead to schedule
const SCHEDULE_INTERVAL = 25; // ms — how often to check

function stepDuration() {
  return 60000 / bpm / 4; // 16th note duration in ms
}

function calcSwingOffset(idx) {
  if (swing === 0) return 0;
  if (idx % 2 === 1) {
    return (swing / 100) * (stepDuration() * 2 / 3);
  }
  return 0;
}

function schedule() {
  if (!playing) return;

  const now = performance.now();

  while (nextTickTime < now + LOOKAHEAD) {
    const swingOffset = calcSwingOffset(stepIndex);
    self.postMessage({
      type: 'TICK',
      tickTime: nextTickTime + swingOffset,
      stepIndex,
      swingOffset,
    });

    stepIndex = (stepIndex + 1) % stepCount;
    nextTickTime += stepDuration();
  }

  setTimeout(schedule, SCHEDULE_INTERVAL);
}

self.onmessage = (e) => {
  const { type } = e.data;

  if (type === 'START') {
    bpm = e.data.bpm ?? bpm;
    swing = e.data.swing ?? swing;
    stepCount = e.data.stepCount ?? stepCount;
    stepIndex = e.data.startStep ?? 0;
    playing = true;
    nextTickTime = performance.now();
    schedule();
  }

  if (type === 'STOP') {
    playing = false;
    stepIndex = 0;
  }

  if (type === 'SET_BPM') {
    bpm = e.data.bpm;
  }

  if (type === 'SET_SWING') {
    swing = e.data.swing;
  }

  if (type === 'SET_STEP_COUNT') {
    stepCount = e.data.stepCount;
  }
};
