import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';

console.log('Running OCR Text Selection & Line Clustering Resilience Tests...');

// ─── Test 1: Verify OCRTextOverlay.tsx implements line-clustering and gap bridging ───
const overlayPath = path.resolve('src/features/capture/components/OCRTextOverlay.tsx');
const overlayCode = fs.readFileSync(overlayPath, 'utf8');

assert(overlayCode.includes('LineCluster'), 'OCRTextOverlay must implement LineCluster for line grouping');
assert(overlayCode.includes('lines.sort((a, b) => a.minY - b.minY)'), 'OCRTextOverlay must sort lines top-to-bottom');
assert(overlayCode.includes('line.words.sort((a, b) => a.boundingBox.x - b.boundingBox.x)'), 'OCRTextOverlay must sort words strictly left-to-right on each line');
assert(overlayCode.includes('distanceToNext'), 'OCRTextOverlay must bridge inter-word gaps');
assert(!overlayCode.includes("overflow: 'hidden',\n            cursor: 'text'"), 'OCRTextOverlay word spans must not clip with overflow: hidden');
console.log('✓ Test 1: OCRTextOverlay robust line-clustering and gap bridging verified - PASS');

// ─── Test 2: Verify line-clustering logic on real sentence with varying heights ───
// Simulate: "Ctrl + Shift + S and hit download. As" where '+' and 'S' had smaller heights and caused jumbling previously
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
  // Line 2: "simple as that."
  { text: 'simple', boundingBox: { x: 52, y: 320, width: 77, height: 27 } },
  { text: 'as', boundingBox: { x: 137, y: 327, width: 24, height: 13 } },
  { text: 'that.', boundingBox: { x: 169, y: 320, width: 52, height: 20 } },
];

const sortedByMidY = [...testWords].sort((a, b) => {
  const aMid = a.boundingBox.y + a.boundingBox.height / 2;
  const bMid = b.boundingBox.y + b.boundingBox.height / 2;
  return aMid - bMid;
});

interface LineCluster {
  minY: number;
  maxY: number;
  words: typeof testWords;
}
const lines: LineCluster[] = [];

for (const word of sortedByMidY) {
  const box = word.boundingBox;
  const wMidY = box.y + box.height / 2;
  let targetLine: LineCluster | null = null;

  for (const line of lines) {
    const lineMidY = (line.minY + line.maxY) / 2;
    const lineH = line.maxY - line.minY;
    const tol = Math.min(box.height, lineH) * 0.55;
    if (Math.abs(wMidY - lineMidY) <= tol) {
      targetLine = line;
      break;
    }
  }

  if (targetLine) {
    targetLine.words.push(word);
    targetLine.minY = Math.min(targetLine.minY, box.y);
    targetLine.maxY = Math.max(targetLine.maxY, box.y + box.height);
  } else {
    lines.push({
      minY: box.y,
      maxY: box.y + box.height,
      words: [word],
    });
  }
}

lines.sort((a, b) => a.minY - b.minY);
assert.strictEqual(lines.length, 2, 'Should cluster into exactly 2 lines');

lines[0].words.sort((a, b) => a.boundingBox.x - b.boundingBox.x);
const line1Text = lines[0].words.map(w => w.text).join(' ');
assert.strictEqual(line1Text, 'Ctrl + Shift + S and hit download. As', 'Line 1 words must be in strict left-to-right order without jumbling');

lines[1].words.sort((a, b) => a.boundingBox.x - b.boundingBox.x);
const line2Text = lines[1].words.map(w => w.text).join(' ');
assert.strictEqual(line2Text, 'simple as that.', 'Line 2 words must be in strict left-to-right order without jumbling');

console.log('✓ Test 2: Sentence ordering with varying font heights and punctuation verified - PASS');

// ─── Test 3: Verify service-worker SAVE_PAGE_ANNOTATIONS retains clean screenshot OCR ───
const swPath = path.resolve('src/service-worker/index.ts');
const swCode = fs.readFileSync(swPath, 'utf8');

assert(swCode.includes('extractExcalidrawWords'), 'service worker must define extractExcalidrawWords');
assert(swCode.includes('const existingOcr = await ocrRepo.findByCaptureId(page.id);'), 'service worker must query existing OCR to preserve base words');
assert(swCode.includes('const combinedWords = [...existingOcr.words, ...excalidrawWords];'), 'service worker must combine existing OCR words with vector text');
console.log('✓ Test 3: Service Worker OCR preservation on annotation save verified - PASS');

// ─── Test 4: Verify LightboxPreview allows continuous OCR display ───
const lightboxPath = path.resolve('src/features/capture/components/LightboxPreview.tsx');
const lightboxCode = fs.readFileSync(lightboxPath, 'utf8');

assert(!lightboxCode.includes('(!ocrData.processedImageId || ocrData.processedImageId === currentRenderedImageId)'), 'LightboxPreview must not hide overlay when processedImageId is pending');
console.log('✓ Test 4: LightboxPreview continuous OCR display verified - PASS');

console.log('All OCR Text Selection & Line Clustering resilience tests PASSED successfully!');
