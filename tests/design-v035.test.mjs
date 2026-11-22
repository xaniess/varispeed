import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const read = p => readFileSync(p, 'utf8');
test('waveform UI uses a single duration axis, details, and magnified endings', () => {
 const h = read('index.html'), a=read('src/app.js'), r=read('src-tauri/src/lib.rs');
 for (const id of ['timeline-ticks','length-comparison','length-delta','length-bar-a','length-bar-b'])
   assert.ok(h.includes(`id="${id}"`), id);
 assert.match(h,/data-waveform-mode="detail"/);
 assert.match(h,/data-waveform-mode="natural"/);
 assert.match(a,/usableFraction/);
 assert.match(a,/function updateLengthComparison/);
 assert.match(a,/bestReferenceEstimate/);
 assert.match(r,/original_rms: Vec<f32>/);
 assert.match(r,/async fn waveform_envelope/);
});
test('hero spacing and updater visual integration', () => {
 const css=read('src/v035.css'), up=read('src/updater.js');
 assert.match(css,/padding-top: 24px/);
 assert.match(css,/\.update-control \{ top: 24px; right: 26px;/);
 assert.match(up,/update-glyph/);
});
