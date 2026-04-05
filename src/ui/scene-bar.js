import { get, set } from '../state/state.js';
import { on } from '../utils/event-bus.js';
import { switchToScene, renameScene, addScene, cloneCurrentScene } from '../scenes/scene-manager.js';

export function initSceneBar() {
  _renderSceneButtons();
  _initSongPanel();

  on('stateChange', ({ path }) => {
    if (
      path === 'activeSceneIndex' ||
      path === 'scenes' ||
      path === 'song.queuedSceneIndex'
    ) {
      _renderSceneButtons();
    }
    if (path.startsWith('song')) {
      _renderSongEntries();
    }
  });

  on('scene:loaded', () => _renderSceneButtons());

  document.getElementById('scene-add-btn')?.addEventListener('click', addScene);
  document.getElementById('scene-clone-btn')?.addEventListener('click', cloneCurrentScene);

  document.getElementById('song-mode-btn')?.addEventListener('click', () => {
    document.getElementById('song-panel').classList.add('open');
    document.getElementById('overlay').classList.add('open');
  });

  document.getElementById('overlay')?.addEventListener('click', () => {
    document.getElementById('song-panel').classList.remove('open');
  });
}

// ── Scene buttons ─────────────────────────────────────────────

function _renderSceneButtons() {
  const state = get();
  const container = document.getElementById('scene-buttons');
  if (!container) return;

  container.innerHTML = '';

  state.scenes.forEach((scene, index) => {
    const btn = document.createElement('button');
    btn.className = 'scene-btn';
    if (index === state.activeSceneIndex)    btn.classList.add('active');
    if (index === state.song.queuedSceneIndex) btn.classList.add('queued');

    const numSpan = document.createElement('span');
    numSpan.className = 'scene-num';
    numSpan.textContent = index + 1;

    const nameSpan = document.createElement('span');
    nameSpan.className = 'scene-name';
    nameSpan.textContent = scene.name;

    btn.appendChild(numSpan);
    btn.appendChild(nameSpan);

    btn.addEventListener('click', (e) => {
      if (e.shiftKey) {
        // Shift+click: queue this scene to load at the next loop boundary
        const queued = get().song.queuedSceneIndex;
        set('song.queuedSceneIndex', queued === index ? null : index);
        return;
      }
      if (index !== get().activeSceneIndex) {
        switchToScene(index);
      }
    });

    btn.addEventListener('dblclick', (e) => {
      e.preventDefault();
      _startRename(btn, index, scene.name);
    });

    container.appendChild(btn);
  });
}

function _startRename(btn, index, currentName) {
  const nameSpan = btn.querySelector('.scene-name');
  const input = document.createElement('input');
  input.type = 'text';
  input.value = currentName;
  input.className = 'scene-rename-input';

  nameSpan.replaceWith(input);
  input.focus();
  input.select();

  const commit = () => {
    const newName = input.value.trim() || currentName;
    renameScene(index, newName);
    // stateChange on 'scenes' will re-render buttons
  };

  input.addEventListener('keydown', (e) => {
    e.stopPropagation(); // prevent global keyboard shortcuts
    if (e.key === 'Enter')  { e.preventDefault(); commit(); }
    if (e.key === 'Escape') { e.preventDefault(); _renderSceneButtons(); }
  });

  input.addEventListener('blur', commit);
}

// ── Song Mode panel ───────────────────────────────────────────

function _initSongPanel() {
  document.getElementById('song-panel-close')?.addEventListener('click', () => {
    document.getElementById('song-panel').classList.remove('open');
    document.getElementById('overlay').classList.remove('open');
  });

  document.getElementById('song-enabled')?.addEventListener('change', (e) => {
    set('song.enabled', e.target.checked);
    if (e.target.checked) {
      // Reset song position when enabling
      set('song.activeEntry', 0);
      set('song.currentRepeat', 0);
    }
  });

  document.getElementById('song-add-entry')?.addEventListener('click', () => {
    const state = get();
    const entries = [...state.song.entries, {
      sceneIndex: state.activeSceneIndex,
      repeats: 4,
    }];
    set('song.entries', entries);
  });

  _renderSongEntries();
}

function _renderSongEntries() {
  const state = get();
  const container = document.getElementById('song-entries');
  if (!container) return;

  const enabledBox = document.getElementById('song-enabled');
  if (enabledBox) enabledBox.checked = state.song.enabled;

  container.innerHTML = '';

  if (state.song.entries.length === 0) {
    const empty = document.createElement('p');
    empty.className = 'song-empty';
    empty.textContent = 'No entries yet. Add one below.';
    container.appendChild(empty);
    return;
  }

  state.song.entries.forEach((entry, i) => {
    const row = document.createElement('div');
    row.className = 'song-entry-row';
    if (state.song.enabled && i === state.song.activeEntry) {
      row.classList.add('active-entry');
    }

    // ── Scene selector ──
    const sceneSelect = document.createElement('select');
    sceneSelect.className = 'song-scene-select';
    state.scenes.forEach((scene, si) => {
      const opt = document.createElement('option');
      opt.value = si;
      opt.textContent = `${si + 1}: ${scene.name}`;
      sceneSelect.appendChild(opt);
    });
    sceneSelect.value = entry.sceneIndex;
    sceneSelect.addEventListener('change', () => {
      const entries = get().song.entries.map((e, idx) =>
        idx === i ? { ...e, sceneIndex: parseInt(sceneSelect.value) } : e
      );
      set('song.entries', entries);
    });

    // ── Times label + repeats input ──
    const timesLabel = document.createElement('span');
    timesLabel.className = 'song-times-label';
    timesLabel.textContent = '×';

    const repeatsInput = document.createElement('input');
    repeatsInput.type = 'number';
    repeatsInput.min = 1;
    repeatsInput.max = 64;
    repeatsInput.value = entry.repeats;
    repeatsInput.className = 'song-repeats-input';
    repeatsInput.addEventListener('change', () => {
      const val = Math.max(1, Math.min(64, parseInt(repeatsInput.value) || 1));
      repeatsInput.value = val;
      const entries = get().song.entries.map((e, idx) =>
        idx === i ? { ...e, repeats: val } : e
      );
      set('song.entries', entries);
    });

    // ── Move up / down ──
    const upBtn = document.createElement('button');
    upBtn.textContent = '↑';
    upBtn.title = 'Move up';
    upBtn.disabled = i === 0;
    upBtn.addEventListener('click', () => {
      const entries = [...get().song.entries];
      [entries[i - 1], entries[i]] = [entries[i], entries[i - 1]];
      set('song.entries', entries);
    });

    const downBtn = document.createElement('button');
    downBtn.textContent = '↓';
    downBtn.title = 'Move down';
    downBtn.disabled = i === state.song.entries.length - 1;
    downBtn.addEventListener('click', () => {
      const entries = [...get().song.entries];
      [entries[i + 1], entries[i]] = [entries[i], entries[i + 1]];
      set('song.entries', entries);
    });

    // ── Delete ──
    const delBtn = document.createElement('button');
    delBtn.textContent = '✕';
    delBtn.title = 'Remove';
    delBtn.className = 'song-del-btn';
    delBtn.addEventListener('click', () => {
      const entries = get().song.entries.filter((_, idx) => idx !== i);
      set('song.entries', entries);
      const cur = get().song.activeEntry;
      if (cur >= entries.length) set('song.activeEntry', Math.max(0, entries.length - 1));
    });

    row.appendChild(sceneSelect);
    row.appendChild(timesLabel);
    row.appendChild(repeatsInput);
    row.appendChild(upBtn);
    row.appendChild(downBtn);
    row.appendChild(delBtn);
    container.appendChild(row);
  });
}
