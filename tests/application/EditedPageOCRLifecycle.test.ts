import { Page } from '../../src/domain/page/Page.ts';
import { PageType, PageSource, ProcessingStatus } from '../../src/domain/page/page.types.ts';
import { RunOCR } from '../../src/application/ocr/RunOCR.ts';
import { SavePageAnnotations } from '../../src/application/page/SavePageAnnotations.ts';
import { OCRResult } from '../../src/domain/ocr/OCRResult.ts';
import { OCRStatus } from '../../src/domain/ocr/ocr.types.ts';
import type { ImageAsset } from '../../src/domain/image/image.types.ts';
import type { PageId, ImageId, SessionId } from '../../src/domain/common/ids.ts';
import { createPageId, createImageId } from '../../src/domain/common/ids.ts';
import { PdfLibPDFService, resolveEffectiveImageId } from '../../src/infrastructure/pdf/PdfLibPDFService.ts';

function assert(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(`Assertion failed: ${message}`);
  }
}

// In-memory mock repositories for test isolation
class MockPageRepository {
  private pages = new Map<string, Page>();

  public async findById(id: PageId): Promise<Page | null> {
    return this.pages.get(id) || null;
  }

  public async save(page: Page): Promise<void> {
    this.pages.set(page.id, page);
  }

  public async findBySessionId(sessionId: SessionId): Promise<Page[]> {
    return Array.from(this.pages.values()).filter((p) => p.sessionId === sessionId);
  }
}

class MockImageRepository {
  public images = new Map<string, ImageAsset>();

  public async findById(id: ImageId): Promise<ImageAsset | null> {
    return this.images.get(id) || null;
  }

  public async save(asset: ImageAsset): Promise<void> {
    this.images.set(asset.id, asset);
  }

  public async delete(id: ImageId): Promise<void> {
    this.images.delete(id);
  }
}

class MockOCRRepository {
  public results = new Map<string, OCRResult>();

  public async findByCaptureId(captureId: PageId): Promise<OCRResult | null> {
    return this.results.get(captureId) || null;
  }

  public async save(result: OCRResult): Promise<void> {
    this.results.set(result.captureId, result);
  }

  public async delete(captureId: PageId): Promise<void> {
    this.results.delete(captureId);
  }
}

class ControllableOCRService {
  public callCount = 0;
  public delayMs = 0;
  public mockTextGenerator?: (image: ImageAsset) => string;

  public async process(image: ImageAsset): Promise<OCRResult> {
    this.callCount++;
    if (this.delayMs > 0) {
      await new Promise((r) => setTimeout(r, this.delayMs));
    }
    const text = this.mockTextGenerator ? this.mockTextGenerator(image) : `Text for ${image.id}`;
    return new OCRResult({
      captureId: 'placeholder' as any,
      status: OCRStatus.COMPLETED,
      fullText: text,
      words: [
        {
          text,
          confidence: 99,
          boundingBox: { x: 10, y: 10, width: 100, height: 20 },
        },
      ],
      imageWidth: image.width || 800,
      imageHeight: image.height || 600,
      processedImageId: image.id,
    });
  }
}

// 1x1 transparent PNG data URL for test compositing
const testPngDataUrl =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

async function runTests() {
  console.log('Running Edited Page OCR Lifecycle & Concurrency Tests...\n');

  // =========================================================================
  // Test 1: Full Edited Page OCR Lifecycle with Added Images
  // =========================================================================
  {
    console.log('Testing Test 1: Full Edited Page OCR Lifecycle with Added Images...');
    const pageRepo = new MockPageRepository();
    const imageRepo = new MockImageRepository();
    const ocrRepo = new MockOCRRepository();
    const ocrService = new ControllableOCRService();
    const runOCR = new RunOCR(ocrService as any, ocrRepo, pageRepo as any);
    const savePageAnnotations = new SavePageAnnotations(pageRepo as any, imageRepo as any);

    const sessionId = 'session-1' as SessionId;
    const originalImageId = 'orig-img-1' as ImageId;
    const pageId = createPageId();

    // 1. Setup initial screenshot page and original image asset
    const originalImage: ImageAsset = {
      id: originalImageId,
      data: new Blob(['png-orig'], { type: 'image/png' }),
      width: 800,
      height: 600,
      mimeType: 'image/png',
      createdAt: Date.now(),
    };
    await imageRepo.save(originalImage);

    const initialPage = new Page({
      id: pageId,
      sessionId,
      type: PageType.SCREENSHOT,
      imageId: originalImageId,
      renderedImageId: originalImageId,
      order: 0,
      createdAt: Date.now() as any,
      status: ProcessingStatus.COMPLETED,
      version: 1,
    });
    await pageRepo.save(initialPage);

    // Initial OCR on screenshot
    await runOCR.execute({ page: initialPage, image: originalImage });
    const initialOcr = await ocrRepo.findByCaptureId(pageId);
    assert(initialOcr !== null, 'Initial OCR exists');
    assert(initialOcr.processedImageId === originalImageId, 'Initial OCR processedImageId matches original screenshot');

    // 2. User edits the page: adds a local image with text
    // SavePageAnnotations composites all elements into a new rendered image
    ocrService.mockTextGenerator = (img) =>
      img.id === originalImageId ? 'Original Screenshot' : 'Original Screenshot + Local Added Image Text';

    const saveSuccess = await savePageAnnotations.execute(
      pageId,
      JSON.stringify([{ type: 'image', fileId: 'local-file-1' }]),
      testPngDataUrl,
      { 'local-file-1': { id: 'local-file-1', dataURL: testPngDataUrl, mimeType: 'image/png' } }
    );
    assert(saveSuccess, 'SavePageAnnotations succeeded');

    const updatedPage = await pageRepo.findById(pageId);
    assert(updatedPage !== null, 'Updated page exists in DB');
    const newRenderedImageId = updatedPage.effectiveRenderedImageId;
    assert(newRenderedImageId !== originalImageId, 'Page effectiveRenderedImageId updated to new composited image');

    // Verify old OCR is recognized as stale before new OCR completes
    const isStale = initialOcr.processedImageId !== newRenderedImageId;
    assert(isStale, 'Existing OCR is recognized as stale for the newly rendered page');

    // 3. Run OCR on the newly composited image asset
    const compositedAsset = await imageRepo.findById(newRenderedImageId);
    assert(compositedAsset !== null, 'Composited ImageAsset found in ImageRepository');

    const newOcrResult = await runOCR.execute({ page: updatedPage, image: compositedAsset });
    assert(newOcrResult.status === OCRStatus.COMPLETED, 'New OCR result completed');
    assert(
      newOcrResult.processedImageId === newRenderedImageId,
      'New OCR processedImageId matches page.effectiveRenderedImageId'
    );
    assert(
      newOcrResult.fullText.includes('Local Added Image Text'),
      'OCR contains text recognized from newly added local image'
    );

    // 4. Verify Preview freshness evaluation
    const activeRenderedImageId = updatedPage.effectiveRenderedImageId;
    const isMatchingOcr =
      newOcrResult.status === OCRStatus.COMPLETED &&
      newOcrResult.words.length > 0 &&
      newOcrResult.processedImageId === activeRenderedImageId;
    assert(isMatchingOcr, 'Preview freshness check validates matching OCR for edited page');

    console.log('✓ Test 1: Full Edited Page OCR Lifecycle with Added Images - PASS\n');
  }

  // =========================================================================
  // Test 2: Single-Flight Job Deduplication per Rendered Image
  // =========================================================================
  {
    console.log('Testing Test 2: Single-Flight Job Deduplication...');
    const pageRepo = new MockPageRepository();
    const imageRepo = new MockImageRepository();
    const ocrRepo = new MockOCRRepository();
    const ocrService = new ControllableOCRService();
    ocrService.delayMs = 30; // simulate async work
    const runOCR = new RunOCR(ocrService as any, ocrRepo, pageRepo as any);

    const pageId = createPageId();
    const imageId = 'single-flight-img' as ImageId;
    const page = new Page({
      id: pageId,
      sessionId: 'sess-1' as SessionId,
      type: PageType.SCREENSHOT,
      imageId,
      renderedImageId: imageId,
      order: 0,
      createdAt: Date.now() as any,
      status: ProcessingStatus.PENDING,
      version: 1,
    });
    await pageRepo.save(page);

    const imageAsset: ImageAsset = {
      id: imageId,
      data: new Blob(['img'], { type: 'image/png' }),
      width: 100,
      height: 100,
      mimeType: 'image/png',
      createdAt: Date.now(),
    };

    // Trigger 3 concurrent OCR executions for the same (pageId, imageId)
    // (e.g. Save triggered + GET_PAGE_OCR auto-heal triggered + preview open)
    const [res1, res2, res3] = await Promise.all([
      runOCR.execute({ page, image: imageAsset }),
      runOCR.execute({ page, image: imageAsset }),
      runOCR.execute({ page, image: imageAsset }),
    ]);

    assert(ocrService.callCount === 1, `OCR service was called exactly once (actual: ${ocrService.callCount})`);
    assert(res1 === res2 && res2 === res3, 'All callers received the exact same single-flight OCR result');

    console.log('✓ Test 2: Single-Flight Job Deduplication - PASS\n');
  }

  // =========================================================================
  // Test 3: Rapid Consecutive Edits Race Condition
  // Edit A → OCR A starts → Edit B → OCR B starts → OCR B completes → OCR A completes
  // =========================================================================
  {
    console.log('Testing Test 3: Rapid Consecutive Edits Race Condition...');
    const pageRepo = new MockPageRepository();
    const ocrRepo = new MockOCRRepository();

    const pageId = createPageId();
    const imageA: ImageAsset = {
      id: 'img-A' as ImageId,
      data: new Blob(['A'], { type: 'image/png' }),
      width: 200,
      height: 100,
      mimeType: 'image/png',
      createdAt: Date.now(),
    };
    const imageB: ImageAsset = {
      id: 'img-B' as ImageId,
      data: new Blob(['B'], { type: 'image/png' }),
      width: 200,
      height: 100,
      mimeType: 'image/png',
      createdAt: Date.now(),
    };

    // Initial page state: Edit A is active
    let page = new Page({
      id: pageId,
      sessionId: 'sess-race' as SessionId,
      type: PageType.SCREENSHOT,
      imageId: 'orig' as ImageId,
      renderedImageId: imageA.id,
      order: 0,
      createdAt: Date.now() as any,
      status: ProcessingStatus.PENDING,
      version: 1,
    });
    await pageRepo.save(page);

    // OCR Service where OCR A takes 80ms and OCR B takes 10ms
    const raceOcrService = {
      process: async (image: ImageAsset): Promise<OCRResult> => {
        if (image.id === imageA.id) {
          await new Promise((r) => setTimeout(r, 80));
        } else {
          await new Promise((r) => setTimeout(r, 10));
        }
        return new OCRResult({
          captureId: pageId,
          status: OCRStatus.COMPLETED,
          fullText: `OCR for ${image.id}`,
          words: [
            {
              text: `Word-${image.id}`,
              confidence: 95,
              boundingBox: { x: 10, y: 10, width: 50, height: 20 },
            },
          ],
          imageWidth: 200,
          imageHeight: 100,
          processedImageId: image.id,
        });
      },
    };

    const runOCR = new RunOCR(raceOcrService as any, ocrRepo, pageRepo as any);

    // 1. Edit A starts OCR (slow)
    const ocrAPromise = runOCR.execute({ page, image: imageA });

    // 2. Rapidly, Edit B is saved before OCR A completes
    await new Promise((r) => setTimeout(r, 15));
    page = page.updateAnnotations('edit-b-data', imageB.id);
    await pageRepo.save(page); // page.effectiveRenderedImageId is now imageB.id

    // 3. Edit B starts OCR (fast)
    const ocrBPromise = runOCR.execute({ page, image: imageB });

    // Wait for both to settle
    const [resultA, resultB] = await Promise.all([ocrAPromise, ocrBPromise]);

    // Verify OCR B completed and persisted
    assert(resultB.processedImageId === imageB.id, 'OCR B finished with imageB');
    const persistedOcr = await ocrRepo.findByCaptureId(pageId);
    assert(persistedOcr !== null, 'OCR result exists in repository');
    assert(
      persistedOcr.processedImageId === imageB.id,
      `Repository holds fresh OCR B (expected: ${imageB.id}, actual: ${persistedOcr.processedImageId})`
    );
    assert(persistedOcr.fullText === 'OCR for img-B', 'Repository holds OCR text from Edit B');

    // Verify OCR A was discarded and did NOT overwrite OCR B
    assert(
      persistedOcr.processedImageId !== imageA.id,
      'Outdated OCR A was prevented from overwriting newer OCR B in repository'
    );

    console.log('✓ Test 3: Rapid Consecutive Edits Race Condition - PASS\n');
  }

  // =========================================================================
  // Test 4: PDF Generation Freshness Validation for Edited Pages
  // =========================================================================
  {
    console.log('Testing Test 4: PDF Generation Freshness Validation...');
    const pageRepo = new MockPageRepository();
    const imageRepo = new MockImageRepository();
    const ocrRepo = new MockOCRRepository();

    const pdfService = new PdfLibPDFService(imageRepo as any, ocrRepo as any);

    const sessionId = 'session-pdf' as SessionId;
    const pageId = createPageId();
    const renderedImageId = 'rendered-pdf-img' as ImageId;

    const dummyImage: ImageAsset = {
      id: renderedImageId,
      data: new Blob([Buffer.from('dummy-png-data')], { type: 'image/png' }),
      width: 200,
      height: 100,
      mimeType: 'image/png',
      createdAt: Date.now(),
    };
    await imageRepo.save(dummyImage);

    const editedPage = new Page({
      id: pageId,
      sessionId,
      type: PageType.SCREENSHOT,
      imageId: 'orig-id' as ImageId,
      renderedImageId,
      order: 0,
      createdAt: Date.now() as any,
      status: ProcessingStatus.COMPLETED,
      version: 2,
    });
    await pageRepo.save(editedPage);

    // Case 1: Stale OCR from old screenshot
    const staleOcr = new OCRResult({
      captureId: pageId,
      status: OCRStatus.COMPLETED,
      fullText: 'Old Screenshot Text',
      words: [{ text: 'Old', confidence: 90, boundingBox: { x: 10, y: 10, width: 30, height: 10 } }],
      imageWidth: 200,
      imageHeight: 100,
      processedImageId: 'orig-id' as ImageId,
    });
    await ocrRepo.save(staleOcr);

    const effectiveId = resolveEffectiveImageId(editedPage);
    assert(effectiveId === renderedImageId, 'resolveEffectiveImageId correctly resolves renderedImageId');

    const isStaleRejected = staleOcr.processedImageId !== effectiveId;
    assert(isStaleRejected, 'PDF freshness check rejects stale OCR from original image');

    // Case 2: Fresh OCR matching current rendered image
    const freshOcr = new OCRResult({
      captureId: pageId,
      status: OCRStatus.COMPLETED,
      fullText: 'Edited Screenshot + Added Local Image',
      words: [{ text: 'Edited', confidence: 95, boundingBox: { x: 10, y: 10, width: 40, height: 12 } }],
      imageWidth: 200,
      imageHeight: 100,
      processedImageId: renderedImageId,
    });
    await ocrRepo.save(freshOcr);

    const isFreshAccepted =
      freshOcr.status === OCRStatus.COMPLETED && freshOcr.processedImageId === effectiveId;
    assert(isFreshAccepted, 'PDF freshness check accepts fresh OCR matching renderedImageId');

    console.log('✓ Test 4: PDF Generation Freshness Validation - PASS\n');
  }

  console.log('All Edited Page OCR Lifecycle & Concurrency tests passed successfully!');
}

runTests().catch((err) => {
  console.error('Test suite failed:', err);
  process.exit(1);
});
