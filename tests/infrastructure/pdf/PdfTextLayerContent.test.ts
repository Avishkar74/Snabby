import assert from 'node:assert';
import zlib from 'node:zlib';
import fs from 'node:fs';
import path from 'node:path';
import { PdfLibPDFService } from '../../../src/infrastructure/pdf/PdfLibPDFService.ts';
import { OCRStatus } from '../../../src/domain/ocr/ocr.types.ts';
import type { ImageAsset } from '../../../src/domain/image/image.types.ts';
import type { OCRResult } from '../../../src/domain/ocr/OCRResult.ts';
import type { Session } from '../../../src/domain/session/Session.ts';
import type {
  SessionId,
  CaptureId,
  ImageId,
  PageId,
} from '../../../src/domain/common/ids.ts';

console.log('Running PDF invisible text-layer content-stream Tests...');

class MockImageRepo {
  private images = new Map<string, ImageAsset>();
  async save(img: ImageAsset) {
    this.images.set(img.id, img);
  }
  async findById(id: ImageId) {
    return this.images.get(id) ?? null;
  }
}
class MockOCRRepo {
  private ocr = new Map<string, OCRResult>();
  async save(r: OCRResult) {
    this.ocr.set(r.captureId, r);
  }
  async findByCaptureId(id: CaptureId) {
    return this.ocr.get(id) ?? null;
  }
}

/** Decompresses every FlateDecode stream in a PDF and returns the concatenated text. */
function extractDecodedStreams(pdfBytes: Uint8Array): string {
  const buf = Buffer.from(pdfBytes);
  let out = '';
  let idx = 0;
  while (true) {
    const s = buf.indexOf('stream', idx);
    if (s === -1) break;
    // skip past 'stream' + EOL
    let dataStart = s + 6;
    if (buf[dataStart] === 0x0d) dataStart++;
    if (buf[dataStart] === 0x0a) dataStart++;
    const e = buf.indexOf('endstream', dataStart);
    if (e === -1) break;
    const chunk = buf.subarray(dataStart, e);
    try {
      out += zlib.inflateSync(chunk).toString('latin1') + '\n';
    } catch {
      out += chunk.toString('latin1') + '\n';
    }
    idx = e + 9;
  }
  return out;
}

async function run() {
  const imageRepo = new MockImageRepo();
  const ocrRepo = new MockOCRRepo();
  const service = new PdfLibPDFService(imageRepo as any, ocrRepo as any);

  const pngPath = path.resolve('scratch/test_wikipedia_page.png');
  if (!fs.existsSync(pngPath)) {
    console.log('Skipping — scratch/test_wikipedia_page.png not present');
    return;
  }
  const png = fs.readFileSync(pngPath);
  const imgW = png.readUInt32BE(16);
  const imgH = png.readUInt32BE(20);
  assert.ok(imgW > 0 && imgH > 0, 'test PNG has dimensions');

  const imageId = 'img-1' as ImageId;
  await imageRepo.save({
    id: imageId,
    data: new Blob([png], { type: 'image/png' }),
    width: imgW,
    height: imgH,
    mimeType: 'image/png',
    createdAt: Date.now() as any,
  });

  const session: Session = {
    id: 's-1' as SessionId,
    name: 'Text Layer Content Test',
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
  const page = { id: 'p-1' as PageId, sessionId: session.id, imageId, order: 0 } as any;

  // Two lines of words, in image pixel space (top-left origin).
  await ocrRepo.save({
    captureId: page.id,
    status: OCRStatus.COMPLETED,
    fullText: 'Hello searchable world\nSecond line here',
    words: [
      { text: 'Hello', confidence: 96, boundingBox: { x: 100, y: 100, width: 70, height: 22 } },
      { text: 'searchable', confidence: 95, boundingBox: { x: 178, y: 100, width: 150, height: 22 } },
      { text: 'world', confidence: 95, boundingBox: { x: 336, y: 100, width: 74, height: 22 } },
      { text: 'Second', confidence: 94, boundingBox: { x: 100, y: 150, width: 90, height: 22 } },
      { text: 'line', confidence: 94, boundingBox: { x: 198, y: 150, width: 44, height: 22 } },
      { text: 'here', confidence: 94, boundingBox: { x: 250, y: 150, width: 54, height: 22 } },
    ],
    imageWidth: imgW,
    imageHeight: imgH,
    processedImageId: imageId,
  } as any);

  const blob = await service.generate(session, [page]);
  const bytes = new Uint8Array(await blob.arrayBuffer());
  const streams = extractDecodedStreams(bytes);

  // ── Test 1: invisible text render mode 3 is used ──────────────────────────
  assert.ok(/\b3\s+Tr\b/.test(streams), 'content stream sets text render mode 3 (invisible)');
  console.log('✓ Test 1: invisible text render mode (3 Tr) emitted - PASS');

  // ── Test 2: per-word horizontal scaling (Tz) is emitted ───────────────────
  const tzValues = [...streams.matchAll(/([\d.]+)\s+Tz\b/g)].map((m) => parseFloat(m[1]));
  assert.ok(tzValues.length >= 6, `expected >=6 Tz ops (one per word), got ${tzValues.length}`);
  assert.ok(
    tzValues.some((v) => Math.abs(v - 100) > 1),
    'at least one word is actually scaled (Tz != 100)',
  );
  assert.ok(tzValues.every((v) => v >= 10 && v <= 1000), 'all Tz values are within the clamp range');
  console.log(`✓ Test 2: per-word Tz emitted (${tzValues.length} ops) - PASS`);

  // ── Test 3: text is shown, and X positions increase left-to-right per line ─
  const tms = [...streams.matchAll(/1 0 0 1 ([\d.]+) ([\d.]+)\s+Tm/g)].map((m) => ({
    x: parseFloat(m[1]),
    y: parseFloat(m[2]),
  }));
  assert.ok(tms.length >= 6, `expected >=6 text-matrix ops, got ${tms.length}`);

  // Group by y (baseline) -> each line's words must have strictly increasing x.
  const byLine = new Map<number, number[]>();
  for (const { x, y } of tms) {
    const key = Math.round(y);
    if (!byLine.has(key)) byLine.set(key, []);
    byLine.get(key)!.push(x);
  }
  assert.strictEqual(byLine.size, 2, `expected 2 distinct baselines, got ${byLine.size}`);
  for (const [, xs] of byLine) {
    for (let i = 1; i < xs.length; i++) {
      assert.ok(xs[i] > xs[i - 1], `word X positions increase left-to-right (${xs.join(', ')})`);
    }
  }

  // First word of line 1 starts near margin(10) + x(100) = 110.
  const line1Xs = [...byLine.entries()].sort((a, b) => b[0] - a[0])[0][1]; // higher baseline y = top line
  assert.ok(Math.abs(line1Xs[0] - 110) < 1.5, `line 1 first word X ~110, got ${line1Xs[0]}`);
  console.log('✓ Test 3: word text matrices ordered and positioned correctly - PASS');

  // ── Test 4: baseline Y is inside the drawn image area and lines are ordered ─
  const baselines = [...byLine.keys()].sort((a, b) => a - b);
  const margin = 10;
  for (const b of baselines) {
    assert.ok(b > margin && b < imgH + margin, `baseline ${b} within page image area`);
  }
  assert.ok(baselines[1] - baselines[0] > 20, 'the two lines are vertically separated');
  console.log('✓ Test 4: baseline Y placement within image bounds - PASS');

  // ── Test 5: stale OCR emits NO text layer ────────────────────────────────
  await ocrRepo.save({
    captureId: page.id,
    status: OCRStatus.COMPLETED,
    fullText: 'stale',
    words: [{ text: 'stale', confidence: 90, boundingBox: { x: 10, y: 10, width: 40, height: 12 } }],
    imageWidth: imgW,
    imageHeight: imgH,
    processedImageId: 'some-old-image' as ImageId,
  } as any);
  const staleBlob = await service.generate(session, [page]);
  const staleStreams = extractDecodedStreams(new Uint8Array(await staleBlob.arrayBuffer()));
  assert.ok(!/\bTj\b/.test(staleStreams), 'stale OCR must not draw any text');
  console.log('✓ Test 5: stale OCR produces no text layer - PASS');

  console.log('\nAll PDF invisible text-layer content-stream tests passed successfully!');
}

run().catch((e) => {
  console.error('Test failed:', e);
  process.exit(1);
});
