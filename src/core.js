export const SUPPORTED = ['.wav', '.mp3', '.flac', '.m4a', '.aac', '.ogg', '.opus', '.aif', '.aiff', '.wma'];
export const FORMATS = {
  flac: 'FLAC · lossless',
  wav: 'WAV · 24-bit',
  mp3: 'MP3 · 320 kbps',
  m4a: 'M4A · AAC 256 kbps'
};
export function ratio(cents) {
  const x = Number(cents);
  if (!Number.isFinite(x) || x < -1200 || x > 1200) throw new Error('Pitch must be between -1200 and +1200 cents.');
  return Math.pow(2, x / 1200);
}
export function durationAtPitch(originalSeconds, cents) {
  return Number(originalSeconds) / ratio(cents);
}
export function centsText(cents, suffix = '¢') {
  const n = Number(cents);
  return `${n > 0 ? '+' : ''}${Number(n.toFixed(2))}${suffix}`;
}
export function prettyTime(seconds, milliseconds = true) {
  if (!Number.isFinite(Number(seconds))) return '—';
  const s = Math.max(0, Number(seconds));
  const mm = Math.floor(s / 60);
  const ss = Math.floor(s % 60);
  const frac = milliseconds ? '.' + String(Math.floor((s % 1) * 1000 + 1e-7)).padStart(3, '0') : '';
  return `${mm}:${String(ss).padStart(2, '0')}${frac}`;
}
export function deltaText(seconds) {
  if (!Number.isFinite(seconds)) return '—';
  return `${seconds > 0 ? '+' : seconds < 0 ? '−' : ''}${Math.abs(seconds).toFixed(3)}s`;
}
export function safeStem(name) {
  let n = String(name ?? '').replace(/[<>:"/\\|?*\x00-\x1f]/g, '_').trim().replace(/[. ]+$/g, '');
  if (!n) n = 'Untitled';
  if (/^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])(?:\.|$)/i.test(n)) n = '_' + n;
  return n.slice(0, 175).replace(/[. ]+$/g, '');
}
export function fileStem(path) {
  const name = String(path || '').split(/[\\/]/).pop();
  return name.replace(/\.[^.]+$/, '');
}
export function renderName(template, track, cents) {
  const tags = track.tags || {};
  const vals = {
    stem: fileStem(track.path || track.name),
    cents: centsText(cents, 'c'),
    title: tags.title || fileStem(track.path || track.name),
    artist: tags.artist || 'Unknown Artist',
    album: tags.album || 'Unknown Album',
    track: tags.track || tags.tracknumber || ''
  };
  const out = String(template).replace(/\{([^{}]+)\}/g, (match, key) => {
    if (!(key in vals)) throw new Error(`Unrecognized filename token: ${match}`);
    return vals[key];
  });
  if (/[{}]/.test(out)) throw new Error('Check the filename template braces.');
  return safeStem(out);
}
export function safeFraction(value) { return Math.max(0, Math.min(1, Number(value) || 0)); }
export function equivalentCentsFromDurations(a, b) {
  if (!(a > 0 && b > 0)) return NaN;
  return 1200 * Math.log2(a / b);
}
