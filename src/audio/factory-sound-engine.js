/**
 * Factory Sound Engine
 * A built-in Web Audio API synthesizer that acts as a drop-in MIDI port replacement.
 * Exposes a `.send(data, time)` method matching the Web MIDI API MIDIOutput interface.
 */

const BUILTIN_ID = '__builtin__';
const BUILTIN_NAME = '⬡ Built-in Synth';

const PRESETS = {
  pad: {
    label: 'Pad',
    osc1Type: 'sawtooth',
    osc2Type: 'sawtooth',
    osc2Detune: 7,
    attack: 0.06,
    decay: 0.2,
    sustain: 0.7,
    release: 0.4,
    filterFreq: 1800,
    filterQ: 2.5,
    filterEnvAmt: 1200,
    filterAttack: 0.1,
    gain: 0.18,
  },
  bass: {
    label: 'Bass',
    osc1Type: 'sawtooth',
    osc2Type: 'square',
    osc2Detune: -12,  // octave below (in semitones * 100 cents = detune value handled separately)
    osc2SemiOffset: -12, // semitone offset handled in noteOn
    attack: 0.004,
    decay: 0.15,
    sustain: 0.5,
    release: 0.12,
    filterFreq: 600,
    filterQ: 8,
    filterEnvAmt: 2400,
    filterAttack: 0.01,
    gain: 0.22,
  },
  lead: {
    label: 'Lead',
    osc1Type: 'square',
    osc2Type: 'sawtooth',
    osc2Detune: 5,
    attack: 0.005,
    decay: 0.1,
    sustain: 0.6,
    release: 0.18,
    filterFreq: 3200,
    filterQ: 3,
    filterEnvAmt: 3000,
    filterAttack: 0.005,
    gain: 0.15,
  },
  pluck: {
    label: 'Pluck',
    osc1Type: 'sawtooth',
    osc2Type: 'triangle',
    osc2Detune: 0,
    attack: 0.001,
    decay: 0.3,
    sustain: 0.0,
    release: 0.25,
    filterFreq: 2400,
    filterQ: 6,
    filterEnvAmt: 4000,
    filterAttack: 0.001,
    gain: 0.2,
  },
  bell: {
    label: 'Bell',
    osc1Type: 'sine',
    osc2Type: 'sine',
    osc2Detune: 1200,  // one octave up
    attack: 0.001,
    decay: 0.8,
    sustain: 0.0,
    release: 1.0,
    filterFreq: 8000,
    filterQ: 1,
    filterEnvAmt: 0,
    filterAttack: 0.001,
    gain: 0.14,
  },
  keys: {
    label: 'Keys',
    osc1Type: 'triangle',
    osc2Type: 'sawtooth',
    osc2Detune: 1200,
    attack: 0.002,
    decay: 0.5,
    sustain: 0.2,
    release: 0.5,
    filterFreq: 4000,
    filterQ: 1.5,
    filterEnvAmt: 2000,
    filterAttack: 0.002,
    gain: 0.16,
  },
};

// Drum presets use a separate synthesis path — not in PRESETS object
const DRUM_PRESETS = new Set(['kick', 'snare', 'hihat-closed', 'hihat-open']);

export const PRESET_NAMES = [
  ...Object.entries(PRESETS).map(([id, p]) => ({ id, label: p.label })),
  { id: 'kick',         label: 'Kick'        },
  { id: 'snare',        label: 'Snare'       },
  { id: 'hihat-closed', label: 'Hi-Hat Cls'  },
  { id: 'hihat-open',   label: 'Hi-Hat Open' },
];

let audioCtx = null;
let masterGain = null;
let masterReverb = null;
let reverbWet = null;
let currentPreset = 'pad';

// note -> { osc1, osc2, filter, vca, releaseTimer }
const voices = new Map();

function getAudioCtx() {
  if (!audioCtx) {
    audioCtx = new AudioContext();
    masterGain = audioCtx.createGain();
    masterGain.gain.value = 0.85;

    // Simple reverb using a convolver with a synthetic impulse
    masterReverb = audioCtx.createConvolver();
    masterReverb.buffer = buildReverbIR(audioCtx, 1.5, 0.5);

    reverbWet = audioCtx.createGain();
    reverbWet.gain.value = 0.18;

    const reverbDry = audioCtx.createGain();
    reverbDry.gain.value = 1.0;

    masterGain.connect(reverbDry);
    reverbDry.connect(audioCtx.destination);

    masterGain.connect(masterReverb);
    masterReverb.connect(reverbWet);
    reverbWet.connect(audioCtx.destination);
  }
  return audioCtx;
}

/** Build a synthetic exponential-decay reverb impulse response */
function buildReverbIR(ctx, duration, decay) {
  const rate = ctx.sampleRate;
  const length = Math.floor(rate * duration);
  const buffer = ctx.createBuffer(2, length, rate);
  for (let ch = 0; ch < 2; ch++) {
    const data = buffer.getChannelData(ch);
    for (let i = 0; i < length; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / length, decay * 2);
    }
  }
  return buffer;
}

/** Convert a DOMHighResTimeStamp (ms) to AudioContext time (s) */
function toAudioTime(perfTime) {
  if (!perfTime) return audioCtx.currentTime;
  const now = performance.now();
  return audioCtx.currentTime + (perfTime - now) / 1000;
}

/** MIDI note number to Hz */
function midiToHz(note) {
  return 440 * Math.pow(2, (note - 69) / 12);
}

// ── Drum synthesis ────────────────────────────────────────────

function _triggerKick(velocity, at) {
  const ctx = getAudioCtx();
  const vol = velocity / 127;

  // Body — sine with rapid pitch sweep (the "thud")
  const body = ctx.createOscillator();
  body.type = 'sine';
  body.frequency.setValueAtTime(160, at);
  body.frequency.exponentialRampToValueAtTime(48, at + 0.055);

  const bodyGain = ctx.createGain();
  bodyGain.gain.setValueAtTime(vol * 0.9, at);
  bodyGain.gain.exponentialRampToValueAtTime(0.001, at + 0.42);

  body.connect(bodyGain);
  bodyGain.connect(masterGain);
  body.start(at);
  body.stop(at + 0.45);

  // Click — short filtered noise burst for the attack transient
  const clickLen = Math.floor(ctx.sampleRate * 0.006);
  const clickBuf = ctx.createBuffer(1, clickLen, ctx.sampleRate);
  const cd = clickBuf.getChannelData(0);
  for (let i = 0; i < clickLen; i++) cd[i] = (Math.random() * 2 - 1);

  const click = ctx.createBufferSource();
  click.buffer = clickBuf;

  const clickFilter = ctx.createBiquadFilter();
  clickFilter.type = 'bandpass';
  clickFilter.frequency.value = 3200;
  clickFilter.Q.value = 0.8;

  const clickGain = ctx.createGain();
  clickGain.gain.setValueAtTime(vol * 0.55, at);
  clickGain.gain.exponentialRampToValueAtTime(0.001, at + 0.006);

  click.connect(clickFilter);
  clickFilter.connect(clickGain);
  clickGain.connect(masterGain);
  click.start(at);
  click.stop(at + 0.008);
}

/**
 * Shared metallic noise source for hi-hats.
 * Returns a GainNode summing six detuned square oscillators — the classic TR-style approach.
 * `durationS` controls how long the oscillators run before auto-stopping.
 */
function _buildHihatSource(ctx, at, durationS) {
  const freqs = [205.3, 369.99, 415.31, 461.16, 571.17, 715.44];
  const mix = ctx.createGain();
  mix.gain.value = 1;

  freqs.forEach(f => {
    const osc = ctx.createOscillator();
    osc.type = 'square';
    osc.frequency.value = f;

    const g = ctx.createGain();
    g.gain.value = 1 / freqs.length;
    osc.connect(g);
    g.connect(mix);
    osc.start(at);
    osc.stop(at + durationS + 0.01);
  });

  return mix;
}

function _triggerHihatClosed(velocity, at) {
  const ctx = getAudioCtx();
  const vol = velocity / 127;
  const decayS = 0.07;

  const src = _buildHihatSource(ctx, at, decayS);

  const hp = ctx.createBiquadFilter();
  hp.type = 'highpass';
  hp.frequency.value = 7000;
  hp.Q.value = 0.6;

  const bp = ctx.createBiquadFilter();
  bp.type = 'bandpass';
  bp.frequency.value = 10000;
  bp.Q.value = 0.9;

  const vca = ctx.createGain();
  vca.gain.setValueAtTime(vol * 0.32, at);
  vca.gain.exponentialRampToValueAtTime(0.001, at + decayS);

  src.connect(hp);
  hp.connect(bp);
  bp.connect(vca);
  vca.connect(masterGain);
}

function _triggerHihatOpen(velocity, at) {
  const ctx = getAudioCtx();
  const vol = velocity / 127;
  const decayS = 0.55;

  const src = _buildHihatSource(ctx, at, decayS);

  const hp = ctx.createBiquadFilter();
  hp.type = 'highpass';
  hp.frequency.value = 6000;
  hp.Q.value = 0.5;

  const bp = ctx.createBiquadFilter();
  bp.type = 'bandpass';
  bp.frequency.value = 9000;
  bp.Q.value = 0.7;

  const vca = ctx.createGain();
  vca.gain.setValueAtTime(vol * 0.28, at);
  // Slow initial decay, then fall away — open hat "sizzle"
  vca.gain.setValueAtTime(vol * 0.22, at + 0.04);
  vca.gain.exponentialRampToValueAtTime(0.001, at + decayS);

  src.connect(hp);
  hp.connect(bp);
  bp.connect(vca);
  vca.connect(masterGain);
}

function _triggerSnare(velocity, at) {
  const ctx = getAudioCtx();
  const vol = velocity / 127;

  // ── Tone body — two sine oscillators for the drum head resonance ──
  const toneFreqs = [185, 230];
  toneFreqs.forEach(f => {
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(f, at);
    osc.frequency.exponentialRampToValueAtTime(f * 0.6, at + 0.08);

    const g = ctx.createGain();
    g.gain.setValueAtTime(vol * 0.28, at);
    g.gain.exponentialRampToValueAtTime(0.001, at + 0.12);

    osc.connect(g);
    g.connect(masterGain);
    osc.start(at);
    osc.stop(at + 0.15);
  });

  // ── Snare rattle — bandpass-filtered white noise ──
  const noiseLen = Math.floor(ctx.sampleRate * 0.22);
  const noiseBuf = ctx.createBuffer(1, noiseLen, ctx.sampleRate);
  const nd = noiseBuf.getChannelData(0);
  for (let i = 0; i < noiseLen; i++) nd[i] = Math.random() * 2 - 1;

  const noise = ctx.createBufferSource();
  noise.buffer = noiseBuf;

  // High-pass strips the low rumble — snare wires live in the upper mids
  const hp = ctx.createBiquadFilter();
  hp.type = 'highpass';
  hp.frequency.value = 1800;
  hp.Q.value = 0.8;

  // Bandpass adds presence/crack around 4kHz
  const bp = ctx.createBiquadFilter();
  bp.type = 'bandpass';
  bp.frequency.value = 4000;
  bp.Q.value = 0.6;

  const noiseGain = ctx.createGain();
  noiseGain.gain.setValueAtTime(vol * 0.55, at);
  noiseGain.gain.exponentialRampToValueAtTime(vol * 0.18, at + 0.025); // fast initial snap
  noiseGain.gain.exponentialRampToValueAtTime(0.001, at + 0.20);       // tail off

  noise.connect(hp);
  hp.connect(bp);
  bp.connect(noiseGain);
  noiseGain.connect(masterGain);
  noise.start(at);
  noise.stop(at + 0.23);
}

/**
 * Core note-on dispatcher. `presetId` overrides the global currentPreset,
 * allowing per-track preset ports to trigger with their own sound.
 */
function _noteOnWithPreset(presetId, note, velocity, audioTime) {
  const ctx = getAudioCtx();
  const at = Math.max(audioTime, ctx.currentTime + 0.001);

  // Drums are fire-and-forget — no voice tracking needed
  if (presetId === 'kick')         { _triggerKick(velocity, at);         return; }
  if (presetId === 'snare')        { _triggerSnare(velocity, at);        return; }
  if (presetId === 'hihat-closed') { _triggerHihatClosed(velocity, at);  return; }
  if (presetId === 'hihat-open')   { _triggerHihatOpen(velocity, at);    return; }

  // If note is already playing (same voice key), stop it cleanly first
  _noteOff(note, audioTime);

  const preset = PRESETS[presetId] || PRESETS.pad;
  const freq = midiToHz(note);
  const vol = (velocity / 127) * preset.gain;

  // VCA (volume envelope)
  const vca = ctx.createGain();
  vca.gain.setValueAtTime(0, at);
  vca.gain.linearRampToValueAtTime(vol, at + preset.attack);
  vca.gain.linearRampToValueAtTime(vol * preset.sustain, at + preset.attack + preset.decay);

  // Filter
  const filter = ctx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.Q.value = preset.filterQ;
  filter.frequency.setValueAtTime(preset.filterFreq, at);
  filter.frequency.linearRampToValueAtTime(
    preset.filterFreq + preset.filterEnvAmt * (velocity / 127),
    at + preset.filterAttack
  );
  filter.frequency.exponentialRampToValueAtTime(
    Math.max(preset.filterFreq, 40),
    at + preset.filterAttack + preset.decay * 2
  );

  // Oscillator 1
  const osc1 = ctx.createOscillator();
  osc1.type = preset.osc1Type;
  osc1.frequency.value = freq;

  // Oscillator 2
  const osc2 = ctx.createOscillator();
  osc2.type = preset.osc2Type;
  const semiOffset = preset.osc2SemiOffset || 0;
  osc2.frequency.value = freq * Math.pow(2, semiOffset / 12);
  osc2.detune.value = preset.osc2Detune;

  osc1.connect(filter);
  osc2.connect(filter);
  filter.connect(vca);
  vca.connect(masterGain);

  osc1.start(at);
  osc2.start(at);

  voices.set(note, { osc1, osc2, filter, vca, preset });
}

function _noteOn(note, velocity, audioTime) {
  _noteOnWithPreset(currentPreset, note, velocity, audioTime);
}

function _noteOff(note, audioTime) {
  const voice = voices.get(note);
  if (!voice) return;
  voices.delete(note);

  const ctx = audioCtx;
  if (!ctx) return;

  const { osc1, osc2, vca, preset } = voice;
  const at = Math.max(audioTime ?? ctx.currentTime, ctx.currentTime);
  const release = preset.release;

  vca.gain.cancelScheduledValues(at);
  vca.gain.setValueAtTime(vca.gain.value, at);
  vca.gain.linearRampToValueAtTime(0, at + release);

  const stopTime = at + release + 0.05;
  osc1.stop(stopTime);
  osc2.stop(stopTime);
}

function _allNotesOff() {
  if (!audioCtx) return;
  const now = audioCtx.currentTime;
  for (const note of voices.keys()) {
    _noteOff(note, now);
  }
}

export function setPreset(presetId) {
  if (PRESETS[presetId] || DRUM_PRESETS.has(presetId)) {
    currentPreset = presetId;
  }
}

export function getPreset() {
  return currentPreset;
}

export function setReverbAmount(amount) {
  if (reverbWet) reverbWet.gain.value = amount;
}

// ── Per-preset port factory ───────────────────────────────────

function _makeSendFn(presetId) {
  return function send(data, time) {
    const ctx = getAudioCtx();
    if (ctx.state === 'suspended') ctx.resume();

    const status   = data[0];
    const type     = status & 0xF0;
    const note     = data[1];
    const velocity = data[2];
    const audioTime = time ? toAudioTime(time) : ctx.currentTime;

    if (type === 0x90 && velocity > 0) {
      _noteOnWithPreset(presetId, note, velocity, audioTime);
    } else if (type === 0x80 || (type === 0x90 && velocity === 0)) {
      _noteOff(note, audioTime);
    } else if (type === 0xB0 && note === 123) {
      _allNotesOff();
    }
  };
}

const _portCache = new Map();

/**
 * Returns a MIDIOutput-compatible port that always triggers with `presetId`,
 * regardless of the global currentPreset. Ports are cached by presetId.
 */
export function getFactoryPortForPreset(presetId) {
  if (!_portCache.has(presetId)) {
    _portCache.set(presetId, { id: BUILTIN_ID, name: BUILTIN_NAME, send: _makeSendFn(presetId) });
  }
  return _portCache.get(presetId);
}

/**
 * The factory port object — drop-in replacement for a Web MIDI output port.
 * Uses the global currentPreset (set via setPreset / the SYNTH dropdown).
 */
export const factoryPort = {
  id: BUILTIN_ID,
  name: BUILTIN_NAME,

  send(data, time) {
    // Resume AudioContext if suspended (browser autoplay policy)
    const ctx = getAudioCtx();
    if (ctx.state === 'suspended') ctx.resume();

    const status = data[0];
    const type = status & 0xF0;
    const note = data[1];
    const velocity = data[2];

    const audioTime = time ? toAudioTime(time) : ctx.currentTime;

    if (type === 0x90 && velocity > 0) {
      _noteOn(note, velocity, audioTime);
    } else if (type === 0x80 || (type === 0x90 && velocity === 0)) {
      _noteOff(note, audioTime);
    } else if (type === 0xB0 && note === 123) {
      // All Notes Off CC
      _allNotesOff();
    }
    // Other MIDI messages (CC, etc.) are silently ignored
  },
};

export { BUILTIN_ID, BUILTIN_NAME };
