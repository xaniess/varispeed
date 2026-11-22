import test from 'node:test';
import assert from 'node:assert/strict';
import { estimateReferenceCents, formatReferenceEstimate, bestReferenceEstimate, estimateFromDurations } from '../src/reference-analysis.js';

// Deterministic irregular transients approximate the changing energy contour
// of a song without storing or redistributing third-party recordings.
function sourceEnvelope(seconds = 92) {
  const data = [];
  for (let i = 0; i < seconds * 100; i++) {
    const t = i / 100;
    const pulse = Math.exp(-Math.pow(((t * 1.736) % 1 - .5) * 10, 2));
    const oddPulse = Math.exp(-Math.pow(((t * .831) % 1 - .3) * 15, 2));
    data.push(2.5 + .9 * pulse + .4 * oddPulse + .6 * Math.sin(t * .74) + .3 * Math.sin(t * 2.37));
  }
  return data;
}
function sample(data, i) {
  const k = Math.floor(i);
  return k < 0 || k + 1 >= data.length ? 0 : data[k] + (i - k) * (data[k+1]-data[k]);
}
function resampleEnvelope(data, cents, padding = 0) {
  const rate = Math.pow(2, cents / 1200);
  const len = Math.ceil(data.length / rate) + padding;
  return Array.from({ length: len }, (_, i) => sample(data, i * rate));
}

test('recovers FL-like positive and negative shifts independently of export tails', () => {
  const a = sourceEnvelope();
  for (const cents of [10, -13, 0]) {
    const b = resampleEnvelope(a, cents, 55);
    const measured = estimateReferenceCents(a, b);
    assert.ok(measured, `Expected matching content at ${cents} cents`);
    assert.ok(Math.abs(measured.cents - cents) <= .2, `Wanted ${cents}, got ${measured.cents}`);
    assert.ok(measured.correlation > .92);
    assert.match(formatReferenceEstimate(measured), /Estimated/);
  }
});

test('rejects silent, unrelated, and too-short audio', () => {
  const src = sourceEnvelope();
  const silence = Array(src.length).fill(0);
  const mismatch = Array.from({length:src.length}, (_, i) => Math.sin(i * .176) + Math.cos(i * .099));
  assert.equal(estimateReferenceCents(src, silence), null);
  assert.equal(estimateReferenceCents(src, mismatch), null);
  assert.equal(estimateReferenceCents([1,2,3], [1,2,3]), null);
  assert.match(formatReferenceEstimate(null), /Unable/);
});


test('duration fallback recovers approximate +10 cents for geeked_mix', () => {
  const estimate = bestReferenceEstimate([], [], 84.322, 83.846);
  assert.equal(estimate.method, 'duration');
  assert.ok(Math.abs(estimate.cents - 9.80) < .03);
  assert.match(formatReferenceEstimate(estimate), /Approx/);
  assert.match(formatReferenceEstimate(estimate), /padding/);
});

test('matched audio alignment remains the preferred method', () => {
  const a = sourceEnvelope();
  const b = resampleEnvelope(a, -13, 90);
  const estimate = bestReferenceEstimate(a, b, 92, 93);
  assert.equal(estimate.method, 'alignment');
  assert.ok(Math.abs(estimate.cents + 13) < .3);
});

test('duration estimator rejects unhelpful durations safely', () => {
  for (const x of [NaN, 0, -2, Infinity]) assert.equal(estimateFromDurations(x, 80), null);
});
