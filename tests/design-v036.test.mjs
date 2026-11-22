import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const read = path => readFileSync(path, 'utf8');
test('interactive empty state shares the native Add Tracks file picker', () => {
  const html = read('index.html'), app = read('src/app.js');
  assert.match(html, /<button class="empty-mark" type="button" aria-label="Add audio files"/);
  assert.match(app, /empty.innerHTML = '<button class="empty-mark"/);
  assert.match(app, /getElementById|const \$ =/);
  assert.match(app, /\$\('track-list'\)\.addEventListener\('click', event =>/);
  assert.match(app, /event\.target\.closest\('\.empty-mark'\)/);
  assert.match(app, /void chooseFiles\(\)/);
});
test('playback and volume control icons are SVG and reflect their actual state', () => {
  const html = read('index.html'), app = read('src/app.js'), css = read('src/v036.css');
  for (const x of ['play-pause','play-icon','play-label','restart','volume-toggle','volume']) assert.match(html, new RegExp(`id="${x}"`));
  assert.match(html, /class="control-glyph icon-play"/);
  assert.match(html, /class="control-glyph icon-pause"/);
  assert.match(html, /class="speaker-wave wave-high"/);
  assert.match(html, /class="speaker-mute"/);
  assert.doesNotMatch(html, /◖\)\)|>▶<|>↶</);
  assert.match(app, /function updatePlayButton\(playing\)/);
  assert.match(app, /button\.dataset\.playing = String\(playing\)/);
  assert.match(app, /function updateVolume\(value\)/);
  assert.match(app, /lastAudibleVolume/);
  assert.match(app, /\$\('volume-toggle'\)\.addEventListener\('click'/);
  assert.match(css, /data-level="muted"/);
  assert.match(css, /data-playing="true"/);
});
test('no horizontal rubber band and no section numbers', () => {
  const html = read('index.html'), css = read('src/v036.css');
  assert.doesNotMatch(html, /0[123]\s*<span class="slash">/);
  for (const heading of ['COLLECTION','LISTENING ROOM','OUTPUT']) assert.match(html, new RegExp(`<span>${heading}</span>`));
  assert.match(css, /overscroll-behavior-x:\s*none/);
  assert.match(css, /overflow-x:\s*clip/);
});

test('Rust waveform analysis compiles numeric weights with leading zeros', () => {
  const rust = read('src-tauri/src/lib.rs');
  assert.match(rust, /smoothed\[i\] = frames\[i - 1\] \* 0\.2 \+ frames\[i\] \* 0\.6 \+ frames\[i \+ 1\] \* 0\.2;/);
  assert.doesNotMatch(rust, /\*\s+\.[0-9]/);
});
