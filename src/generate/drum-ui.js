import { euclidean } from '../phase2/euclidean.js';

// ── Voice definitions ─────────────────────────────────────────────────────────

const VOICES = [
  { id: 'kick',         name: 'Kick',       preset: 'kick',         midiNote: 36, color: '#ff3d00', hits: 4,  steps: 16, rot: 0, vel: 100, enabled: true },
  { id: 'snare',        name: 'Snare',      preset: 'snare',        midiNote: 38, color: '#ffab00', hits: 2,  steps: 16, rot: 4, vel: 90,  enabled: true },
  { id: 'hihat-closed', name: 'Hi-Hat CL',  preset: 'hihat-closed', midiNote: 42, color: '#00e5ff', hits: 8,  steps: 16, rot: 0, vel: 80,  enabled: true },
  { id: 'hihat-open',   name: 'Hi-Hat OP',  preset: 'hihat-open',   midiNote: 46, color: '#69f0ae', hits: 2,  steps: 16, rot: 6, vel: 85,  enabled: true },
];

// computed rhythms keyed by voice id
const rhythms = {};

function computeRhythm(v) {
  rhythms[v.id] = euclidean(v.hits, v.steps, v.rot);
}

function computeAll() {
  VOICES.forEach(computeRhythm);
}

// ── Strip drawing ─────────────────────────────────────────────────────────────

function drawStrip(canvas, voice) {
  const rhythm = rhythms[voice.id] || [];
  const dpr = window.devicePixelRatio || 1;
  const w   = canvas.clientWidth;
  const h   = canvas.clientHeight;
  if (w === 0 || h === 0) return;

  canvas.width  = w * dpr;
  canvas.height = h * dpr;
  const ctx = canvas.getContext('2d');
  ctx.scale(dpr, dpr);
  ctx.clearRect(0, 0, w, h);

  const steps   = voice.steps;
  const gap     = 2;
  const cellW   = (w - gap * (steps - 1)) / steps;
  const cellH   = h;

  for (let i = 0; i < steps; i++) {
    const x = i * (cellW + gap);
    ctx.fillStyle = rhythm[i] ? voice.color : '#1e1e24';
    ctx.beginPath();
    ctx.roundRect(x, 0, Math.max(1, cellW), cellH, 2);
    ctx.fill();
    if (i % 4 === 0 && !rhythm[i]) {
      ctx.fillStyle = '#33334a';
      ctx.fillRect(x, cellH - 3, 1, 3);
    }
  }
}

function renderAll() {
  VOICES.forEach(v => {
    const canvas = document.querySelector(`.drum-voice-row[data-id="${v.id}"] .drum-strip-canvas`);
    if (canvas) drawStrip(canvas, v);
  });
}

// ── Row creation ──────────────────────────────────────────────────────────────

function makeRow(v) {
  const row = document.createElement('div');
  row.className = 'drum-voice-row';
  row.dataset.id = v.id;

  row.innerHTML = `
    <div class="drum-voice-color-bar" style="background:${v.color}"></div>
    <div class="drum-voice-meta">
      <label class="drum-enable-wrap" title="Enable voice">
        <input type="checkbox" class="drum-enable" ${v.enabled ? 'checked' : ''} />
      </label>
      <span class="drum-voice-name">${v.name}</span>
    </div>
    <canvas class="drum-strip-canvas"></canvas>
    <div class="drum-sliders">
      <div class="drum-slider-row">
        <label>Steps</label>
        <input type="range" class="drum-steps" min="1" max="32" value="${v.steps}" />
        <span class="drum-steps-val val-readout">${v.steps}</span>
      </div>
      <div class="drum-slider-row">
        <label>Hits</label>
        <input type="range" class="drum-hits" min="0" max="${v.steps}" value="${v.hits}" />
        <span class="drum-hits-val val-readout">${v.hits}</span>
      </div>
      <div class="drum-slider-row">
        <label>Rot</label>
        <input type="range" class="drum-rot" min="0" max="${Math.max(0, v.steps - 1)}" value="${v.rot}" />
        <span class="drum-rot-val val-readout">${v.rot}</span>
      </div>
      <div class="drum-slider-row">
        <label>Vel</label>
        <input type="range" class="drum-vel" min="1" max="127" value="${v.vel}" />
        <span class="drum-vel-val val-readout">${v.vel}</span>
      </div>
    </div>
  `;

  return row;
}

function wireRow(row, v) {
  const enableCb = row.querySelector('.drum-enable');
  const stepsEl  = row.querySelector('.drum-steps');
  const stepsVal = row.querySelector('.drum-steps-val');
  const hitsEl   = row.querySelector('.drum-hits');
  const hitsVal  = row.querySelector('.drum-hits-val');
  const rotEl    = row.querySelector('.drum-rot');
  const rotVal   = row.querySelector('.drum-rot-val');
  const velEl    = row.querySelector('.drum-vel');
  const velVal   = row.querySelector('.drum-vel-val');
  const canvas   = row.querySelector('.drum-strip-canvas');

  function refresh() {
    computeRhythm(v);
    drawStrip(canvas, v);
  }

  enableCb.addEventListener('change', () => { v.enabled = enableCb.checked; });

  stepsEl.addEventListener('input', () => {
    v.steps = +stepsEl.value;
    stepsVal.textContent = v.steps;
    hitsEl.max = v.steps;
    rotEl.max  = Math.max(0, v.steps - 1);
    if (v.hits  > v.steps) { v.hits = v.steps; hitsEl.value = v.hits; hitsVal.textContent = v.hits; }
    if (v.rot  >= v.steps) { v.rot  = 0;       rotEl.value  = 0;      rotVal.textContent  = 0; }
    refresh();
  });

  hitsEl.addEventListener('input', () => { v.hits = +hitsEl.value; hitsVal.textContent = v.hits; refresh(); });
  rotEl.addEventListener('input',  () => { v.rot  = +rotEl.value;  rotVal.textContent  = v.rot;  refresh(); });
  velEl.addEventListener('input',  () => { v.vel  = +velEl.value;  velVal.textContent  = v.vel; });

  const ro = new ResizeObserver(() => drawStrip(canvas, v));
  ro.observe(canvas);
}

// ── Payload builder ───────────────────────────────────────────────────────────

function buildPayload(bpm) {
  const defStep = () => ({ notes: [], velocity: 100, probability: 100, muted: false, glide: false, substeps: 1, cc: null });

  const enabledVoices = VOICES.filter(v => v.enabled);
  const maxSteps = enabledVoices.reduce((m, v) => Math.max(m, v.steps), 16);

  const tracks = enabledVoices.map(v => {
    const rhythm = rhythms[v.id] || [];
    const steps  = Array.from({ length: 64 }, (_, i) => {
      if (i < v.steps && rhythm[i]) {
        return { notes: [v.midiNote], velocity: v.vel, probability: 100, muted: false, glide: false, substeps: 1, cc: null };
      }
      return defStep();
    });
    return {
      name:        v.name,
      synthPreset: v.preset,
      midiOutputId:'__builtin__',
      midiChannel: 10,
      stepCount:   v.steps,
      loopStart:   0,
      loopEnd:     v.steps - 1,
      steps,
    };
  });

  return { version: 2, transport: { bpm, stepCount: maxSteps }, tracks };
}

// ── Randomize ─────────────────────────────────────────────────────────────────

function randomizeAll() {
  VOICES.forEach(v => {
    v.hits = Math.max(1, Math.floor(Math.random() * Math.ceil(v.steps / 2)));
    v.rot  = Math.floor(Math.random() * v.steps);
    const row = document.querySelector(`.drum-voice-row[data-id="${v.id}"]`);
    if (!row) return;
    row.querySelector('.drum-hits').value    = v.hits;
    row.querySelector('.drum-hits-val').textContent = v.hits;
    row.querySelector('.drum-rot').value     = v.rot;
    row.querySelector('.drum-rot-val').textContent  = v.rot;
  });
  computeAll();
  renderAll();
}

// ── Init ──────────────────────────────────────────────────────────────────────

function init() {
  computeAll();

  // Build rows
  const container = document.getElementById('drum-voices-container');
  VOICES.forEach(v => {
    const row = makeRow(v);
    container.appendChild(row);
    wireRow(row, v);
  });

  const bpmInput  = document.getElementById('drum-bpm');
  const sendBtn   = document.getElementById('drum-send-btn');
  const randBtn   = document.getElementById('drum-randomize-btn');

  sendBtn.addEventListener('click', () => {
    const bpm = Math.max(20, Math.min(300, +bpmInput.value || 120));
    localStorage.setItem('tessera_pending', JSON.stringify(buildPayload(bpm)));
    window.location.href = 'index.html';
  });

  randBtn.addEventListener('click', randomizeAll);

  document.addEventListener('genTabActivated', e => {
    if (e.detail === 'drums-panel') renderAll();
  });

  renderAll();
}

document.addEventListener('DOMContentLoaded', init);
