import { get, getStep, setStep, set } from '../state/state.js';
import { on } from '../utils/event-bus.js';

let panel;

export function initStepEditor(panelEl) {
  panel = panelEl;

  panel.querySelector('#close-step-editor').addEventListener('click', close);

  on('ui:openStepEditor', ({ step }) => open(step));
  on('stateChange', ({ path }) => {
    const state = get();
    if (state.ui.selectedStep !== null &&
        path === `pattern.steps.${state.ui.selectedStep}`) {
      populate(state.ui.selectedStep);
    }
  });
}

function open(stepIndex) {
  set('ui.selectedStep', stepIndex);
  panel.querySelector('#step-editor-title').textContent = `Step ${stepIndex + 1}`;
  populate(stepIndex);
  panel.classList.add('open');
}

function close() {
  panel.classList.remove('open');
  set('ui.selectedStep', null);
}

function populate(stepIndex) {
  const step = getStep(stepIndex);
  if (!step) return;

  // Velocity
  const velSlider = panel.querySelector('#step-velocity');
  const velVal = panel.querySelector('#step-velocity-val');
  velSlider.value = step.velocity;
  velVal.textContent = step.velocity;
  velSlider.oninput = () => {
    const v = parseInt(velSlider.value, 10);
    velVal.textContent = v;
    setStep(stepIndex, { velocity: v });
  };

  // Probability
  const probSlider = panel.querySelector('#step-probability');
  const probVal = panel.querySelector('#step-probability-val');
  probSlider.value = step.probability;
  probVal.textContent = step.probability + '%';
  probSlider.oninput = () => {
    const v = parseInt(probSlider.value, 10);
    probVal.textContent = v + '%';
    setStep(stepIndex, { probability: v });
  };

  // Mute
  const muteBtn = panel.querySelector('#step-mute');
  muteBtn.classList.toggle('active', step.muted);
  muteBtn.onclick = () => {
    setStep(stepIndex, { muted: !getStep(stepIndex).muted });
  };

  // Glide
  const glideBtn = panel.querySelector('#step-glide');
  glideBtn.classList.toggle('active', step.glide);
  glideBtn.onclick = () => {
    const s = getStep(stepIndex);
    setStep(stepIndex, { glide: !s.glide });
    populate(stepIndex);
  };

  // Substeps
  panel.querySelectorAll('.substep-btn').forEach(btn => {
    const val = parseInt(btn.dataset.value, 10);
    btn.classList.toggle('active', step.substeps === val);
    btn.onclick = () => {
      setStep(stepIndex, { substeps: val });
      populate(stepIndex);
    };
  });

  // Enforce mutual exclusivity in UI
  const glideDisabled = step.substeps > 1;
  glideBtn.disabled = glideDisabled;
  glideBtn.title = glideDisabled ? 'Disable substeps first' : '';
}
