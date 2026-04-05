import { euclidean } from '../phase2/euclidean.js';

// ── Note helpers ──────────────────────────────────────────────────────────────

const NOTE_NAMES = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'];
function midiToName(n) {
  return NOTE_NAMES[n % 12] + (Math.floor(n / 12) - 1);
}

// ── Generator state ───────────────────────────────────────────────────────────

const gen = { steps: 16, hits: 5, rotation: 0, note: 36, velocity: 100, glide: false };
let rhythm = []; // boolean[]

function compute() {
  rhythm = euclidean(gen.hits, gen.steps, gen.rotation);
}

// ── Ring canvas ───────────────────────────────────────────────────────────────

function drawRing(canvas) {
  const dpr = window.devicePixelRatio || 1;
  const w   = canvas.clientWidth;
  const h   = canvas.clientHeight;
  if (w === 0 || h === 0) return;

  canvas.width  = w * dpr;
  canvas.height = h * dpr;
  const ctx = canvas.getContext('2d');
  ctx.scale(dpr, dpr);
  ctx.clearRect(0, 0, w, h);

  const cx = w / 2;
  const cy = h / 2;
  const outerR = Math.min(w, h) / 2 - 12;
  const innerR = outerR * 0.52;
  const steps  = gen.steps;
  // Gap shrinks for high step counts
  const gap = Math.max(0.015, Math.min(0.06, 1.2 / steps));

  for (let i = 0; i < steps; i++) {
    const a0 = -Math.PI / 2 + (i / steps) * Math.PI * 2 + gap / 2;
    const a1 = -Math.PI / 2 + ((i + 1) / steps) * Math.PI * 2 - gap / 2;
    const active = rhythm[i];

    ctx.beginPath();
    ctx.arc(cx, cy, outerR, a0, a1);
    ctx.arc(cx, cy, innerR, a1, a0, true);
    ctx.closePath();

    if (active) {
      ctx.shadowColor = 'rgba(124, 77, 255, 0.5)';
      ctx.shadowBlur  = 10;
      ctx.fillStyle   = i === 0 ? '#b390ff' : '#7c4dff';
    } else {
      ctx.shadowBlur = 0;
      ctx.fillStyle  = '#28282f';
    }
    ctx.fill();
  }

  // Step-0 tick mark just outside the ring at 12 o'clock
  ctx.shadowBlur = 0;
  ctx.beginPath();
  const tickOuter = outerR + 8;
  const tickInner = outerR + 3;
  ctx.moveTo(cx, cy - tickOuter);
  ctx.lineTo(cx - 3, cy - tickInner);
  ctx.lineTo(cx + 3, cy - tickInner);
  ctx.closePath();
  ctx.fillStyle = '#ff3d00';
  ctx.fill();

  // Centre label
  ctx.shadowBlur = 0;
  ctx.font = `bold 16px 'JetBrains Mono', monospace`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#a370ff';
  ctx.fillText(`${gen.hits}/${gen.steps}`, cx, cy - 8);
  ctx.font = `11px 'JetBrains Mono', monospace`;
  ctx.fillStyle = '#555566';
  ctx.fillText('hits/steps', cx, cy + 10);
}

// ── Strip canvas ──────────────────────────────────────────────────────────────

function drawStrip(canvas) {
  const dpr = window.devicePixelRatio || 1;
  const w   = canvas.clientWidth;
  const h   = canvas.clientHeight;
  if (w === 0 || h === 0) return;

  canvas.width  = w * dpr;
  canvas.height = h * dpr;
  const ctx = canvas.getContext('2d');
  ctx.scale(dpr, dpr);
  ctx.clearRect(0, 0, w, h);

  const steps   = gen.steps;
  const cellGap = 2;
  const cellW   = (w - cellGap * (steps - 1)) / steps;
  const cellH   = h;

  for (let i = 0; i < steps; i++) {
    const x = i * (cellW + cellGap);
    ctx.fillStyle = rhythm[i] ? '#7c4dff' : '#1e1e24';
    ctx.beginPath();
    ctx.roundRect(x, 0, cellW, cellH, 2);
    ctx.fill();

    // Beat markers every 4 steps
    if (i % 4 === 0) {
      ctx.fillStyle = '#555566';
      ctx.fillRect(x, cellH - 3, 1, 3);
    }
  }
}

// ── Render ────────────────────────────────────────────────────────────────────

function render() {
  drawRing(document.getElementById('ring-canvas'));
  drawStrip(document.getElementById('strip-canvas'));
}

// ── Preset builder ────────────────────────────────────────────────────────────

function buildPreset() {
  const steps  = gen.steps;
  const defStep = { notes: [], velocity: 100, probability: 100, muted: false, glide: false, substeps: 1, cc: null };
  const patternSteps = [];

  for (let i = 0; i < 64; i++) {
    if (i < steps && rhythm[i]) {
      patternSteps.push({
        notes: [gen.note],
        velocity: gen.velocity,
        probability: 100,
        muted: false,
        glide: gen.glide,
        substeps: 1,
        cc: null,
      });
    } else {
      patternSteps.push({ ...defStep });
    }
  }

  return {
    version: 1,
    transport: {
      bpm: 120,
      swing: 0,
      gateLength: 0.5,
      direction: 'forward',
      stepCount: steps,
      loopStart: 0,
      loopEnd: steps - 1,
      midiChannel: 1,
    },
    pitch: { scale: 'chromatic', rootNote: 60, transpose: 0 },
    ccLane: { visible: false, ccNumber: 74 },
    pattern: {
      name: `Euclidean ${gen.hits}/${gen.steps}`,
      steps: patternSteps,
    },
  };
}

// ── Init ──────────────────────────────────────────────────────────────────────

function init() {
  const stepsSlider    = document.getElementById('gen-steps');
  const stepsVal       = document.getElementById('gen-steps-val');
  const hitsSlider     = document.getElementById('gen-hits');
  const hitsVal        = document.getElementById('gen-hits-val');
  const rotSlider      = document.getElementById('gen-rot');
  const rotVal         = document.getElementById('gen-rot-val');
  const noteInput      = document.getElementById('gen-note');
  const noteName       = document.getElementById('gen-note-name');
  const velSlider      = document.getElementById('gen-vel');
  const velVal         = document.getElementById('gen-vel-val');
  const glideBtn       = document.getElementById('gen-glide-btn');
  const sendBtn        = document.getElementById('gen-send-btn');
  const downloadBtn    = document.getElementById('gen-download-btn');

  function refresh() {
    compute();
    render();
  }

  function syncHitsMax() {
    hitsSlider.max = gen.steps;
    if (gen.hits > gen.steps) {
      gen.hits = gen.steps;
      hitsSlider.value = gen.hits;
      hitsVal.textContent = gen.hits;
    }
    rotSlider.max = gen.steps - 1;
    if (gen.rotation >= gen.steps) {
      gen.rotation = 0;
      rotSlider.value = 0;
      rotVal.textContent = 0;
    }
  }

  stepsSlider.addEventListener('input', () => {
    gen.steps = +stepsSlider.value;
    stepsVal.textContent = gen.steps;
    syncHitsMax();
    refresh();
  });

  hitsSlider.addEventListener('input', () => {
    gen.hits = +hitsSlider.value;
    hitsVal.textContent = gen.hits;
    refresh();
  });

  rotSlider.addEventListener('input', () => {
    gen.rotation = +rotSlider.value;
    rotVal.textContent = gen.rotation;
    refresh();
  });

  noteInput.addEventListener('input', () => {
    gen.note = Math.max(0, Math.min(127, +noteInput.value));
    noteInput.value = gen.note;
    noteName.textContent = midiToName(gen.note);
  });

  velSlider.addEventListener('input', () => {
    gen.velocity = +velSlider.value;
    velVal.textContent = gen.velocity;
  });

  glideBtn.addEventListener('click', () => {
    gen.glide = !gen.glide;
    glideBtn.classList.toggle('active', gen.glide);
    glideBtn.textContent = gen.glide ? 'Glide: ON' : 'Glide: OFF';
  });

  sendBtn.addEventListener('click', () => {
    const data = buildPreset();
    data.targetScene = Math.max(1, parseInt(document.getElementById('gen-send-scene')?.value, 10) || 1) - 1;
    data.targetTrack = Math.max(1, parseInt(document.getElementById('gen-send-track')?.value, 10) || 1) - 1;
    localStorage.setItem('tessera_pending', JSON.stringify(data));
    window.location.href = 'index.html';
  });

  downloadBtn.addEventListener('click', () => {
    const data = buildPreset();
    const json = JSON.stringify(data, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = `${data.pattern.name.replace(/\s+/g, '_')}.tessera.json`;
    a.click();
    URL.revokeObjectURL(url);
  });

  // Resize observer for canvas redraws
  const ro = new ResizeObserver(() => render());
  ro.observe(document.getElementById('ring-wrap'));
  ro.observe(document.getElementById('strip-canvas'));

  // Re-render when tab is activated (canvas was hidden, size was 0)
  document.addEventListener('genTabActivated', e => {
    if (e.detail === 'euclid-panel') render();
  });

  // Initial render
  syncHitsMax();
  noteName.textContent = midiToName(gen.note);
  refresh();
}

document.addEventListener('DOMContentLoaded', init);
