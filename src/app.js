import { invoke, convertFileSrc } from '@tauri-apps/api/core';
import { getCurrentWebview } from '@tauri-apps/api/webview';
import { ratio, centsText, prettyTime, deltaText, safeStem, renderName, fileStem, safeFraction } from './core.js';
import { bestReferenceEstimate, formatReferenceEstimate } from './reference-analysis.js';

const $ = (id) => document.getElementById(id);
const state = {
  tracks: [], selected: -1, mode: 'processed', side: 'A', preview: null,
  busy: false, exporting: false, stopAfterCurrent: false, exportFolder: null,
  previewSerial: 0, playhead: 0, statusTimer: null, previewTimer: null,
  lastPreviews: new Map(), panCue: false, switchSerial: 0
};
const players = { A: new Audio(), B: new Audio() };
players.A.preload = 'auto'; players.B.preload = 'auto';
// Tauri's asset protocol returns an origin-matched CORS header.
// Explicit CORS mode is needed when routing audio through Web Audio.
players.A.crossOrigin = 'anonymous'; players.B.crossOrigin = 'anonymous';
players.A.volume = .85; players.B.volume = .85;
let previewRequest = 0;
let audioGraph = null;
let waveFrame = null;
const waveCaches = new Map();
let waveformMode = 'detail';
const waveDurations = () => state.preview ? {
  A: state.preview.originalDuration, B: state.preview.bDuration,
  max: Math.max(state.preview.originalDuration, state.preview.bDuration)
} : { A: 0, B: 0, max: 0 };

// Monitoring only: exports are always unpanned. Web Audio gain ramps avoid switch clicks.
async function ensureAudioGraph() {
  if (!audioGraph) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return false;
    try {
      const context = new AC();
      const master = context.createGain();
      master.gain.value = Number($('volume').value) / 100;
      master.connect(context.destination);
      const sideNodes = {};
      for (const side of ['A', 'B']) {
        const source = context.createMediaElementSource(players[side]);
        const pan = context.createStereoPanner();
        const gain = context.createGain();
        gain.gain.value = state.side === side ? 1 : 0;
        source.connect(pan).connect(gain).connect(master);
        sideNodes[side] = { pan, gain };
        players[side].volume = 1;
      }
      audioGraph = { context, master, sideNodes };
      setMonitorPan();
    } catch (error) { console.warn('Audio monitoring fallback:', error); return false; }
  }
  if (audioGraph.context.state === 'suspended') await audioGraph.context.resume();
  return true;
}
function setMonitorPan() {
  if (audioGraph) {
    audioGraph.sideNodes.A.pan.pan.value = state.panCue ? -1 : 0;
    audioGraph.sideNodes.B.pan.pan.value = state.panCue ? 1 : 0;
  }
  document.body.classList.toggle('pan-enabled', state.panCue);
}
function setGains(active, fade = false) {
  if (!audioGraph) return;
  const now = audioGraph.context.currentTime;
  for (const side of ['A', 'B']) {
    const gain = audioGraph.sideNodes[side].gain.gain;
    gain.cancelScheduledValues(now);
    gain.setValueAtTime(gain.value, now);
    if (fade) gain.linearRampToValueAtTime(side === active ? 1 : 0, now + .035);
    else gain.setValueAtTime(side === active ? 1 : 0, now);
  }
}
function updateListeningUI() {
  document.querySelectorAll('.wave-panel').forEach(el => el.classList.toggle('is-listening', el.dataset.side === state.side));
  $('side-a').setAttribute('aria-label', 'Listen to A, original');
  $('side-b').setAttribute('aria-label', 'Listen to B, comparison');
}
function tick() {
  waveFrame = null;
  if (!state.preview || !isPlaying()) return;
  state.playhead = currentFraction();
  refreshTransport(); renderWaveforms();
  waveFrame = requestAnimationFrame(tick);
}
function startTicks() { if (waveFrame == null) waveFrame = requestAnimationFrame(tick); }


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
    empty.innerHTML = '<button class="empty-mark" type="button" aria-label="Add audio files" title="Add audio files"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 4v16M4 12h16" /></svg></button><strong>Your collection is empty</strong><span>Drop audio here</span>';
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
    desc.textContent = `${formatCents(t.cents)} · ${formatSeconds(t.duration)}`;
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
    $('pitch-input').value = '0'; $('export-name').value = ''; $('expected-label').textContent = '...';
    $('filename-preview').textContent = '...'; $('wave-name-a').textContent = 'NO TRACK SELECTED'; return;
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
  ++previewRequest; ++state.switchSerial; if (waveFrame != null) { cancelAnimationFrame(waveFrame); waveFrame = null; }
  for (const p of [players.A, players.B]) { p.pause(); p.removeAttribute('src'); p.load(); }
  state.preview = null; state.playhead = 0; $('play-pause').disabled = true;
  $('duration-a').textContent = $('duration-b').textContent = '...';
  $('elapsed-a').textContent = $('elapsed-b').textContent = '0:00.000';
  $('duration-difference').textContent = 'DURATION · ...';
  updateLengthComparison();
  $('wave-name-b').textContent = 'MATCHING TIMELINE';
  $('reference-analysis').textContent = 'Attach a reference to estimate its shift';
  refreshTransport(); renderWaveforms();
}
function stopAudio() { ++state.switchSerial; players.A.pause(); players.B.pause(); setGains(state.side); updatePlayButton(false); }
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
  renderState('Ready');
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
  stopAudio(); renderState('Preparing preview…');
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
    $('wave-name-a').textContent = t.name;
    $('wave-name-b').textContent = reference ? `${reference.split(/[\\/]/).pop()} · file ${prettyTime(result.referenceFileDuration)}` : 'Exact resample';
    $('b-title').textContent = reference ? 'REFERENCE EXPORT' : 'PROCESSED';
    if (reference) {
      const estimated = bestReferenceEstimate(
        result.referenceSignalA, result.referenceSignalB,
        result.originalDuration, result.bDuration
      );
      $('reference-analysis').textContent = formatReferenceEstimate(estimated);
    } else {
      $('reference-analysis').textContent = 'Attach a reference to estimate its shift';
    }
    // Large high-resolution signal arrays are not used by the waveform display.
    delete result.referenceSignalA;
    delete result.referenceSignalB;
    updateLengthComparison();
    if (reference) {
      $('expected-label').textContent = `REF ${prettyTime(result.bDuration)}`;
      renderState('Reference ready');
    } else {
      $('expected-label').textContent = prettyTime(result.bDuration);
      renderState('Preview ready');
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

async function setSide(side) {
  if (!state.preview || side === state.side) return;
  const token = ++state.switchSerial;
  const previous = state.side;
  const fraction = currentFraction();
  const wasPlaying = isPlaying();
  const outgoing = players[previous], incoming = players[side];
  const duration = Number.isFinite(incoming.duration) ? incoming.duration : 0;
  if (duration > 0) incoming.currentTime = Math.min(duration - .001, safeFraction(fraction) * duration);
  if (!wasPlaying) {
    state.side = side; state.playhead = fraction;
    setGains(side); refreshTransport(); renderWaveforms(); return;
  }
  try {
    const graphReady = await ensureAudioGraph();
    if (graphReady) audioGraph.sideNodes[side].gain.gain.value = 0;
    else incoming.volume = 0;
    await incoming.play();
    if (token !== state.switchSerial) { incoming.pause(); return; }
    state.side = side; state.playhead = fraction;
    if (graphReady) setGains(side, true);
    else { incoming.volume = Number($('volume').value) / 100; outgoing.pause(); }
    refreshTransport(); renderWaveforms(); startTicks();
    if (graphReady) setTimeout(() => {
      if (token === state.switchSerial) outgoing.pause();
    }, 55);
  } catch (e) {
    if (token === state.switchSerial) {
      state.side = previous; setGains(previous); refreshTransport();
      showMessage(`Cannot switch versions: ${e.message}`, 'error');
    }
  }
}
async function togglePlayback() {
  if (!state.preview) return;
  try {
    if (isPlaying()) { ++state.switchSerial; players.A.pause(); players.B.pause(); setGains(state.side); }
    else {
      if (Number.isFinite(player().duration) && player().currentTime >= player().duration - 0.05) seek(0);
      const graphReady = await ensureAudioGraph();
      if (graphReady) setGains(state.side);
      await player().play(); startTicks();
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
function updatePlayButton(playing) {
  const button = $('play-pause');
  button.dataset.playing = String(playing);
  button.setAttribute('aria-label', playing ? 'Pause audio' : 'Play audio');
  button.title = playing ? 'Pause' : 'Play';
  $('play-label').textContent = playing ? 'Pause' : 'Play';
}
let lastAudibleVolume = 85;
function updateVolume(value) {
  const level = Math.max(0, Math.min(100, Number(value) || 0));
  $('volume').value = String(level);
  if (level > 0) lastAudibleVolume = level;
  const button = $('volume-toggle');
  button.dataset.level = level === 0 ? 'muted' : level < 45 ? 'low' : 'high';
  const muted = level === 0;
  button.setAttribute('aria-pressed', String(muted));
  button.setAttribute('aria-label', muted ? 'Unmute audio' : 'Mute audio');
  button.title = muted ? 'Unmute audio' : 'Mute audio';
  if (audioGraph) audioGraph.master.gain.value = level / 100;
  else for (const p of Object.values(players)) p.volume = level / 100;
}
function refreshTransport() {
  const playing = state.preview && isPlaying();
  updatePlayButton(Boolean(playing));
  for (const side of ['A', 'B']) {
    const el = $('side-' + side.toLowerCase()); el.classList.toggle('active', side === state.side); el.setAttribute('aria-pressed', String(side === state.side));
  }
  updateListeningUI();
  const fraction = currentFraction();
  if (state.preview) {
    $('elapsed-a').textContent = prettyTime(fraction * state.preview.originalDuration);
    $('elapsed-b').textContent = prettyTime(fraction * state.preview.bDuration);
  }
}
// Every waveform uses the same time scale. A shortened B now ends before A.
// Detail uses RMS contrast so very loud or limited music still has structure.
function percentile(values, fraction) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor((sorted.length - 1) * fraction))];
}
function makeBars(peaks, rms, count) {
  const out = [];
  const samples = rms?.length ? rms : peaks || [];
  if (!samples.length) return out;
  const low = percentile(samples, .12), high = percentile(samples, .90);
  const scale = Math.max(.018, high - low);
  const ceiling = Math.max(.08, percentile(samples, .96) * 1.25);
  for (let i = 0; i < count; i++) {
    const a = Math.floor(i * samples.length / count);
    const b = Math.max(a + 1, Math.floor((i + 1) * samples.length / count));
    let energy = 0, peak = 0, n = 0;
    for (let j = a; j < b && j < samples.length; j++) {
      energy += samples[j]; peak = Math.max(peak, peaks?.[j] || samples[j]); n++;
    }
    if (!n) { out.push([0, 0]); continue; }
    const mean = energy / n;
    // Detail is intentionally contrast-enhanced, not a loudness meter.
    const detail = Math.max(.055, Math.min(.94, .12 + (mean - low) / scale * .72));
    const natural = Math.max(.035, Math.min(.94, mean / ceiling * .76));
    const core = waveformMode === 'detail' ? detail : natural;
    const transient = Math.min(.97, Math.max(core, core + Math.max(0, peak - mean) * .16));
    out.push([transient, core]);
  }
  return out;
}
function buildWaveCache(id, peaks, rms, color, width, height, dpr, usableFraction) {
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(width * dpr); canvas.height = Math.round(height * dpr);
  const ctx = canvas.getContext('2d'); ctx.scale(dpr, dpr);
  const padding = 12, usable = Math.max(1, width - padding * 2);
  const activeWidth = Math.max(0, usable * usableFraction);
  ctx.fillStyle = '#f5f4ee'; ctx.fillRect(padding, 0, usable, height);
  ctx.fillStyle = '#e9eae5';
  ctx.fillRect(padding + activeWidth, 0, usable - activeWidth, height);
  ctx.strokeStyle = '#dde1da'; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(padding, height / 2); ctx.lineTo(width - padding, height / 2); ctx.stroke();
  if (peaks?.length) {
    const bars = makeBars(peaks, rms, Math.max(20, Math.floor(activeWidth / 1.5)));
    const barStep = activeWidth / Math.max(1, bars.length);
    bars.forEach(([outer, inner], i) => {
      const x = padding + i * barStep;
      const outerAmp = Math.max(.7, outer * height * .44);
      const coreAmp = Math.max(.6, inner * height * .41);
      ctx.fillStyle = color.ghost;
      ctx.fillRect(x, height / 2 - outerAmp, Math.max(.8, barStep * .78), outerAmp * 2);
      ctx.fillStyle = color.base;
      ctx.fillRect(x, height / 2 - coreAmp, Math.max(.8, barStep * .58), coreAmp * 2);
    });
  }
  const endX = padding + activeWidth;
  ctx.strokeStyle = color.end; ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.moveTo(endX, 1); ctx.lineTo(endX, height - 1); ctx.stroke();
  ctx.fillStyle = color.end;
  ctx.fillRect(Math.max(padding, endX - 1.8), 1, 3.6, 4);
  waveCaches.set(id, { canvas, peaks, rms, width, height, dpr, usableFraction, mode: waveformMode });
  return canvas;
}
function drawWave(id, peaks, rms, color, duration) {
  const canvas = $(id), bounds = canvas.getBoundingClientRect();
  const width = Math.max(1, Math.round(bounds.width));
  const height = Math.max(1, Math.round(bounds.height));
  const dpr = Math.min(2, devicePixelRatio || 1);
  if (canvas.width !== Math.round(width * dpr) || canvas.height !== Math.round(height * dpr)) {
    canvas.width = Math.round(width * dpr); canvas.height = Math.round(height * dpr);
    waveCaches.delete(id);
  }
  const maxDuration = waveDurations().max;
  const usableFraction = maxDuration > 0 ? Math.min(1, duration / maxDuration) : 1;
  const cached = waveCaches.get(id);
  const base = cached && cached.peaks === peaks && cached.rms === rms &&
    cached.width === width && cached.height === height && cached.dpr === dpr &&
    cached.usableFraction === usableFraction && cached.mode === waveformMode
      ? cached.canvas : buildWaveCache(id, peaks, rms, color, width, height, dpr, usableFraction);
  const ctx = canvas.getContext('2d');
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(base, 0, 0);
  if (!state.preview) return;
  const fraction = currentFraction();
  const pad = 12 * dpr, usable = canvas.width - pad * 2;
  const x = pad + usable * (fraction * duration / Math.max(.001, maxDuration));
  const endX = pad + usable * usableFraction;
  ctx.fillStyle = color.active;
  ctx.globalAlpha = .07; ctx.fillRect(pad, 0, Math.max(0, x - pad), canvas.height); ctx.globalAlpha = 1;
  ctx.strokeStyle = '#47565a'; ctx.lineWidth = 1.5 * dpr;
  ctx.beginPath(); ctx.moveTo(x, 3 * dpr); ctx.lineTo(x, canvas.height - 3 * dpr); ctx.stroke();
  ctx.beginPath(); ctx.arc(x, 4 * dpr, 3 * dpr, 0, Math.PI * 2); ctx.fillStyle = '#47565a'; ctx.fill();
}
function renderWaveforms() {
  const d = waveDurations();
  drawWave('wave-a', state.preview?.originalPeaks, state.preview?.originalRms,
    { base: '#64716e', ghost: '#b4bcb7', active: '#455d59', end: '#5b716d' }, d.A);
  drawWave('wave-b', state.preview?.bPeaks, state.preview?.bRms,
    { base: '#6f7976', ghost: '#bbc4bd', active: '#3c5857', end: '#6b796f' }, d.B);
}
function updateLengthComparison() {
  const panel = $('length-comparison');
  const d = waveDurations();
  panel.hidden = !state.preview;
  if (!state.preview || !d.max) return;
  const diff = d.B - d.A;
  const percent = 100 * Math.abs(diff) / d.A;
  $('duration-difference').textContent = `B is ${Math.abs(diff).toFixed(3)}s ${diff < -.0005 ? 'shorter' : diff > .0005 ? 'longer' : 'different'} (${percent.toFixed(2)}%)`;
  $('length-delta').textContent = `Δ ${diff >= 0 ? '+' : '−'}${Math.abs(diff).toFixed(3)}s`;
  const zoomSeconds = Math.min(d.max, Math.max(3, Math.min(12, Math.abs(diff) * 11)));
  $('ending-zoom-label').textContent = `Last ${zoomSeconds.toFixed(1)}s`;
  const start = d.max - zoomSeconds;
  for (const side of ['A', 'B']) {
    const pct = Math.min(100, Math.max(0, (d[side] - start) / zoomSeconds * 100));
    $('length-bar-' + side.toLowerCase()).style.width = `${pct}%`;
    $('ending-time-' + side.toLowerCase()).textContent = prettyTime(d[side], true);
  }
  const tickBox = $('timeline-ticks');
  tickBox.replaceChildren();
  for (let i = 0; i <= 4; i++) {
    const span = document.createElement('span');
    span.textContent = prettyTime(d.max * i / 4);
    tickBox.append(span);
  }
}

function setReferenceMode(mode) {
  if (mode === state.mode) return;
  state.mode = mode;
  $('mode-rendered').classList.toggle('selected', mode === 'processed');
  $('mode-reference').classList.toggle('selected', mode === 'reference');
  $('mode-rendered').setAttribute('aria-pressed', String(mode === 'processed'));
  $('mode-reference').setAttribute('aria-pressed', String(mode === 'reference'));
  $('reference-toolbar').hidden = mode !== 'reference';
  $('reference-analysis').textContent = 'Analyzing reference...';
  schedulePreview(50);
}
async function chooseReference() {
  const t = selected(); if (!t) return showMessage('Import and select an original track first.');
  try {
    const paths = await invoke('choose_audio_files'); if (!paths.length) return;
    await invoke('inspect_audio', { source: paths[0] });
    t.reference = paths[0]; $('reference-analysis').textContent = 'Analyzing reference...'; syncSelectedFields(); schedulePreview(50);
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
  $('track-list').addEventListener('click', event => {
    if (event.target.closest('.empty-mark')) void chooseFiles();
  });
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
  document.querySelectorAll('[data-waveform-mode]').forEach(button => button.addEventListener('click', () => {
    waveformMode = button.dataset.waveformMode;
    document.querySelectorAll('[data-waveform-mode]').forEach(b => {
      b.classList.toggle('selected', b === button);
      b.setAttribute('aria-pressed', String(b === button));
    });
    waveCaches.clear(); renderWaveforms();
  }));
  $('mode-rendered').addEventListener('click', () => setReferenceMode('processed'));
  $('mode-reference').addEventListener('click', () => setReferenceMode('reference'));
  $('choose-reference').addEventListener('click', chooseReference);
  $('clear-reference').addEventListener('click', () => { const t = selected(); if (t) { t.reference = null; $('reference-analysis').textContent = 'Attach a reference to estimate its shift'; syncSelectedFields(); schedulePreview(10); } });
  $('side-a').addEventListener('click', () => void setSide('A'));
  $('side-b').addEventListener('click', () => void setSide('B'));
  $('play-pause').addEventListener('click', togglePlayback);
  $('restart').addEventListener('click', () => seek(0));
  $('volume').addEventListener('input', e => updateVolume(e.target.value));
  $('volume-toggle').addEventListener('click', () => updateVolume(Number($('volume').value) === 0 ? lastAudibleVolume : 0));
  $('monitor-pan').addEventListener('change', async e => {
    state.panCue = e.target.checked; setMonitorPan();
    if (state.panCue) {
      try {
        const ok = await ensureAudioGraph();
        if (!ok) throw new Error('Audio panning is unavailable');
      } catch (error) {
        state.panCue = false; e.target.checked = false; setMonitorPan();
        showMessage(`Pan cue unavailable: ${String(error)}`, 'error');
      }
    }
  });
  for (const side of ['a','b']) {
    const wave = $('wave-' + side);
    wave.addEventListener('click', e => {
      const bounds = wave.getBoundingClientRect();
      const relativeTime = safeFraction((e.clientX - bounds.left - 12) / Math.max(1, bounds.width - 24)) * waveDurations().max;
      const thisDuration = side === 'a' ? waveDurations().A : waveDurations().B;
      seek(safeFraction(relativeTime / Math.max(.001, thisDuration)));
    });
    wave.addEventListener('keydown', e => { if (e.key === 'ArrowLeft') { seek(currentFraction() - .01); e.preventDefault(); } if (e.key === 'ArrowRight') { seek(currentFraction() + .01); e.preventDefault(); } });
  }
  for (const p of Object.values(players)) {
    p.addEventListener('timeupdate', () => { if (p !== player()) return; state.playhead = currentFraction(); if (!isPlaying()) { refreshTransport(); renderWaveforms(); } });
    p.addEventListener('ended', () => refreshTransport());
    p.addEventListener('pause', () => refreshTransport());
    p.addEventListener('play', () => { refreshTransport(); if (p === player()) startTicks(); });
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
    if (e.key.toLowerCase() === 'a') void setSide('A');
    if (e.key.toLowerCase() === 'b') void setSide('B');
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
