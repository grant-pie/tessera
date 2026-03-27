import { emit } from '../utils/event-bus.js';

// MIDI clock = 24 pulses per quarter note
// 16th note = 6 pulses
const PULSES_PER_STEP = 6;

let pulseCount = 0;
let stepIndex = 0;
let lastPulseTime = 0;
let pulseTimes = [];
let active = false;

export function attachToPort(midiInputPort, onTick) {
  if (!midiInputPort) {
    console.warn('[ExternalClock] attachToPort called with null port');
    return;
  }

  console.log('[ExternalClock] Attached to port:', midiInputPort.name);

  midiInputPort.onmidimessage = (e) => {
    const [status] = e.data;

    switch (status) {
      case 0xFA: // Start
      case 0xFB: // Continue
        pulseCount = 0;
        stepIndex = 0;
        active = true;
        console.log('[ExternalClock] Transport:', status === 0xFA ? 'START' : 'CONTINUE');
        emit('externalClock:transport', { type: status === 0xFA ? 'start' : 'continue' });
        break;

      case 0xFC: // Stop
        active = false;
        console.log('[ExternalClock] Transport: STOP');
        emit('externalClock:transport', { type: 'stop' });
        break;

      case 0xF8: // Clock pulse
        if (!active) {
          // Auto-activate on first pulse — many devices (e.g. Korg Monologue)
          // send continuous clock without explicit START messages
          console.log('[ExternalClock] Auto-activating on first pulse');
          active = true;
          pulseCount = 0;
          stepIndex = 0;
          emit('externalClock:transport', { type: 'start' });
        }
        {
          const now = performance.now();
          pulseTimes.push(now);
          if (pulseTimes.length > 24) pulseTimes.shift();

          pulseCount++;
          if (pulseCount >= PULSES_PER_STEP) {
            pulseCount = 0;
            onTick({ tickTime: now, stepIndex });
            stepIndex++;

            // Emit BPM estimate every step (every 6 pulses) so the UI can update
            const bpm = getExternalBpm();
            if (bpm) {
              emit('externalClock:bpm', { bpm });
              if (stepIndex % 16 === 1) console.log(`[ExternalClock] Tick — step ${stepIndex}, ~${bpm} BPM`);
            }
          }
          lastPulseTime = now;
        }
        break;
    }
  };
}

export function detachFromPort(midiInputPort) {
  if (midiInputPort) {
    midiInputPort.onmidimessage = null;
  }
  pulseCount = 0;
  stepIndex = 0;
  active = false;
}

export function getExternalBpm() {
  if (pulseTimes.length < 2) return null;
  const intervals = [];
  for (let i = 1; i < pulseTimes.length; i++) {
    intervals.push(pulseTimes[i] - pulseTimes[i - 1]);
  }
  const avg = intervals.reduce((a, b) => a + b, 0) / intervals.length;
  // avg is ms per pulse; 24 pulses per beat
  return Math.round(60000 / (avg * 24));
}
