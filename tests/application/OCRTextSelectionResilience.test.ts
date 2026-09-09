import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { clusterOcrLines, clusterOcrRegions } from '../../src/infrastructure/ocr/textLayerGeometry.ts';

console.log('Running OCR Text Selection & Line Clustering Resilience Tests...');

// ─── Test 1: OCRTextOverlay delegates geometry to the shared module ──────────
// Both the PDF text layer and the preview overlay must consume the SAME
// geometry so their alignment can never drift apart.
const overlayPath = path.resolve('src/features/capture/components/OCRTextOverlay.tsx');
const overlayCode = fs.readFileSync(overlayPath, 'utf8');

assert(
  overlayCode.includes("from '../../../infrastructure/ocr/textLayerGeometry.ts'"),
  'OCRTextOverlay must import the shared textLayerGeometry module',
);
assert(
  overlayCode.includes('clusterOcrRegions(') && overlayCode.includes('wsn-ocr-region'),
  'OCRTextOverlay must render one container per layout region',
);
assert(
  overlayCode.includes('horizontalScalePercent(') && overlayCode.includes('scaleX('),
  'OCRTextOverlay must horizontally fit each word to its OCR box (transform: scaleX)',
);

const pdfPath = path.resolve('src/infrastructure/pdf/PdfLibPDFService.ts');
const pdfCode = fs.readFileSync(pdfPath, 'utf8');
assert(
  pdfCode.includes("from '../ocr/textLayerGeometry.ts'") &&
    (pdfCode.includes('clusterOcrLines(') || pdfCode.includes('clusterOcrRegions(')),
  'PdfLibPDFService must consume the same shared geometry module',
);
assert(
  pdfCode.includes('SetTextHorizontalScaling') && pdfCode.includes('SetTextRenderingMode'),
  'PdfLibPDFService must emit invisible (Tr 3) horizontally-scaled (Tz) text',
);
console.log('✓ Test 1: PDF + preview share one geometry implementation - PASS');

// ─── Test 2: line clustering on a real sentence with varying glyph heights ───
// "Ctrl + Shift + S and hit download. As" / "simple as that." — the small '+'
// and punctuation glyphs sit lower and used to jumble word ordering.
const testWords = [
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

const lines = clusterOcrLines(testWords);
assert.strictEqual(lines.length, 2, 'Should cluster into exactly 2 lines');
assert.strictEqual(
  lines[0].words.map((w) => w.text).join(' '),
  'Ctrl + Shift + S and hit download. As',
  'Line 1 words must be in strict left-to-right order without jumbling',
);
assert.strictEqual(
  lines[1].words.map((w) => w.text).join(' '),
  'simple as that.',
  'Line 2 words must be in strict left-to-right order without jumbling',
);
console.log('✓ Test 2: Sentence ordering with varying font heights and punctuation verified - PASS');

// ─── Test 2b: two-column layout — selecting one column must not pull in the other ───
// Left column: a paragraph at x∈[40,360]. Right column: a list at x∈[440,760].
// Their lines share Y ranges (interleaved), which used to merge into single
// zig-zag lines and made column-only selection impossible.
const twoCol: { text: string; boundingBox: { x: number; y: number; width: number; height: number } }[] = [];
for (let row = 0; row < 8; row++) {
  const y = 100 + row * 26;
  // left column: 5 words per line
  for (let c = 0; c < 5; c++) {
    twoCol.push({ text: `L${row}_${c}`, boundingBox: { x: 40 + c * 64, y, width: 52, height: 18 } });
  }
  // right column: 4 words per line, vertically offset by a few px
  for (let c = 0; c < 4; c++) {
    twoCol.push({ text: `R${row}_${c}`, boundingBox: { x: 440 + c * 76, y: y + 5, width: 60, height: 18 } });
  }
}

const regions = clusterOcrRegions(twoCol);
assert(regions.length >= 2, `two-column input must produce >=2 regions, got ${regions.length}`);

const leftRegion = regions.find((r) => r.lines.every((l) => l.words.every((w) => w.text.startsWith('L'))));
const rightRegion = regions.find((r) => r.lines.every((l) => l.words.every((w) => w.text.startsWith('R'))));
assert(leftRegion, 'a region containing only left-column words must exist');
assert(rightRegion, 'a region containing only right-column words must exist');

// Reading order: the entire left region comes before the entire right region
// in the flattened stream, so a start→end selection of the left column is a
// single contiguous run with zero right-column words in between.
const flatWords = clusterOcrLines(twoCol).flatMap((l) => l.words.map((w) => w.text));
const firstR = flatWords.findIndex((t) => t.startsWith('R'));
const lastL = flatWords.map((t) => t.startsWith('L')).lastIndexOf(true);
assert(
  firstR > lastL,
  `all left-column words must precede all right-column words in reading order (lastL=${lastL}, firstR=${firstR})`,
);
console.log('✓ Test 2b: two-column layout isolates column selection - PASS');

// ─── Test 3: Verify service-worker SAVE_PAGE_ANNOTATIONS executes OCR on effectiveRenderedImageId ───
const swPath = path.resolve('src/service-worker/index.ts');
const swCode = fs.readFileSync(swPath, 'utf8');

assert(swCode.includes('runOCR.execute({ page, image: imageAsset })'), 'service worker must run OCR on the newly rendered ImageAsset');
assert(!swCode.includes('extractExcalidrawWords'), 'service worker must not use extractExcalidrawWords bypass');
console.log('✓ Test 3: Service Worker composited rendered image OCR execution verified - PASS');

// ─── Test 4: Verify LightboxPreview validates OCR freshness against activeRenderedImageId ───
const lightboxPath = path.resolve('src/features/capture/components/LightboxPreview.tsx');
const lightboxCode = fs.readFileSync(lightboxPath, 'utf8');

assert(lightboxCode.includes('activeRenderedImageId'), 'LightboxPreview must validate OCR against active rendered image ID');
console.log('✓ Test 4: LightboxPreview OCR freshness validation verified - PASS');

console.log('All OCR Text Selection & Line Clustering resilience tests PASSED successfully!');
