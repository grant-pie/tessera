const NOTE_NAMES = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'];
function midiToName(n) { return NOTE_NAMES[n % 12] + (Math.floor(n / 12) - 1); }

// ── State ─────────────────────────────────────────────────────────────────────

const markov = {
  notes:   [45, 48, 50, 52],   // A2, C3, D3, E3
  weights: [
    [0, 5, 2, 1],
    [3, 0, 5, 2],
    [2, 3, 0, 4],
    [6, 2, 2, 0],
  ],
  steps:        16,
  restProb:     10,   // % chance of rest per step
  velocity:     100,
  velVariation: 15,   // ± randomisation applied per note
  glide:        false,
};

let sequence = []; // note indices (0..N-1) or null = rest

// ── Algorithm ─────────────────────────────────────────────────────────────────

function generate() {
  const n = markov.notes.length;
  if (n === 0) return;
  sequence = [];
  let current = Math.floor(Math.random() * n);

  for (let i = 0; i < markov.steps; i++) {
    if (Math.random() * 100 < markov.restProb) {
      sequence.push(null);
      continue;
    }
    sequence.push(current);
    const row   = markov.weights[current];
    const total = row.reduce((s, w) => s + w, 0);
    if (total === 0) {
      current = Math.floor(Math.random() * n);
    } else {
      let r = Math.random() * total;
      for (let j = 0; j < row.length; j++) {
        r -= row[j];
        if (r <= 0) { current = j; break; }
      }
    }
  }
}

// ── Visualisation ─────────────────────────────────────────────────────────────

function drawVis(canvas) {
  const dpr = window.devicePixelRatio || 1;
  const w   = canvas.clientWidth;
  const h   = canvas.clientHeight;
  if (w === 0 || h === 0) return;
  canvas.width  = w * dpr;
  canvas.height = h * dpr;
  const ctx = canvas.getContext('2d');
  ctx.scale(dpr, dpr);
  ctx.clearRect(0, 0, w, h);

  if (sequence.length === 0) return;

  const notes   = markov.notes;
  const minNote = Math.min(...notes);
  const maxNote = Math.max(...notes);
  const range   = maxNote - minNote || 1;
  const stepW   = w / sequence.length;
  const barH    = Math.max(6, h * 0.18);
  const pad     = barH / 2;

  // Pitch grid lines
  notes.forEach(midi => {
    const yFrac = 1 - (midi - minNote) / range;
    const y     = pad + yFrac * (h - pad * 2);
    ctx.strokeStyle = '#28282f';
    ctx.lineWidth   = 1;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(w, y);
    ctx.stroke();

    ctx.fillStyle = '#555566';
    ctx.font      = `9px 'JetBrains Mono', monospace`;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(midiToName(midi), 2, y);
  });

  // Note bars
  for (let i = 0; i < sequence.length; i++) {
    const idx = sequence[i];
    const x   = i * stepW;

    if (idx === null) {
      // Rest — small dash in centre
      ctx.fillStyle = '#313139';
      ctx.fillRect(x + 1, h / 2 - 1, stepW - 2, 2);
    } else {
      const midi  = notes[idx];
      const yFrac = 1 - (midi - minNote) / range;
      const y     = pad + yFrac * (h - pad * 2) - barH / 2;
      ctx.fillStyle = i === 0 ? '#b390ff' : '#7c4dff';
      ctx.shadowColor = 'rgba(124,77,255,0.4)';
      ctx.shadowBlur  = 6;
      ctx.beginPath();
      ctx.roundRect(x + 1, y, stepW - 2, barH, 2);
      ctx.fill();
      ctx.shadowBlur = 0;
    }
  }
}

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

  if (sequence.length === 0) return;
  const cellGap = 2;
  const cellW   = (w - cellGap * (sequence.length - 1)) / sequence.length;

  for (let i = 0; i < sequence.length; i++) {
    const x = i * (cellW + cellGap);
    ctx.fillStyle = sequence[i] !== null ? '#7c4dff' : '#1e1e24';
    ctx.beginPath();
    ctx.roundRect(x, 0, cellW, h, 2);
    ctx.fill();
    if (i % 4 === 0) {
      ctx.fillStyle = '#555566';
      ctx.fillRect(x, h - 3, 1, 3);
    }
  }
}

function render() {
  drawVis(document.getElementById('markov-vis-canvas'));
  drawStrip(document.getElementById('markov-strip-canvas'));
}

// ── Matrix ────────────────────────────────────────────────────────────────────

function renderMatrix() {
  const wrap  = document.getElementById('markov-matrix-wrap');
  const notes = markov.notes;
  const n     = notes.length;

  let html = '<table class="markov-matrix"><thead><tr>'
           + '<th class="matrix-corner">↓ / →</th>';
  for (let j = 0; j < n; j++) html += `<th>${midiToName(notes[j])}</th>`;
  html += '</tr></thead><tbody>';

  for (let i = 0; i < n; i++) {
    html += `<tr><th>${midiToName(notes[i])}</th>`;
    for (let j = 0; j < n; j++) {
      const cls = i === j ? ' class="diag"' : '';
      html += `<td><input type="number" min="0" max="9" value="${markov.weights[i][j]}"${cls} data-from="${i}" data-to="${j}"></td>`;
    }
    html += '</tr>';
  }
  html += '</tbody></table>';
  wrap.innerHTML = html;

  wrap.querySelectorAll('input').forEach(inp => {
    inp.addEventListener('input', () => {
      markov.weights[+inp.dataset.from][+inp.dataset.to] =
        Math.max(0, Math.min(9, parseInt(inp.value, 10) || 0));
    });
  });
}

// ── Notes list ────────────────────────────────────────────────────────────────

function addNote(midi) {
  if (markov.notes.length >= 8) return;
  const n = markov.notes.length;
  markov.notes.push(midi);
  markov.weights.forEach(row => row.push(1));
  const newRow = new Array(n + 1).fill(1);
  newRow[n] = 0;
  markov.weights.push(newRow);
  renderNotesList();
  renderMatrix();
}

function removeNote(idx) {
  if (markov.notes.length <= 1) return;
  markov.notes.splice(idx, 1);
  markov.weights.splice(idx, 1);
  markov.weights.forEach(row => row.splice(idx, 1));
  renderNotesList();
  renderMatrix();
}

function renderNotesList() {
  const list = document.getElementById('markov-notes-list');
  list.innerHTML = '';
  markov.notes.forEach((midi, i) => {
    const row = document.createElement('div');
    row.className = 'markov-note-row';
    row.innerHTML = `
      <span class="markov-note-name">${midiToName(midi)}</span>
      <input type="number" min="0" max="127" value="${midi}" data-idx="${i}" class="markov-note-input">
      ${markov.notes.length > 1
        ? `<button class="markov-rm-btn" data-idx="${i}" title="Remove">✕</button>`
        : '<span style="width:20px"></span>'}
    `;
    list.appendChild(row);
  });

  list.querySelectorAll('.markov-note-input').forEach(inp => {
    inp.addEventListener('change', () => {
      const idx  = +inp.dataset.idx;
      const midi = Math.max(0, Math.min(127, parseInt(inp.value, 10) || 0));
      markov.notes[idx] = midi;
      inp.value = midi;
      inp.previousElementSibling.textContent = midiToName(midi);
      renderMatrix();
    });
  });

  list.querySelectorAll('.markov-rm-btn').forEach(btn => {
    btn.addEventListener('click', () => removeNote(+btn.dataset.idx));
  });
}

// ── Preset builder ────────────────────────────────────────────────────────────

function buildPreset() {
  const defStep = { notes: [], velocity: 100, probability: 100, muted: false, glide: false, substeps: 1, cc: null };
  const steps   = [];

  for (let i = 0; i < 64; i++) {
    if (i < sequence.length && sequence[i] !== null) {
      const vel = Math.max(1, Math.min(127,
        markov.velocity + Math.round((Math.random() * 2 - 1) * markov.velVariation)));
      steps.push({
        notes:       [markov.notes[sequence[i]]],
        velocity:    vel,
        probability: 100,
        muted:       false,
        glide:       markov.glide,
        substeps:    1,
        cc:          null,
      });
    } else {
      steps.push({ ...defStep });
    }
  }

  return {
    version: 1,
    transport: {
      bpm: 120, swing: 0, gateLength: 0.5, direction: 'forward',
      stepCount: markov.steps, loopStart: 0, loopEnd: markov.steps - 1, midiChannel: 1,
    },
    pitch:   { scale: 'chromatic', rootNote: 60, transpose: 0 },
    ccLane:  { visible: false, ccNumber: 74 },
    pattern: { name: `Markov ${markov.steps}`, steps },
  };
}

// ── Init ──────────────────────────────────────────────────────────────────────

function init() {
  renderNotesList();
  renderMatrix();

  // Steps
  const stepsSlider = document.getElementById('mk-steps');
  const stepsVal    = document.getElementById('mk-steps-val');
  stepsSlider.addEventListener('input', () => {
    markov.steps = +stepsSlider.value;
    stepsVal.textContent = markov.steps;
  });

  // Rest probability
  const restSlider = document.getElementById('mk-rest');
  const restVal    = document.getElementById('mk-rest-val');
  restSlider.addEventListener('input', () => {
    markov.restProb = +restSlider.value;
    restVal.textContent = markov.restProb + '%';
  });

  // Velocity
  const velSlider = document.getElementById('mk-vel');
  const velVal    = document.getElementById('mk-vel-val');
  velSlider.addEventListener('input', () => {
    markov.velocity = +velSlider.value;
    velVal.textContent = markov.velocity;
  });

  // Vel variation
  const varSlider = document.getElementById('mk-var');
  const varVal    = document.getElementById('mk-var-val');
  varSlider.addEventListener('input', () => {
    markov.velVariation = +varSlider.value;
    varVal.textContent = '±' + markov.velVariation;
  });

  // Glide
  const glideBtn = document.getElementById('mk-glide-btn');
  glideBtn.addEventListener('click', () => {
    markov.glide = !markov.glide;
    glideBtn.classList.toggle('active', markov.glide);
    glideBtn.textContent = markov.glide ? 'Glide: ON' : 'Glide: OFF';
  });

  // Add note
  document.getElementById('mk-add-note-btn').addEventListener('click', () => {
    const last = markov.notes[markov.notes.length - 1];
    addNote(Math.min(127, last + 2));
  });

  // Generate
  document.getElementById('mk-generate-btn').addEventListener('click', () => {
    generate();
    render();
  });

  // Send to Sequencer
  document.getElementById('mk-send-btn').addEventListener('click', () => {
    if (sequence.length === 0) generate();
    const data = buildPreset();
    data.targetScene = Math.max(1, parseInt(document.getElementById('mk-send-scene')?.value, 10) || 1) - 1;
    data.targetTrack = Math.max(1, parseInt(document.getElementById('mk-send-track')?.value, 10) || 1) - 1;
    localStorage.setItem('tessera_pending', JSON.stringify(data));
    window.location.href = 'index.html';
  });

  // Download
  document.getElementById('mk-download-btn').addEventListener('click', () => {
    if (sequence.length === 0) generate();
    const data = buildPreset();
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href = url; a.download = `${data.pattern.name.replace(/\s+/g, '_')}.tessera.json`;
    a.click();
    URL.revokeObjectURL(url);
  });

  // Resize observer
  const ro = new ResizeObserver(() => render());
  ro.observe(document.getElementById('markov-vis-canvas'));
  ro.observe(document.getElementById('markov-strip-canvas'));

  // Tab activation
  document.addEventListener('genTabActivated', e => {
    if (e.detail === 'markov-panel') render();
  });

  // Initial generate + render
  generate();
  render();
}

document.addEventListener('DOMContentLoaded', init);
