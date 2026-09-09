import assert from 'node:assert';
import {
  clusterOcrLines,
  clusterOcrRegions,
  horizontalScalePercent,
  OCR_BOX_TO_FONT_SIZE_RATIO,
} from '../../../src/infrastructure/ocr/textLayerGeometry.ts';

console.log('Running OCR Text-Layer Geometry Tests...');

// ─── Test 1: empty / invalid input ───────────────────────────────────────────
assert.deepStrictEqual(clusterOcrLines([]), [], 'empty input -> no lines');
assert.deepStrictEqual(clusterOcrLines(null), [], 'null input -> no lines');
assert.deepStrictEqual(
  clusterOcrLines([
    { text: '   ', boundingBox: { x: 0, y: 0, width: 10, height: 10 } },
    { text: 'x', boundingBox: { x: 0, y: 0, width: 0, height: 10 } },
    { text: 'y', boundingBox: { x: 0, y: 0, width: 10, height: -3 } },
    { text: 'z', boundingBox: { x: 0, y: NaN, width: 10, height: 10 } },
  ]),
  [],
  'blank text / degenerate boxes are dropped',
);
console.log('✓ Test 1: invalid words are filtered - PASS');

// ─── Test 2: line clustering + left-to-right order + spacing ──────────────────
// "Ctrl + Shift + S and hit download. As" over two lines, with the small
// punctuation/'+' glyphs sitting a few px lower than the words (real Tesseract
// behaviour that used to jumble ordering).
const words = [
  { text: 'Ctrl', boundingBox: { x: 52, y: 280, width: 40, height: 20 } },
  { text: '+', boundingBox: { x: 103, y: 287, width: 14, height: 13 } },
  { text: 'Shift', boundingBox: { x: 127, y: 280, width: 53, height: 20 } },
  { text: '+', boundingBox: { x: 189, y: 287, width: 15, height: 13 } },
  { text: 'S', boundingBox: { x: 213, y: 281, width: 14, height: 19 } },
  { text: 'and', boundingBox: { x: 235, y: 280, width: 43, height: 20 } },
  { text: 'hit', boundingBox: { x: 287, y: 280, width: 30, height: 20 } },
  { text: 'download.', boundingBox: { x: 324, y: 280, width: 123, height: 20 } },
  { text: 'As', boundingBox: { x: 454, y: 281, width: 30, height: 19 } },
  { text: 'simple', boundingBox: { x: 52, y: 320, width: 77, height: 27 } },
  { text: 'as', boundingBox: { x: 137, y: 327, width: 24, height: 13 } },
  { text: 'that.', boundingBox: { x: 169, y: 320, width: 52, height: 20 } },
];

const lines = clusterOcrLines(words);
assert.strictEqual(lines.length, 2, `expected 2 lines, got ${lines.length}`);
assert.strictEqual(
  lines[0].words.map((w) => w.text).join(' '),
  'Ctrl + Shift + S and hit download. As',
  'line 1 ordered strictly left-to-right',
);
assert.strictEqual(
  lines[1].words.map((w) => w.text).join(' '),
  'simple as that.',
  'line 2 ordered strictly left-to-right',
);
assert.ok(lines[0].top < lines[1].top, 'lines ordered top-to-bottom');
console.log('✓ Test 2: line clustering, ordering and grouping - PASS');

// ─── Test 3: font height uses the representative (median) glyph height ────────
// The line has mostly-20px words plus two 13px '+' glyphs. Median must be 20,
// NOT the full cluster height (which the old code used and which is ~40% too big).
assert.strictEqual(lines[0].fontHeight, 20, `expected median fontHeight 20, got ${lines[0].fontHeight}`);
assert.ok(
  lines[0].fontHeight < lines[0].height + 1,
  'fontHeight never exceeds the cluster height',
);
console.log('✓ Test 3: font height is the median glyph height, not the box height - PASS');

// ─── Test 4: baseline sits near the bottom of the text, above the box floor ──
const l0 = lines[0];
assert.ok(
  l0.baselineFromTop > l0.top && l0.baselineFromTop <= l0.bottom,
  `baseline ${l0.baselineFromTop} within [${l0.top}, ${l0.bottom}]`,
);
// descenderFraction default 0.18 of fontHeight (20) => 3.6 px above median bottom (300)
assert.ok(Math.abs(l0.baselineFromTop - (300 - 3.6)) < 0.01, `baseline ~296.4, got ${l0.baselineFromTop}`);
console.log('✓ Test 4: baseline placement - PASS');

// ─── Test 5: a giant spurious box does not swallow a real line ───────────────
const withOutlier = clusterOcrLines([
  { text: 'real', boundingBox: { x: 10, y: 100, width: 40, height: 18 } },
  { text: 'line', boundingBox: { x: 55, y: 100, width: 40, height: 18 } },
  // full-height artefact spanning the whole image
  { text: '|', boundingBox: { x: 0, y: 0, width: 4, height: 2000 } },
]);
assert.strictEqual(withOutlier.length, 2, `outlier forms its own line, got ${withOutlier.length} lines`);
const realLine = withOutlier.find((l) => l.words.some((w) => w.text === 'real'));
assert.ok(realLine && realLine.words.length === 2, 'the real line keeps exactly its 2 words');
assert.ok(realLine!.height < 50, 'the real line was not stretched by the artefact');
console.log('✓ Test 5: tall artefact boxes do not corrupt neighbouring lines - PASS');

// ─── Test 6: horizontalScalePercent ─────────────────────────────────────────
assert.strictEqual(horizontalScalePercent(50, 100), 50, 'half width -> 50%');
assert.strictEqual(horizontalScalePercent(200, 100), 200, 'double width -> 200%');
assert.strictEqual(horizontalScalePercent(100, 0), 100, 'zero natural width -> 100% (no-op)');
assert.strictEqual(horizontalScalePercent(0, 100), 100, 'zero target width -> 100% (no-op)');
assert.strictEqual(horizontalScalePercent(1, 100000), 10, 'clamped to a 10% floor');
assert.strictEqual(horizontalScalePercent(100000, 1), 1000, 'clamped to a 1000% ceiling');
console.log('✓ Test 6: horizontal scale factor math - PASS');

// ─── Test 7: layout segmentation — columns become separate regions ───────────
// Build a two-column page: left col x∈[20,340], right col x∈[420,740], gutter
// ~80px, lines interleaved in Y. Add a full-width header and footer band.
const twoCol: { text: string; boundingBox: { x: number; y: number; width: number; height: number } }[] = [];
// header band (full width)
twoCol.push({ text: 'HEADER', boundingBox: { x: 20, y: 10, width: 700, height: 20 } });
for (let row = 0; row < 10; row++) {
  const y = 70 + row * 24;
  for (let c = 0; c < 5; c++) {
    twoCol.push({ text: `L${row}c${c}`, boundingBox: { x: 20 + c * 64, y, width: 52, height: 16 } });
  }
  for (let c = 0; c < 4; c++) {
    twoCol.push({ text: `R${row}c${c}`, boundingBox: { x: 420 + c * 76, y: y + 4, width: 60, height: 16 } });
  }
}
// footer band (full width, well below the columns)
twoCol.push({ text: 'FOOTER', boundingBox: { x: 20, y: 400, width: 700, height: 20 } });

const regions = clusterOcrRegions(twoCol);
assert.ok(regions.length >= 3, `header + 2 columns + footer -> >=3 regions, got ${regions.length}`);

const regionText = (r: (typeof regions)[number]) =>
  r.lines.flatMap((l) => l.words.map((w) => w.text)).join(' ');

const leftRegion = regions.find((r) => regionText(r).includes('L0c0'));
const rightRegion = regions.find((r) => regionText(r).includes('R0c0'));
assert.ok(leftRegion && !regionText(leftRegion).includes('R'), 'left region has no right-column words');
assert.ok(rightRegion && !regionText(rightRegion).includes('L'), 'right region has no left-column words');

// header before both columns; footer after both, in reading order.
const idx = (needle: string) => regions.findIndex((r) => regionText(r).includes(needle));
assert.ok(idx('HEADER') < idx('L0c0') && idx('HEADER') < idx('R0c0'), 'header region comes first');
assert.ok(idx('FOOTER') > idx('L0c0') && idx('FOOTER') > idx('R0c0'), 'footer region comes last');
assert.ok(idx('L0c0') < idx('R0c0'), 'left column precedes right column');
console.log('✓ Test 7: XY-cut segments columns / header / footer into ordered regions - PASS');

// ─── Test 8: a single column is NOT spuriously split ─────────────────────────
const oneCol: { text: string; boundingBox: { x: number; y: number; width: number; height: number } }[] = [];
for (let row = 0; row < 12; row++) {
  const y = 40 + row * 22;
  // ragged right edge (varying word count) — must not create a vertical cut
  const n = 4 + (row % 3);
  for (let c = 0; c < n; c++) {
    oneCol.push({ text: `w${row}_${c}`, boundingBox: { x: 30 + c * 70, y, width: 58, height: 15 } });
  }
}
const oneColRegions = clusterOcrRegions(oneCol);
assert.strictEqual(oneColRegions.length, 1, `single ragged column stays one region, got ${oneColRegions.length}`);
assert.strictEqual(
  oneColRegions[0].lines.length,
  12,
  `single column keeps its 12 lines, got ${oneColRegions[0].lines.length}`,
);
console.log('✓ Test 8: a single ragged column is not spuriously split - PASS');

// ─── Test 9: clusterOcrLines still returns a flat, reading-ordered line list ─
const flat = clusterOcrLines(twoCol);
assert.ok(flat.length > 0 && Array.isArray(flat[0].words), 'clusterOcrLines returns GeomLine[]');
const flatText = flat.flatMap((l) => l.words.map((w) => w.text));
assert.ok(
  flatText.indexOf('L0c0') < flatText.indexOf('R0c0'),
  'flattened stream keeps columns contiguous (left before right)',
);
console.log('✓ Test 9: clusterOcrLines flat compatibility - PASS');

// ─── Test 10: confidence filtering removes OCR noise over images / icons ─────
// A real sentence plus: a rock-bottom-confidence garble, a mid-confidence
// oversized mark to the left of the text (engraving noise), and a
// mid-confidence tiny speck.
const noisy = [
  { text: 'Real', confidence: 96, boundingBox: { x: 200, y: 100, width: 40, height: 16 } },
  { text: 'sentence', confidence: 95, boundingBox: { x: 246, y: 100, width: 78, height: 16 } },
  { text: 'here', confidence: 94, boundingBox: { x: 330, y: 100, width: 40, height: 16 } },
  { text: 'gArBlE', confidence: 3, boundingBox: { x: 260, y: 100, width: 30, height: 16 } },
  { text: '[', confidence: 41, boundingBox: { x: 90, y: 96, width: 8, height: 34 } }, // tall + left of text + low conf
  { text: '.', confidence: 55, boundingBox: { x: 150, y: 112, width: 3, height: 3 } }, // tiny speck
];
const clean = clusterOcrLines(noisy);
const cleanText = clean.flatMap((l) => l.words.map((w) => w.text));
assert.deepStrictEqual(cleanText, ['Real', 'sentence', 'here'], `noise removed, got ${JSON.stringify(cleanText)}`);
console.log('✓ Test 10: low-confidence / outlier noise words are dropped - PASS');

// ─── Test 11: words with no confidence value are always kept ─────────────────
const noConf = clusterOcrLines([
  { text: 'no', boundingBox: { x: 10, y: 10, width: 20, height: 14 } },
  { text: 'confidence', boundingBox: { x: 34, y: 10, width: 90, height: 14 } },
  { text: 'field', boundingBox: { x: 128, y: 10, width: 40, height: 14 } },
]);
assert.strictEqual(noConf.flatMap((l) => l.words).length, 3, 'undefined confidence -> kept');
console.log('✓ Test 11: absent confidence is treated as trusted - PASS');

// ─── Test 12: font height maps to a plausible font size, clamped for merges ──
assert.ok(OCR_BOX_TO_FONT_SIZE_RATIO > 0.5 && OCR_BOX_TO_FONT_SIZE_RATIO < 1, 'box:fontsize ratio in (0.5, 1)');
// A body of 15px-box lines plus one line whose box got merged to 60px.
const mixed: { text: string; boundingBox: { x: number; y: number; width: number; height: number } }[] = [];
for (let r = 0; r < 6; r++) {
  for (let c = 0; c < 4; c++) {
    mixed.push({ text: `w${r}${c}`, boundingBox: { x: 20 + c * 60, y: 40 + r * 24, width: 48, height: 15 } });
  }
}
mixed.push({ text: 'MERGED', boundingBox: { x: 20, y: 220, width: 70, height: 60 } });
const mixedLines = clusterOcrLines(mixed);
const merged = mixedLines.find((l) => l.words.some((w) => w.text === 'MERGED'))!;
assert.ok(merged.fontHeight <= 15 * 2.2 + 0.01, `merged line fontHeight clamped, got ${merged.fontHeight}`);
console.log('✓ Test 12: font-size ratio + per-line height clamp - PASS');

console.log('\nAll OCR Text-Layer Geometry tests passed successfully!');
