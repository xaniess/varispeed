// Estimate coupled pitch and speed from matching amplitude envelopes.
// A match is a timing measurement, not proof of independent spectral pitch.
// Each array contains 100 log-RMS measurements per second from FFmpeg.
export function timingCorrelation(a, b, cents, offsetSeconds, step = 9) {
  if (!a?.length || !b?.length) return -1;
  const speed = Math.pow(2, cents / 1200);
  const start = Math.max(200, Math.floor(a.length * .06));
  const end = Math.min(a.length - 200, Math.floor(a.length * .88));
  const expectedSamples = Math.ceil((end - start) / step);
  if (expectedSamples < 70) return -1;
  let sumA = 0, sumB = 0, sumAA = 0, sumBB = 0, sumAB = 0, n = 0;
  for (let i = start; i < end; i += step) {
    const j = i / speed + offsetSeconds * 100;
    if (j < 5 || j + 1 >= b.length - 5) continue;
    const k = Math.floor(j);
    const x = a[i], y = b[k] + (j - k) * (b[k + 1] - b[k]);
    sumA += x; sumB += y; sumAA += x * x; sumBB += y * y;
    sumAB += x * y; n++;
  }
  if (n < expectedSamples * .82) return -1;
  const varA = n * sumAA - sumA * sumA;
  const varB = n * sumBB - sumB * sumB;
  if (varA < 1e-5 || varB < 1e-5) return -1;
  return (n * sumAB - sumA * sumB) / Math.sqrt(varA * varB);
}

export function estimateReferenceCents(a, b) {
  if (!Array.isArray(a) || !Array.isArray(b) || Math.min(a.length, b.length) < 600) return null;
  let best = { score: -1, cents: 0, offset: 0 };
  for (let cents = -80; cents <= 80; cents += 1.5) {
    for (let offset = -1; offset <= 1.001; offset += .10) {
      const score = timingCorrelation(a, b, cents, offset, 18);
      if (score > best.score) best = { score, cents, offset };
    }
  }
  if (best.score < .45) return null;
  let refined = { ...best };
  for (let cents = best.cents - 2; cents <= best.cents + 2.001; cents += .1) {
    for (let offset = best.offset - .13; offset <= best.offset + .131; offset += .01) {
      const score = timingCorrelation(a, b, cents, offset, 7);
      if (score > refined.score) refined = { score, cents, offset };
    }
  }
  if (refined.score < .78) return null;
  return {
    cents: Math.abs(refined.cents) < .05 ? 0 : Math.round(refined.cents * 10) / 10,
    speed: Math.pow(2, refined.cents / 1200),
    correlation: refined.score,
    confidence: refined.score >= .92 ? 'strong' : 'moderate',
    timingOffsetSeconds: Math.round(refined.offset * 1000) / 1000,
  };
}

export function formatReferenceEstimate(estimate) {
  if (!estimate) return 'Pitch estimate unavailable: audio does not align confidently';
  const shift = `${estimate.cents > 0 ? '+' : ''}${estimate.cents.toFixed(1)}¢`;
  return `Estimated ${shift}  |  ${estimate.speed.toFixed(5)}×  |  ${estimate.confidence} timing match`;
}
