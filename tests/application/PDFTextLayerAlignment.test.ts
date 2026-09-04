import { PDFDocument, StandardFonts } from 'pdf-lib';
import {
  CoordinateMapper,
  type SourceImageRect,
  type TargetEmbeddedImageRect,
  type BoundingBox2D,
} from '../../src/infrastructure/pdf/coordinate/CoordinateMapper.ts';
import {
  PdfLibPDFService,
  resolveEffectiveImageId,
} from '../../src/infrastructure/pdf/PdfLibPDFService.ts';
import { OCRStatus } from '../../src/domain/ocr/ocr.types.ts';
import type { OCRResult } from '../../src/domain/ocr/OCRResult.ts';
import type { ImageAsset } from '../../src/domain/image/image.types.ts';
import type { Session } from '../../domain/session/Session.ts';
import type { SessionId, CaptureId, ImageId, PageId } from '../../src/domain/common/ids.ts';

console.log('Running PDF OCR Text Layer Alignment & Freshness Tests...');

// 1. Test 2D Rectangle Mapping with Non-Uniform Scaling and Margins
function test2DRectangleMapping(): void {
  const source: SourceImageRect = { width: 1000, height: 500 };
  const target: TargetEmbeddedImageRect = { x: 10, y: 15, width: 800, height: 600 };
  const box: BoundingBox2D = { x: 100, y: 50, width: 200, height: 40 };

  // Expected:
  // scaleX = 800 / 1000 = 0.8
  // scaleY = 600 / 500 = 1.2
  // pdfX = 10 + (100 * 0.8) = 90
  // pdfWidth = 200 * 0.8 = 160
  // pdfHeight = 40 * 1.2 = 48
  // pdfYBottom = 15 + 600 - ((50 + 40) * 1.2) = 615 - (90 * 1.2) = 615 - 108 = 507
  const result = CoordinateMapper.mapRect(box, source, target);

  if (Math.abs(result.pdfX - 90) > 0.001) {
    throw new Error(`mapRect pdfX failed: expected 90, got ${result.pdfX}`);
  }
  if (Math.abs(result.pdfWidth - 160) > 0.001) {
    throw new Error(`mapRect pdfWidth failed: expected 160, got ${result.pdfWidth}`);
  }
  if (Math.abs(result.pdfHeight - 48) > 0.001) {
    throw new Error(`mapRect pdfHeight failed: expected 48, got ${result.pdfHeight}`);
  }
  if (Math.abs(result.pdfYBottom - 507) > 0.001) {
    throw new Error(`mapRect pdfYBottom failed: expected 507, got ${result.pdfYBottom}`);
  }

  console.log('✓ Test 1: 2D non-uniform scale mapping and margins - PASS');
}

// 2. Test Verified Font Placement and Explicit Positive Descender Magnitude
async function testFontPlacementMetrics(): Promise<void> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);

  const pdfWidth = 100;
  const pdfHeight = 20;
  const pdfYBottom = 200;

  const placement = CoordinateMapper.calculateFontPlacement(
    font,
    'Record',
    pdfWidth,
    pdfHeight,
    pdfYBottom
  );

  // Semantics:
  // 1. fontSize is positive and initialized via font.sizeAtHeight
  if (placement.fontSize <= 0) {
    throw new Error(`calculateFontPlacement fontSize must be positive: got ${placement.fontSize}`);
  }
  // 2. descenderMagnitude is explicitly positive
  if (placement.descenderMagnitude <= 0) {
    throw new Error(`calculateFontPlacement descenderMagnitude must be positive: got ${placement.descenderMagnitude}`);
  }
  // 3. baselineY is pdfYBottom + descenderMagnitude
  if (Math.abs(placement.baselineY - (pdfYBottom + placement.descenderMagnitude)) > 0.001) {
    throw new Error(`calculateFontPlacement baselineY mismatch: got ${placement.baselineY}`);
  }
  // 4. Horizontal scale is positive and bounded
  if (placement.horizontalScale < 10 || placement.horizontalScale > 500) {
    throw new Error(`calculateFontPlacement horizontalScale out of bounds: got ${placement.horizontalScale}`);
  }

  console.log('✓ Test 2: Font metrics baseline calculation and explicit positive descender - PASS');
}

// 3. Test Typed Effective Image ID Resolution
function testResolveEffectiveImageId(): void {
  // Scenario A: Page class instance with getter
  class MockPageInstance {
    public id = 'p1' as PageId;
    public imageId = 'img-orig' as ImageId;
    public renderedImageId = 'img-rendered' as ImageId;
    public get effectiveRenderedImageId(): ImageId {
      return this.renderedImageId || this.imageId;
    }
  }
  const pageInstance = new MockPageInstance() as any;
  if (resolveEffectiveImageId(pageInstance) !== 'img-rendered') {
    throw new Error(`resolveEffectiveImageId failed for class instance: expected img-rendered, got ${resolveEffectiveImageId(pageInstance)}`);
  }

  // Scenario B: Plain deserialized object with renderedImageId
  const plainWithRendered = {
    id: 'p2' as PageId,
    imageId: 'img-orig' as ImageId,
    renderedImageId: 'img-rendered-plain' as ImageId,
  };
  if (resolveEffectiveImageId(plainWithRendered as any) !== 'img-rendered-plain') {
    throw new Error(`resolveEffectiveImageId failed for plain object with renderedImageId: expected img-rendered-plain, got ${resolveEffectiveImageId(plainWithRendered as any)}`);
  }

  // Scenario C: Plain deserialized object without renderedImageId (falls back to imageId)
  const plainWithoutRendered = {
    id: 'p3' as PageId,
    imageId: 'img-orig-only' as ImageId,
  };
  if (resolveEffectiveImageId(plainWithoutRendered as any) !== 'img-orig-only') {
    throw new Error(`resolveEffectiveImageId failed for plain object fallback: expected img-orig-only, got ${resolveEffectiveImageId(plainWithoutRendered as any)}`);
  }

  console.log('✓ Test 3: Typed effective image ID resolution across class instances and plain objects - PASS');
}

// 4. Test OCR Freshness Validation (Cases A through E)
class MockImageRepo {
  private images = new Map<string, ImageAsset>();
  public async save(img: ImageAsset): Promise<void> {
    this.images.set(img.id, img);
  }
  public async findById(id: ImageId): Promise<ImageAsset | null> {
    return this.images.get(id) || null;
  }
}

class MockOCRRepo {
  private ocr = new Map<string, OCRResult>();
  public async save(result: OCRResult): Promise<void> {
    this.ocr.set(result.captureId, result);
  }
  public async findByCaptureId(captureId: CaptureId): Promise<OCRResult | null> {
    return this.ocr.get(captureId) || null;
  }
}

function createDummyPngBlob(): Blob {
  const base64Png = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAACklEQVR4nGMAAQAABQABDQottAAAAABJRU5ErkJggg==';
  const binaryString = atob(base64Png);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return new Blob([bytes], { type: 'image/png' });
}

async function testOCRFreshnessScenarios(): Promise<void> {
  const imageRepo = new MockImageRepo();
  const ocrRepo = new MockOCRRepo();
  const pdfService = new PdfLibPDFService(imageRepo as any, ocrRepo as any);

  const session: Session = {
    id: 'sess-1' as SessionId,
    name: 'Freshness Test Session',
    createdAt: new Date(),
  };

  const imageId = 'img-100' as ImageId;
  await imageRepo.save({
    id: imageId,
    data: createDummyPngBlob(),
    width: 100,
    height: 100,
    mimeType: 'image/png',
    createdAt: Date.now() as any,
  });

  const page = {
    id: 'p-1' as PageId,
    sessionId: session.id,
    imageId,
    order: 0,
  } as any;

  // Case A: Fresh completed OCR with words -> Generates PDF with OCR layer
  await ocrRepo.save({
    captureId: page.id,
    status: OCRStatus.COMPLETED,
    fullText: 'Fresh text',
    words: [
      { text: 'Fresh', confidence: 95, boundingBox: { x: 10, y: 10, width: 30, height: 12 } },
      { text: 'text', confidence: 95, boundingBox: { x: 45, y: 10, width: 25, height: 12 } },
    ],
    imageWidth: 100,
    imageHeight: 100,
    processedImageId: imageId,
  } as any);

  const pdfFresh = await pdfService.generate(session, [page]);
  if (!(pdfFresh instanceof Blob) || pdfFresh.size < 500) {
    throw new Error('Case A: Fresh OCR PDF generation failed');
  }

  // Case B: Valid completed OCR with ZERO words (e.g. blank custom page, scribble only) -> Must succeed without error
  await ocrRepo.save({
    captureId: page.id,
    status: OCRStatus.COMPLETED,
    fullText: '',
    words: [],
    imageWidth: 100,
    imageHeight: 100,
    processedImageId: imageId,
  } as any);

  const pdfZeroWords = await pdfService.generate(session, [page]);
  if (!(pdfZeroWords instanceof Blob) || pdfZeroWords.size < 500) {
    throw new Error('Case B: Valid zero-word OCR PDF generation failed');
  }

  // Case C: Stale OCR (processedImageId does NOT match effective imageId) -> Must generate PDF cleanly without stale OCR
  await ocrRepo.save({
    captureId: page.id,
    status: OCRStatus.COMPLETED,
    fullText: 'Stale text from old image',
    words: [{ text: 'Stale', confidence: 90, boundingBox: { x: 5, y: 5, width: 20, height: 10 } }],
    imageWidth: 100,
    imageHeight: 100,
    processedImageId: 'old-stale-image-id' as ImageId,
  } as any);

  const pdfStale = await pdfService.generate(session, [page]);
  if (!(pdfStale instanceof Blob) || pdfStale.size < 500) {
    throw new Error('Case C: Stale OCR fallback PDF generation failed');
  }

  // Case D: OCR is PROCESSING -> Must generate PDF cleanly without OCR
  await ocrRepo.save({
    captureId: page.id,
    status: OCRStatus.PROCESSING,
    fullText: '',
    words: [],
    imageWidth: 100,
    imageHeight: 100,
    processedImageId: imageId,
  } as any);

  const pdfProcessing = await pdfService.generate(session, [page]);
  if (!(pdfProcessing instanceof Blob) || pdfProcessing.size < 500) {
    throw new Error('Case D: Processing OCR fallback PDF generation failed');
  }

  // Case E: OCR is FAILED -> Must generate PDF cleanly without OCR
  await ocrRepo.save({
    captureId: page.id,
    status: OCRStatus.FAILED,
    fullText: '',
    words: [],
    imageWidth: 100,
    imageHeight: 100,
    processedImageId: imageId,
  } as any);

  const pdfFailed = await pdfService.generate(session, [page]);
  if (!(pdfFailed instanceof Blob) || pdfFailed.size < 500) {
    throw new Error('Case E: Failed OCR fallback PDF generation failed');
  }

  console.log('✓ Test 4: OCR freshness validation (fresh, zero-word, stale, processing, failed) - PASS');
}

// Execute all test suites
async function run() {
  try {
    test2DRectangleMapping();
    await testFontPlacementMetrics();
    testResolveEffectiveImageId();
    await testOCRFreshnessScenarios();
    console.log('\nAll PDF OCR Text Layer Alignment & Freshness tests passed successfully!');
  } catch (e: any) {
    console.error('Test failed:', e);
    process.exit(1);
  }
}

run();
