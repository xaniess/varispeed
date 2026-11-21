import { invoke, convertFileSrc } from '@tauri-apps/api/core';
import { getCurrentWebview } from '@tauri-apps/api/webview';
import { ratio, centsText, prettyTime, deltaText, safeStem, renderName, fileStem, safeFraction } from './core.js';

const $ = (id) => document.getElementById(id);
const state = {
  tracks: [], selected: -1, mode: 'processed', side: 'A', preview: null,
  busy: false, exporting: false, stopAfterCurrent: false, exportFolder: null,
  previewSerial: 0, playhead: 0, statusTimer: null, previewTimer: null,
  lastPreviews: new Map()
};
const players = { A: new Audio(), B: new Audio() };
players.A.preload = 'auto'; players.B.preload = 'auto';
players.A.volume = .85; players.B.volume = .85;
let previewRequest = 0;

const selected = () => state.tracks[state.selected] || null;
const player = () => players[state.side];
const other = () => players[state.side === 'A' ? 'B' : 'A'];
const formatSeconds = (s) => prettyTime(s || 0, true);

function showMessage(message, kind = 'info') {
  const el = $('toast'); el.textContent = message; el.classList.add('visible');
  clearTimeout(state.statusTimer); state.statusTimer = setTimeout(() => el.classList.remove('visible'), 4700);
  if (kind === 'error') console.error(message);
}
function renderState(s) { $('render-state').textContent = s; }
function folderOf(path) {
  const i = Math.max(path.lastIndexOf('\\'), path.lastIndexOf('/'));
  if (i < 0) return '.';
  const prefix = path.slice(0, i);
  return /^[A-Za-z]:$/.test(prefix) ? prefix + '\\' : (prefix || '/');
}
function formatCents(value) { return centsText(Number(value)); }
function outputStem(t) { try { return t.customStem || renderName($('naming-template').value, t, t.cents); } catch (_) { return fileStem(t.path); } }
function currentFraction() {
  const p = player();
  if (Number.isFinite(p.duration) && p.duration > 0) return safeFraction(p.currentTime / p.duration);
  return state.playhead;
}
function isPlaying() { return !player().paused; }

function renderList() {
  $('track-count').textContent = `${state.tracks.length} ${state.tracks.length === 1 ? 'TRACK' : 'TRACKS'}`;
  const list = $('track-list'); list.replaceChildren();
  if (!state.tracks.length) {
    const empty = document.createElement('div'); empty.className = 'empty-collection';
    empty.innerHTML = '<span class="empty-mark">＋</span><strong>Your collection is empty</strong><span>Drop tracks here or add them below.</span>';
    list.append(empty); return;
  }
  state.tracks.forEach((t, i) => {
    const row = document.createElement('div');
    row.className = `track-row ${state.selected === i ? 'selected' : ''}`;
    row.tabIndex = 0; row.setAttribute('role', 'button');
    row.setAttribute('aria-label', `Select ${t.name}`);
    const info = document.createElement('div'); info.style.minWidth = '0';
    const title = document.createElement('div'); title.className = 'track-name'; title.textContent = t.name;
    const desc = document.createElement('div'); desc.className = 'track-desc';
    desc.textContent = `${outputStem(t)} · ${formatCents(t.cents)} · ${formatSeconds(t.duration)}`;
    info.append(title, desc);
    const pitch = document.createElement('input');
    pitch.className = 'row-pitch'; pitch.type = 'number'; pitch.step = '0.01'; pitch.min = '-1200'; pitch.max = '1200';
    pitch.value = String(t.cents); pitch.setAttribute('aria-label', `Pitch cents for ${t.name}`);
    pitch.addEventListener('click', e => e.stopPropagation());
    pitch.addEventListener('keydown', e => e.stopPropagation());
    pitch.addEventListener('change', e => {
      e.stopPropagation(); const value = Number(pitch.value);
      if (!Number.isFinite(value) || Math.abs(value) > 1200) { pitch.value = String(t.cents); return showMessage('Pitch must be between −1200 and +1200 cents.', 'error'); }
      t.cents = value; if (state.selected === i) { syncSelectedFields(); schedulePreview(); }
      renderList();
    });
    row.addEventListener('click', () => selectTrack(i));
    row.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); selectTrack(i); } });
    row.append(info, pitch); list.append(row);
  });
}
function syncSelectedFields() {
  const t = selected();
  if (!t) {
    $('pitch-input').value = '0'; $('export-name').value = ''; $('expected-label').textContent = '—';
    $('filename-preview').textContent = '—'; $('wave-name-a').textContent = 'NO TRACK SELECTED'; return;
  }
  $('pitch-input').value = String(t.cents);
  $('export-name').value = outputStem(t);
  $('wave-name-a').textContent = t.name;
  $('speed-label').textContent = ratio(t.cents).toFixed(6) + '×';
  $('expected-label').textContent = prettyTime(t.duration / ratio(t.cents));
  $('filename-preview').textContent = (outputStem(t)) + '.' + $('export-format').value;
  $('reference-name').textContent = t.reference ? t.reference.split(/[\\/]/).pop() : 'No reference attached';
  $('folder-label').textContent = $('beside-source').checked ? 'Each track’s source folder' : (state.exportFolder || 'Choose a destination');
}
function selectTrack(index) {
  if (index < 0 || index >= state.tracks.length) return;
  state.selected = index; clearAudio(); renderList(); syncSelectedFields(); schedulePreview(20);
}
function clearAudio() {
  ++previewRequest;
  for (const p of [players.A, players.B]) { p.pause(); p.removeAttribute('src'); p.load(); }
  state.preview = null; state.playhead = 0; $('play-pause').disabled = true;
  $('duration-a').textContent = $('duration-b').textContent = '—';
  $('elapsed-a').textContent = $('elapsed-b').textContent = '0:00.000';
  $('duration-difference').textContent = 'DURATION DIFFERENCE · —';
  $('wave-name-b').textContent = 'MATCHING TIMELINE';
  refreshTransport(); renderWaveforms();
}
function stopAudio() { players.A.pause(); players.B.pause(); $('play-icon').textContent = '▶'; $('play-label').textContent = 'Play'; }
async function addTracks(paths) {
  const existing = new Set(state.tracks.map(x => x.path.toLowerCase()));
  let added = 0;
  for (const path of paths) {
    if (typeof path !== 'string' || existing.has(path.toLowerCase())) continue;
    try {
      renderState('Reading ' + fileStem(path) + '…');
      const info = await invoke('inspect_audio', { source: path });
      state.tracks.push({ ...info, cents: 0, customStem: null, reference: null });
      existing.add(path.toLowerCase()); added++;
      renderList();
    } catch (e) { showMessage(`Cannot import ${fileStem(path)}: ${String(e).slice(0, 130)}`, 'error'); }
  }
  renderState('LOCAL / READY');
  if (added > 0) {
    if (state.selected < 0) selectTrack(0);
    else renderList();
    showMessage(`Added ${added} ${added === 1 ? 'track' : 'tracks'} to the collection.`);
  }
}
async function chooseFiles() { try { const paths = await invoke('choose_audio_files'); if (paths.length) await addTracks(paths); } catch (e) { showMessage(String(e), 'error'); } }

function applyPitch(newPitch) {
  if (!Number.isFinite(newPitch) || Math.abs(newPitch) > 1200) return showMessage('Pitch must be between −1200 and +1200 cents.', 'error');
  const t = selected(); if (!t) return;
  const affected = $('apply-all').checked ? state.tracks : [t];
  for (const item of affected) item.cents = newPitch;
  syncSelectedFields(); renderList(); schedulePreview();
}
function schedulePreview(delay = 300) {
  clearTimeout(state.previewTimer);
  state.previewTimer = setTimeout(() => { void loadPreview(); }, delay);
}
async function loadPreview() {
  const t = selected();
  if (!t) { clearAudio(); renderState('Add a track to begin'); return; }
  if (state.mode === 'reference' && !t.reference) {
    clearAudio(); renderState('Choose a reference file for B');
    $('wave-name-b').textContent = 'CHOOSE A REFERENCE FILE';
    $('b-title').textContent = 'REFERENCE'; return;
  }
  const serial = ++previewRequest;
  const source = t.path; const cents = t.cents; const reference = state.mode === 'reference' ? t.reference : null;
  const oldFraction = currentFraction(); const wasPlaying = isPlaying();
  stopAudio(); renderState('Rendering your listening comparison…');
  $('play-pause').disabled = true;
  try {
    const result = await invoke('make_preview', { source, cents, reference });
    if (serial !== previewRequest || selected() !== t) return;
    state.preview = result;
    state.playhead = oldFraction;
    players.A.src = convertFileSrc(result.originalPath);
    players.B.src = convertFileSrc(result.bPath);
    players.A.load(); players.B.load();
    $('duration-a').textContent = prettyTime(result.originalDuration);
    $('duration-b').textContent = prettyTime(result.bDuration);
    $('wave-name-a').textContent = `${t.name} · file ${prettyTime(result.sourceFileDuration)}`;
    $('wave-name-b').textContent = reference ? `${reference.split(/[\\/]/).pop()} · file ${prettyTime(result.referenceFileDuration)}` : `${formatCents(result.effectiveCents)} · RESAMPLE`;
    $('b-title').textContent = reference ? 'REFERENCE EXPORT' : 'PROCESSED';
    const difference = result.bDuration - result.originalDuration;
    $('duration-difference').textContent = `B − A · ${deltaText(difference)} · ${difference < 0 ? 'SHORTER' : difference > 0 ? 'LONGER' : 'SAME LENGTH'}`;
    if (reference) {
      $('expected-label').textContent = `REF ${prettyTime(result.bDuration)}`;
      renderState('Reference A/B · duration is not a pitch measurement');
    } else {
      $('expected-label').textContent = prettyTime(result.bDuration);
      renderState(`Processed · actual ${centsText(result.effectiveCents)}`);
    }
    $('play-pause').disabled = false;
    for (const [side, p] of Object.entries(players)) {
      p.addEventListener('loadedmetadata', () => {
        if (serial === previewRequest && Number.isFinite(p.duration)) p.currentTime = Math.min(p.duration, oldFraction * p.duration);
      }, { once: true });
    }
    refreshTransport(); renderWaveforms();
    if (wasPlaying) {
      try { await player().play(); refreshTransport(); }
      catch (_) { /* User may need to press play after decoding; don't autoplay in violation of browser policy. */ }
    }
  } catch (error) {
    if (serial !== previewRequest) return;
    clearAudio(); renderState('Preview failed');
    showMessage('Audio preview failed: ' + String(error).slice(0, 220), 'error');
  }
}

function setSide(side) {
  if (!state.preview || side === state.side) return;
  const fraction = currentFraction(); const playing = isPlaying();
  player().pause(); state.side = side; state.playhead = fraction;
  const target = player(); if (Number.isFinite(target.duration)) target.currentTime = safeFraction(fraction) * target.duration;
  if (playing) target.play().catch(e => showMessage(`Playback failed: ${e.message}`, 'error'));
  refreshTransport(); renderWaveforms();
}
async function togglePlayback() {
  if (!state.preview) return;
  try {
    if (isPlaying()) player().pause();
    else {
      if (Number.isFinite(player().duration) && player().currentTime >= player().duration - 0.05) seek(0);
      await player().play();
    }
    refreshTransport();
  } catch (e) { showMessage(`Cannot play audio: ${e.message}`, 'error'); }
}
function seek(fraction) {
  if (!state.preview) return;
  fraction = safeFraction(fraction); state.playhead = fraction;
  for (const p of [players.A, players.B]) {
    if (Number.isFinite(p.duration) && p.duration > 0) p.currentTime = Math.min(p.duration, fraction * p.duration);
  }
  refreshTransport(); renderWaveforms();
}
function refreshTransport() {
  const playing = state.preview && isPlaying();
  $('play-icon').textContent = playing ? 'Ⅱ' : '▶'; $('play-label').textContent = playing ? 'Pause' : 'Play';
  for (const side of ['A', 'B']) {
    const el = $('side-' + side.toLowerCase()); el.classList.toggle('active', side === state.side); el.setAttribute('aria-pressed', String(side === state.side));
  }
  const fraction = currentFraction();
  if (state.preview) {
    $('elapsed-a').textContent = prettyTime(fraction * state.preview.originalDuration);
    $('elapsed-b').textContent = prettyTime(fraction * state.preview.bDuration);
    $('playtime').textContent = `${prettyTime(player().currentTime || 0, false)} / ${prettyTime(player().duration || 0, false)}`;
  } else $('playtime').textContent = '0:00 / 0:00';
}
function drawWave(id, peaks, color) {
  const canvas = $(id), rect = canvas.getBoundingClientRect();
  const width = Math.max(1, rect.width), height = Math.max(1, rect.height);
  const dpr = Math.min(2, devicePixelRatio || 1);
  canvas.width = Math.round(width * dpr); canvas.height = Math.round(height * dpr);
  const ctx = canvas.getContext('2d'); ctx.scale(dpr, dpr);
  ctx.strokeStyle = '#d0d5d0'; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(10, height / 2); ctx.lineTo(width - 10, height / 2); ctx.stroke();
  if (!peaks?.length) {
    ctx.fillStyle = '#c6cfcb';
    for (let x = 13; x < width - 13; x += 10) ctx.fillRect(x, height / 2 - 3, 3, 6);
    return;
  }
  const fraction = currentFraction();
  const padding = 12, usable = width - padding * 2;
  const bar = Math.max(1.25, usable / peaks.length * .62);
  for (let i = 0; i < peaks.length; i++) {
    const x = padding + i / peaks.length * usable;
    const amp = Math.max(1.5, (Math.max(0, peaks[i]) ** .88) * (height * .40));
    ctx.fillStyle = i / peaks.length <= fraction ? color.active : color.base;
    ctx.fillRect(x, height / 2 - amp, bar, amp * 2);
  }
  const playX = padding + usable * fraction;
  ctx.strokeStyle = '#5e6a6b'; ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.moveTo(playX, 3); ctx.lineTo(playX, height - 3); ctx.stroke();
  ctx.beginPath(); ctx.arc(playX, 4, 3.5, 0, Math.PI * 2); ctx.fillStyle = '#5e6a6b'; ctx.fill();
}
function renderWaveforms() {
  drawWave('wave-a', state.preview?.originalPeaks, {base:'#b8bebb',active:'#59676a'});
  drawWave('wave-b', state.preview?.bPeaks, {base:'#a6b3b2',active:'#34474d'});
}

function setReferenceMode(mode) {
  if (mode === state.mode) return;
  state.mode = mode;
  $('mode-rendered').classList.toggle('selected', mode === 'processed');
  $('mode-reference').classList.toggle('selected', mode === 'reference');
  $('mode-rendered').setAttribute('aria-pressed', String(mode === 'processed'));
  $('mode-reference').setAttribute('aria-pressed', String(mode === 'reference'));
  $('reference-toolbar').hidden = mode !== 'reference';
  schedulePreview(50);
}
async function chooseReference() {
  const t = selected(); if (!t) return showMessage('Import and select an original track first.');
  try {
    const paths = await invoke('choose_audio_files'); if (!paths.length) return;
    await invoke('inspect_audio', { source: paths[0] });
    t.reference = paths[0]; syncSelectedFields(); schedulePreview(50);
    showMessage('Reference attached. A/B now compares your two actual files.');
  } catch (e) { showMessage(`Cannot attach reference: ${String(e)}`, 'error'); }
}

async function exportBatch() {
  if (state.exporting) { state.stopAfterCurrent = true; $('export-message').textContent = 'Stopping after current export…'; return; }
  if (state.tracks.length === 0) return showMessage('Add some audio tracks first.');
  if (!$('beside-source').checked && !state.exportFolder) return showMessage('Choose an export folder first.');
  const template = $('naming-template').value;
  if (!template.trim()) return showMessage('Please provide a filename template.');
  try { renderName(template, state.tracks[0], state.tracks[0].cents); } catch (e) { return showMessage(String(e), 'error'); }
  state.exporting = true; state.stopAfterCurrent = false;
  $('export-button').textContent = 'Stop after this track';
  let successes = 0, errors = 0;
  const n = state.tracks.length;
  for (let i = 0; i < n; i++) {
    if (state.stopAfterCurrent) break;
    const t = state.tracks[i];
    $('export-message').textContent = `Exporting ${i + 1} of ${n}: ${t.name}`;
    $('progress-fill').style.width = `${Math.round((i / n) * 100)}%`;
    try {
      const folder = $('beside-source').checked ? folderOf(t.path) : state.exportFolder;
      const saved = await invoke('export_audio', { request: {
        source: t.path, cents: t.cents, format: $('export-format').value, folder,
        template, overrideStem: t.customStem || null
      }});
      successes++; $('export-message').textContent = `Saved: ${saved}`;
    } catch (e) { errors++; showMessage(`${t.name}: ${String(e).slice(0, 190)}`, 'error'); }
    $('progress-fill').style.width = `${Math.round(((i + 1) / n) * 100)}%`;
  }
  state.exporting = false;
  $('export-button').innerHTML = 'Export collection <span>↗</span>';
  $('export-message').textContent = `${successes} exported · ${errors} failed${state.stopAfterCurrent ? ' · stopped' : ''}. Originals untouched.`;
  showMessage(`${successes} export(s) complete${errors ? `; ${errors} failed` : ''}.`);
}

function bindEvents() {
  $('add-tracks').addEventListener('click', chooseFiles);
  $('remove-track').addEventListener('click', () => {
    if (!selected()) return;
    ++previewRequest; stopAudio(); state.tracks.splice(state.selected, 1);
    state.selected = Math.min(state.selected, state.tracks.length - 1);
    if (selected()) { syncSelectedFields(); schedulePreview(50); }
    else { clearAudio(); syncSelectedFields(); renderState('Add a track to begin'); }
    renderList();
  });
  $('clear-tracks').addEventListener('click', () => {
    ++previewRequest; state.tracks = []; state.selected = -1;
    stopAudio(); clearAudio(); renderList(); syncSelectedFields(); renderState('Add a track to begin');
  });
  $('pitch-input').addEventListener('input', e => {
    const text = e.target.value; if (!text.trim() || text === '-') return;
    applyPitch(Number(text));
  });
  document.querySelectorAll('[data-cents]').forEach(button => button.addEventListener('click', () => applyPitch(Number(button.dataset.cents))));
  $('apply-all').addEventListener('change', () => { if ($('apply-all').checked && selected()) applyPitch(selected().cents); });
  $('mode-rendered').addEventListener('click', () => setReferenceMode('processed'));
  $('mode-reference').addEventListener('click', () => setReferenceMode('reference'));
  $('choose-reference').addEventListener('click', chooseReference);
  $('clear-reference').addEventListener('click', () => { const t = selected(); if (t) { t.reference = null; syncSelectedFields(); schedulePreview(10); } });
  $('side-a').addEventListener('click', () => setSide('A'));
  $('side-b').addEventListener('click', () => setSide('B'));
  $('play-pause').addEventListener('click', togglePlayback);
  $('restart').addEventListener('click', () => seek(0));
  $('volume').addEventListener('input', e => { for (const p of Object.values(players)) p.volume = Number(e.target.value) / 100; });
  for (const side of ['a','b']) {
    const wave = $('wave-' + side);
    wave.addEventListener('click', e => {
      const bounds = wave.getBoundingClientRect(); seek((e.clientX - bounds.left - 12) / (bounds.width - 24));
    });
    wave.addEventListener('keydown', e => { if (e.key === 'ArrowLeft') { seek(currentFraction() - .01); e.preventDefault(); } if (e.key === 'ArrowRight') { seek(currentFraction() + .01); e.preventDefault(); } });
  }
  for (const p of Object.values(players)) {
    p.addEventListener('timeupdate', () => { state.playhead = currentFraction(); refreshTransport(); renderWaveforms(); });
    p.addEventListener('ended', () => refreshTransport());
    p.addEventListener('pause', () => refreshTransport());
    p.addEventListener('play', () => refreshTransport());
    p.addEventListener('error', () => { if (state.preview && p.src) showMessage('Playback could not open the preview audio. Check the Tauri asset configuration.', 'error'); });
  }
  $('export-name').addEventListener('input', e => {
    const t = selected(); if (!t) return;
    t.customStem = e.target.value.trim() ? safeStem(e.target.value) : null;
    $('filename-preview').textContent = `${outputStem(t)}.${$('export-format').value}`;
    renderList();
  });
  $('naming-template').addEventListener('change', () => {
    try { renderList(); syncSelectedFields(); }
    catch (e) { showMessage(String(e), 'error'); }
  });
  $('export-format').addEventListener('change', syncSelectedFields);
  $('beside-source').addEventListener('change', syncSelectedFields);
  $('choose-folder').addEventListener('click', async () => {
    try {
      const folder = await invoke('choose_export_folder');
      if (folder) { state.exportFolder = folder; $('beside-source').checked = false; syncSelectedFields(); }
    } catch (e) { showMessage(`Cannot choose folder: ${e}`, 'error'); }
  });
  $('export-button').addEventListener('click', exportBatch);
  document.addEventListener('keydown', e => {
    const tag = document.activeElement?.tagName;
    if (['INPUT','TEXTAREA','SELECT','BUTTON'].includes(tag)) return;
    if (e.code === 'Space') { e.preventDefault(); void togglePlayback(); }
    if (e.key.toLowerCase() === 'a') setSide('A');
    if (e.key.toLowerCase() === 'b') setSide('B');
  });
  new ResizeObserver(() => renderWaveforms()).observe($('wave-a'));
  new ResizeObserver(() => renderWaveforms()).observe($('wave-b'));
}
async function enableDragDrop() {
  try {
    await getCurrentWebview().onDragDropEvent(e => {
      const type = e.payload.type;
      $('drop-zone').classList.toggle('drop-active', type === 'enter' || type === 'over');
      if (type === 'drop') { $('drop-zone').classList.remove('drop-active'); void addTracks(e.payload.paths || []); }
      if (type === 'leave') $('drop-zone').classList.remove('drop-active');
    });
  } catch (error) { console.warn('Native drag-and-drop unavailable; Add tracks still works.', error); }
}
bindEvents(); renderList(); renderWaveforms(); void enableDragDrop();
