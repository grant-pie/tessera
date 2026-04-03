/**
 * Converts recorder events into a Tessera sequencer pattern.
 *
 * The conversion applies the same quantize algorithm internally (non-destructive —
 * the recording itself is not modified) so the result always lands on clean steps.
 *
 * @param {object[]} events      - recorder event list (noteOn / noteOff / cc)
 * @param {number}   bpm         - tempo used for the grid
 * @param {number}   subdivision - e.g. 16 for 1/16th-note steps
 * @param {number}   durationMs  - total recording length in milliseconds
 * @returns {object} data object compatible with the sequencer's applyData() / tessera_pending
 */
export function convertToPattern(events, bpm, subdivision, durationMs) {
  const gridMs    = (60000 / bpm) / (subdivision / 4);
  const rawCount  = Math.round(durationMs / gridMs);
  const stepCount = Math.max(1, Math.min(64, rawCount));

  // ── Quantize events (non-destructive) ─────────────────────
  const qEvents = _quantize(events, gridMs);

  // ── Map events onto steps ──────────────────────────────────
  // stepIndex -> { noteVelocities: Map<note, velocity>, durations: number[] }
  const stepData = new Map();

  // Track open noteOns so we can compute note duration on noteOff
  // key = `${note}:${channel}` -> { onTime, stepIndex }
  const openNotes = new Map();

  for (const ev of qEvents) {
    const si = Math.floor(ev.offsetMs / gridMs);
    // Ignore anything beyond the 64-step cap
    if (si < 0 || si >= 64) continue;

    if (ev.type === 'noteOn' && ev.velocity > 0) {
      if (!stepData.has(si)) stepData.set(si, { noteVelocities: new Map(), durations: [], cc: null });
      stepData.get(si).noteVelocities.set(ev.note, ev.velocity);

      const key = `${ev.note}:${ev.channel ?? 0}`;
      openNotes.set(key, { onTime: ev.offsetMs, stepIndex: si });

    } else if (ev.type === 'noteOff' || (ev.type === 'noteOn' && ev.velocity === 0)) {
      const key = `${ev.note}:${ev.channel ?? 0}`;
      const open = openNotes.get(key);
      if (open) {
        const durationSteps = (ev.offsetMs - open.onTime) / gridMs;
        const sd = stepData.get(open.stepIndex);
        if (sd) sd.durations.push(durationSteps);
        openNotes.delete(key);
      }

    } else if (ev.type === 'cc') {
      if (!stepData.has(si)) stepData.set(si, { noteVelocities: new Map(), durations: [], cc: null });
      const sd = stepData.get(si);
      // Last CC event at a step wins
      sd.cc = Math.max(0, Math.min(127, ev.value ?? 0));
    }
  }

  // ── Build the steps array ──────────────────────────────────
  const steps = Array.from({ length: 64 }, () => ({
    notes: [], velocity: 100, probability: 100,
    muted: false, glide: false, substeps: 1, cc: null,
  }));

  let totalDurationSteps = 0;
  let durationCount      = 0;

  for (const [si, sd] of stepData) {
    if (si >= stepCount) continue; // discard notes beyond the loop end

    const notes = [...sd.noteVelocities.keys()].sort((a, b) => a - b);
    const vels  = [...sd.noteVelocities.values()];
    const avgVel = vels.length
      ? Math.round(vels.reduce((a, b) => a + b, 0) / vels.length)
      : 100;

    steps[si].notes    = notes;
    steps[si].velocity = Math.max(1, Math.min(127, avgVel));
    if (sd.cc !== null) steps[si].cc = sd.cc;

    for (const d of sd.durations) {
      totalDurationSteps += d;
      durationCount++;
    }
  }

  // ── Average gate length ────────────────────────────────────
  // Express note duration as a fraction of one step, clamped to [0.05, 1.0]
  const avgDuration = durationCount > 0 ? totalDurationSteps / durationCount : 0.5;
  const gateLength  = Math.max(0.05, Math.min(1.0, avgDuration));

  return {
    transport: {
      bpm,
      stepCount,
      loopStart:  0,
      loopEnd:    stepCount - 1,
      gateLength: Math.round(gateLength * 100) / 100,
      direction:  'forward',
    },
    pattern: {
      name:  'From Recorder',
      steps,
    },
  };
}

// ── Internal quantize (mirrors quantize.js but non-destructive) ──

function _quantize(events, gridMs) {
  const cloned  = events.map(e => ({ ...e }));
  // key = `${note}:${channel}` -> stack of deltas applied at noteOn time
  const pending = new Map();

  for (let i = 0; i < cloned.length; i++) {
    const ev = cloned[i];

    if (ev.type === 'noteOn' && ev.velocity > 0) {
      const snapped = Math.round(ev.offsetMs / gridMs) * gridMs;
      const delta   = snapped - ev.offsetMs;
      cloned[i]     = { ...ev, offsetMs: Math.max(0, snapped) };

      const key = `${ev.note}:${ev.channel ?? 0}`;
      if (!pending.has(key)) pending.set(key, []);
      pending.get(key).push(delta);

    } else if (ev.type === 'noteOff' || (ev.type === 'noteOn' && ev.velocity === 0)) {
      const key   = `${ev.note}:${ev.channel ?? 0}`;
      const stack = pending.get(key);
      if (stack && stack.length > 0) {
        const delta = stack.shift();
        cloned[i]   = { ...ev, offsetMs: Math.max(0, ev.offsetMs + delta) };
      }
    }
  }

  return cloned.sort((a, b) => a.offsetMs - b.offsetMs);
}
