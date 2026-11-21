import test from 'node:test';
import assert from 'node:assert/strict';
import { ratio, durationAtPitch, centsText, prettyTime, deltaText, safeStem, renderName, equivalentCentsFromDurations, safeFraction } from '../src/core.js';

test('FL Studio golden value: -13 cents', () => {
  assert.ok(Math.abs(ratio(-13) - 0.992519) < 0.000001);
  assert.ok(Math.abs(durationAtPitch(81.6, -13) - 82.215) < 0.003);
});
test('FL Studio golden value: +10 cents measured with KYS', () => {
  assert.ok(Math.abs(ratio(10) - 1.0057929411) < 0.00000001);
  assert.ok(Math.abs(durationAtPitch(130, 10) - 129.251) < 0.005);
});
test('duration ratio to cents (only valid for matched material with no export padding)', () => {
  assert.ok(Math.abs(equivalentCentsFromDurations(100, 100 / ratio(10)) - 10) < 1e-9);
  assert.ok(Math.abs(equivalentCentsFromDurations(100, 100 / ratio(-13)) + 13) < 1e-9);
});
test('use exact display values and duration differences', () => {
  assert.equal(centsText(-13), '-13¢');
  assert.equal(centsText(10), '+10¢');
  assert.equal(prettyTime(130.096145), '2:10.096');
  assert.equal(deltaText(-0.725079), '−0.725s');
  assert.equal(safeFraction(1.5), 1);
});
test('batch naming preserves templates and edits safely', () => {
  const track = { path: 'C:\\Songs\\wipe ur tears.wav', tags: {artist: 'Band', title: 'Wipe Ur Tears'} };
  assert.equal(renderName('{stem} [{cents}]', track, -13), 'wipe ur tears [-13c]');
  assert.equal(renderName('{artist} - {title} ({cents})', track, 10), 'Band - Wipe Ur Tears (+10c)');
  assert.equal(safeStem('CON'), '_CON');
  assert.equal(safeStem('nice:name?'), 'nice_name_');
  assert.throws(() => renderName('{unknown}', track, 0));
});
test('invalid pitch is rejected', () => {
  for (const p of [Infinity, NaN, -1201, 1201]) assert.throws(() => ratio(p));
});
