import assert from 'node:assert';
import {
  computeUpscaleFactor,
  scaleWordsBack,
  shouldInvertForOcr,
} from '../../../src/infrastructure/ocr/ocrPreprocess.ts';

console.log('Running OCR Preprocess helper Tests...');

// ─── computeUpscaleFactor ────────────────────────────────────────────────────
assert.strictEqual(computeUpscaleFactor(1920, 1080), 1, 'large screenshot -> no upscale');
assert.strictEqual(computeUpscaleFactor(3840, 2160), 1, 'retina screenshot -> no upscale');
assert.strictEqual(computeUpscaleFactor(1000, 4000), 1, 'min dim exactly 1000 -> no upscale');
assert.strictEqual(computeUpscaleFactor(900, 4000), 2, 'small min dim -> 2x');
assert.strictEqual(computeUpscaleFactor(400, 300), 2, 'small crop -> 2x');
assert.strictEqual(computeUpscaleFactor(0, 0), 1, 'invalid dims -> 1');
console.log('✓ computeUpscaleFactor - PASS');

// ─── scaleWordsBack ──────────────────────────────────────────────────────────
const words = [
  { text: 'a', confidence: 90, bbox: { x0: 20, y0: 40, x1: 60, y1: 80 } },
  { text: 'b', confidence: 80, bbox: { x0: 100, y0: 40, x1: 140, y1: 80 } },
];
const back = scaleWordsBack(words, 2);
assert.deepStrictEqual(back[0].bbox, { x0: 10, y0: 20, x1: 30, y1: 40 }, 'box divided by factor');
assert.strictEqual(back[0].text, 'a', 'text preserved');
assert.strictEqual(back[0].confidence, 90, 'confidence preserved');
assert.strictEqual(scaleWordsBack(words, 1), words, 'factor 1 -> identical reference (no-op)');
assert.notStrictEqual(back, words, 'factor > 1 -> new array');
console.log('✓ scaleWordsBack - PASS');

// round-trip: original box -> upscale -> tesseract -> scale back == original
const factor = computeUpscaleFactor(800, 600); // -> 2
const original = { text: 'w', confidence: 99, bbox: { x0: 11, y0: 22, x1: 55, y1: 66 } };
const upscaled = { ...original, bbox: {
  x0: original.bbox.x0 * factor, y0: original.bbox.y0 * factor,
  x1: original.bbox.x1 * factor, y1: original.bbox.y1 * factor,
} };
assert.deepStrictEqual(scaleWordsBack([upscaled], factor)[0].bbox, original.bbox, 'round-trips exactly');
console.log('✓ upscale round-trip preserves coordinates - PASS');

// ─── shouldInvertForOcr ──────────────────────────────────────────────────────
assert.strictEqual(shouldInvertForOcr(30), true, 'dark page -> invert');
assert.strictEqual(shouldInvertForOcr(200), false, 'light page -> no invert');
assert.strictEqual(shouldInvertForOcr(115), false, 'exactly at threshold -> no invert');
assert.strictEqual(shouldInvertForOcr(NaN), false, 'NaN -> no invert');
console.log('✓ shouldInvertForOcr - PASS');

console.log('\nAll OCR Preprocess helper tests passed successfully!');
