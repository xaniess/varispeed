import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const js = readFileSync(new URL('../src/app.js', import.meta.url), 'utf8');
const css = readFileSync(new URL('../src/polish.css', import.meta.url), 'utf8');

test('the listening interface has a clearly labeled pan cue and A/B controls', () => {
  assert.match(html, /id="monitor-pan"/);
  assert.match(html, /A ◂  ▸ B/);
  assert.match(html, /id="side-a"/);
  assert.match(html, /id="side-b"/);
  assert.match(js, /createStereoPanner/);
  assert.match(js, /linearRampToValueAtTime/);
  assert.match(js, /state\.panCue \? -1 : 0/);
  assert.match(js, /state\.panCue \? 1 : 0/);
});

test('waveforms cache geometry and use animation frames', () => {
  assert.match(js, /waveCaches = new Map/);
  assert.match(js, /requestAnimationFrame\(tick\)/);
  assert.match(js, /cached\.peaks === peaks/);
  assert.match(js, /ResizeObserver/);
});

test('revised listening interface removes redundant version tags and em dashes', () => {
  assert.doesNotMatch(html, /003\.1|№ 003\.1|—/);
  assert.doesNotMatch(js, /—/);
  assert.match(html, /polish\.css/);
  assert.match(css, /prefers-reduced-motion/);
});
