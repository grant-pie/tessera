import { get, setStep } from '../state/state.js';
import { randomInt } from '../utils/math.js';
import { isInScale } from '../engine/scale.js';

export function initRandomize(panelEl) {
  const closeBtn    = panelEl.querySelector('#rand-close');
  const overlay     = document.getElementById('overlay');

  const notesBtn    = panelEl.querySelector('#rand-notes-btn');
  const glideBtn    = panelEl.querySelector('#rand-glide-btn');
  const substepBtn  = panelEl.querySelector('#rand-substep-btn');
  const allBtn      = panelEl.querySelector('#rand-all-btn');

  const loNote      = panelEl.querySelector('#rand-lo-note');
  const hiNote      = panelEl.querySelector('#rand-hi-note');
  const density     = panelEl.querySelector('#rand-density');
  const densityVal  = panelEl.querySelector('#rand-density-val');

  const glideDens   = panelEl.querySelector('#rand-glide-density');
  const glideDensVal = panelEl.querySelector('#rand-glide-density-val');

  const subDens     = panelEl.querySelector('#rand-sub-density');
  const subDensVal  = panelEl.querySelector('#rand-sub-density-val');

  // Init controls from state
  loNote.value = 36;  // C2
  hiNote.value = 84;  // C6
  density.value = 70;
  densityVal.textContent = '70%';
  glideDens.value = 25;
  glideDensVal.textContent = '25%';
  subDens.value = 20;
  subDensVal.textContent = '20%';

  density.addEventListener('input', () => { densityVal.textContent = density.value + '%'; });
  glideDens.addEventListener('input', () => { glideDensVal.textContent = glideDens.value + '%'; });
  subDens.addEventListener('input', () => { subDensVal.textContent = subDens.value + '%'; });

  function close() {
    panelEl.classList.remove('open');
    overlay.classList.remove('open');
  }

  closeBtn.addEventListener('click', close);
  overlay.addEventListener('click', close);

  notesBtn.addEventListener('click', () => randomizeNotes());
  glideBtn.addEventListener('click', () => randomizeGlide());
  substepBtn.addEventListener('click', () => randomizeSubsteps());
  allBtn.addEventListener('click', () => { randomizeNotes(); randomizeGlide(); randomizeSubsteps(); });
}

function randomizeNotes() {
  const panelEl = document.getElementById('randomize-panel');
  const lo    = parseInt(panelEl.querySelector('#rand-lo-note').value, 10);
  const hi    = parseInt(panelEl.querySelector('#rand-hi-note').value, 10);
  const dens  = parseInt(panelEl.querySelector('#rand-density').value, 10);

  const state = get();
  const { scale, rootNote } = state.pitch;
  const cols = state.transport.stepCount;

  // Build list of valid notes in range + scale
  const validNotes = [];
  for (let n = Math.min(lo, hi); n <= Math.max(lo, hi); n++) {
    if (isInScale(n, rootNote, scale)) validNotes.push(n);
  }
  if (validNotes.length === 0) return;

  for (let col = 0; col < cols; col++) {
    if (Math.random() * 100 < dens) {
      const note = validNotes[randomInt(0, validNotes.length - 1)];
      setStep(col, { notes: [note] });
    } else {
      setStep(col, { notes: [] });
    }
  }
}

function randomizeGlide() {
  const panelEl = document.getElementById('randomize-panel');
  const dens = parseInt(panelEl.querySelector('#rand-glide-density').value, 10);
  const state = get();

  for (let col = 0; col < state.transport.stepCount; col++) {
    const step = state.pattern.steps[col];
    if (step.substeps > 1) continue; // skip if substeps active
    const glide = Math.random() * 100 < dens;
    setStep(col, { glide });
  }
}

function randomizeSubsteps() {
  const panelEl = document.getElementById('randomize-panel');
  const dens = parseInt(panelEl.querySelector('#rand-sub-density').value, 10);
  const state = get();

  for (let col = 0; col < state.transport.stepCount; col++) {
    const step = state.pattern.steps[col];
    if (step.glide) continue; // skip if glide active
    if (Math.random() * 100 < dens) {
      setStep(col, { substeps: randomInt(2, 4) });
    } else {
      setStep(col, { substeps: 1 });
    }
  }
}

// Export so external callers can trigger randomize
export { randomizeNotes, randomizeGlide, randomizeSubsteps };
