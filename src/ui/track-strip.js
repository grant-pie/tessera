import { get, set } from '../state/state.js';
import { on } from '../utils/event-bus.js';
import {
  switchToTrack, addTrack, removeTrack,
  renameTrack, toggleMute, setTrackOutput, setTrackChannel, setTrackPreset,
} from '../scenes/track-manager.js';
import { BUILTIN_ID, PRESET_NAMES } from '../audio/factory-sound-engine.js';

export function initTrackStrip() {
  _render();

  on('stateChange', ({ path }) => {
    if (
      path === 'tracks' ||
      path === 'activeTrackIndex' ||
      path === 'midi.outputs' ||
      path === 'midi.outputId'
    ) _render();
  });

  on('track:switched', () => _render());

  document.getElementById('add-track-btn')?.addEventListener('click', addTrack);
}

// ── Render ────────────────────────────────────────────────────

function _render() {
  const state   = get();
  const container = document.getElementById('track-cards');
  if (!container) return;

  container.innerHTML = '';

  state.tracks.forEach((track, index) => {
    container.appendChild(_buildCard(track, index, state));
  });
}

function _buildCard(track, index, state) {
  const isActive = index === state.activeTrackIndex;

  const card = document.createElement('div');
  card.className = 'track-card' + (isActive ? ' active' : '') + (track.mute ? ' muted' : '');
  card.style.setProperty('--track-color', track.color);
  card.title = `Click to focus • Double-click name to rename${state.tracks.length > 1 ? ' • Right-click to remove' : ''}`;

  // Focus on click (anywhere on card except interactive controls)
  card.addEventListener('click', (e) => {
    if (e.target.closest('select, input, button')) return;
    switchToTrack(index);
  });

  card.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    if (state.tracks.length > 1) removeTrack(index);
  });

  // ── Color bar ──
  const colorBar = document.createElement('div');
  colorBar.className = 'track-color-bar';

  // ── Name ──
  const nameEl = document.createElement('span');
  nameEl.className = 'track-name';
  nameEl.textContent = track.name;
  nameEl.title = 'Double-click to rename';
  nameEl.addEventListener('dblclick', (e) => {
    e.stopPropagation();
    _startRename(nameEl, index, track.name);
  });

  // ── Channel input ──
  const chWrap = document.createElement('div');
  chWrap.className = 'track-ch-wrap';

  const chLabel = document.createElement('span');
  chLabel.className = 'track-ch-label';
  chLabel.textContent = 'CH';

  const chInput = document.createElement('input');
  chInput.type = 'number';
  chInput.min = 1;
  chInput.max = 16;
  chInput.value = track.midiChannel;
  chInput.className = 'track-ch-input';
  chInput.title = 'MIDI channel';
  chInput.addEventListener('change', () => {
    const v = Math.max(1, Math.min(16, parseInt(chInput.value) || 1));
    chInput.value = v;
    setTrackChannel(index, v);
  });
  chInput.addEventListener('click', e => e.stopPropagation());

  chWrap.appendChild(chLabel);
  chWrap.appendChild(chInput);

  // ── Output selector ──
  const outSelect = document.createElement('select');
  outSelect.className = 'track-out-select';
  outSelect.title = 'MIDI output for this track';

  const defaultOpt = document.createElement('option');
  defaultOpt.value = '';
  defaultOpt.textContent = 'Global';
  outSelect.appendChild(defaultOpt);

  state.midi.outputs.forEach(({ id, name }) => {
    const opt = document.createElement('option');
    opt.value = id;
    opt.textContent = name.length > 14 ? name.slice(0, 13) + '…' : name;
    outSelect.appendChild(opt);
  });

  outSelect.value = track.midiOutputId || '';
  outSelect.addEventListener('change', (e) => {
    e.stopPropagation();
    setTrackOutput(index, e.target.value || null);
  });
  outSelect.addEventListener('click', e => e.stopPropagation());

  // ── Synth preset selector (visible only when routing to built-in) ──
  const effectiveOutputId = track.midiOutputId || state.midi.outputId;
  const isBuiltin = effectiveOutputId === BUILTIN_ID;

  const presetSelect = document.createElement('select');
  presetSelect.className = 'track-preset-select';
  presetSelect.title = 'Built-in synth preset for this track';
  presetSelect.style.display = isBuiltin ? '' : 'none';

  const globalOpt = document.createElement('option');
  globalOpt.value = '';
  globalOpt.textContent = '— Global —';
  presetSelect.appendChild(globalOpt);

  PRESET_NAMES.forEach(({ id, label }) => {
    const opt = document.createElement('option');
    opt.value = id;
    opt.textContent = label;
    presetSelect.appendChild(opt);
  });

  presetSelect.value = track.synthPreset || '';
  presetSelect.addEventListener('change', (e) => {
    e.stopPropagation();
    setTrackPreset(index, e.target.value || null);
  });
  presetSelect.addEventListener('click', e => e.stopPropagation());

  // ── Mute button ──
  const muteBtn = document.createElement('button');
  muteBtn.className = 'track-mute-btn' + (track.mute ? ' muted' : '');
  muteBtn.textContent = 'M';
  muteBtn.title = track.mute ? 'Unmute track' : 'Mute track';
  muteBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    toggleMute(index);
  });

  card.appendChild(colorBar);
  card.appendChild(nameEl);
  card.appendChild(chWrap);
  card.appendChild(outSelect);
  card.appendChild(presetSelect);
  card.appendChild(muteBtn);

  return card;
}

// ── Inline rename ─────────────────────────────────────────────

function _startRename(nameEl, index, currentName) {
  const input = document.createElement('input');
  input.type = 'text';
  input.value = currentName;
  input.className = 'track-rename-input';

  nameEl.replaceWith(input);
  input.focus();
  input.select();

  const commit = () => {
    const newName = input.value.trim() || currentName;
    renameTrack(index, newName);
    // stateChange on 'tracks' triggers re-render
  };

  input.addEventListener('keydown', (e) => {
    e.stopPropagation();
    if (e.key === 'Enter')  { e.preventDefault(); commit(); }
    if (e.key === 'Escape') { e.preventDefault(); _render(); }
  });

  input.addEventListener('blur', commit);
  input.addEventListener('click', e => e.stopPropagation());
}
