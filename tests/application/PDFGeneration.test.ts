import { CoordinateMapper } from '../../src/infrastructure/pdf/coordinate/CoordinateMapper.ts';
import { GeneratePDF } from '../../src/application/pdf/GeneratePDF.ts';
import { DownloadPDF } from '../../src/application/pdf/DownloadPDF.ts';
import { PdfLibPDFService } from '../../src/infrastructure/pdf/PdfLibPDFService.ts';
import { OCRStatus } from '../../src/domain/ocr/ocr.types.ts';
import type { Capture } from '../../src/domain/capture/Capture.ts';
import type { Session } from '../../src/domain/session/Session.ts';
import type { ImageAsset } from '../../src/domain/image/image.types.ts';
import type { OCRResult } from '../../src/domain/ocr/OCRResult.ts';
import type { SessionId, CaptureId, ImageId } from '../../src/domain/common/ids.ts';

console.log('Running Snabby Stage 5B PDF & Coordinate Mapping Tests...');

// 1. Test Coordinate Mapper Math
function testCoordinateMapper(): void {
  // Scenario: Image 1000x500 (landscape), centered contain fit on A4 Landscape (842x595) page.
  // scale = min(842/1000, 595/500) = min(0.842, 1.19) = 0.842.
  // renderedWidth = 842, renderedHeight = 421.
  // imgLeft = (842 - 842) / 2 = 0.
  // imgBottom = (595 - 421) / 2 = 87.
  // Target: Word boundingBox = { x: 100, y: 50, width: 200, height: 40 } in image space.
  const mapped = CoordinateMapper.map(
    100,  // x_img
    50,   // y_img
    200,  // w_img
    40,   // h_img
    500,  // imageHeight
    0,    // imgLeft
    87,   // imgBottom
    0.842 // scale
  );

  // Expected calculations:
  // width = 200 * 0.842 = 168.4
  // height = 40 * 0.842 = 33.68
  // x = 0 + (100 * 0.842) = 84.2
  // y = 87 + (500 - 50 - 40) * 0.842 = 87 + 410 * 0.842 = 87 + 345.22 = 432.22
  if (Math.abs(mapped.width - 168.4) > 0.001) {
    throw new Error(`CoordinateMapper width failed: expected 168.4, got ${mapped.width}`);
  }
  if (Math.abs(mapped.height - 33.68) > 0.001) {
    throw new Error(`CoordinateMapper height failed: expected 33.68, got ${mapped.height}`);
  }
  if (Math.abs(mapped.x - 84.2) > 0.001) {
    throw new Error(`CoordinateMapper X failed: expected 84.2, got ${mapped.x}`);
  }
  if (Math.abs(mapped.y - 432.22) > 0.001) {
    throw new Error(`CoordinateMapper Y failed: expected 432.22, got ${mapped.y}`);
  }

  console.log('✓ Test 1: CoordinateMapper top-left to bottom-left PDF conversion math - PASS');
}

// 2. Test PDF Generation and Compilation via mock repositories
class MockImageRepository {
  private images = new Map<string, ImageAsset>();
  public async save(image: ImageAsset): Promise<void> {
    this.images.set(image.id, image);
  }
  public async findById(id: ImageId): Promise<ImageAsset | null> {
    return this.images.get(id) || null;
  }
  public async delete(id: ImageId): Promise<void> {}
}

class MockOCRRepository {
  private ocr = new Map<string, OCRResult>();
  public async save(ocrResult: OCRResult): Promise<void> {
    this.ocr.set(ocrResult.captureId, ocrResult);
  }
  public async findByCaptureId(captureId: CaptureId): Promise<OCRResult | null> {
    return this.ocr.get(captureId) || null;
  }
  public async delete(captureId: CaptureId): Promise<void> {}
}

async function testPdfGenerationAndUsecase(): Promise<void> {
  const imageRepo = new MockImageRepository();
  const ocrRepo = new MockOCRRepository();
  const pdfService = new PdfLibPDFService(imageRepo as any, ocrRepo as any);

  // Seed repositories with dummy PNG data
  // Base64 1x1 transparent pixel PNG
  const base64Png = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAACklEQVR4nGMAAQAABQABDQottAAAAABJRU5ErkJggg==';
  const binaryString = atob(base64Png);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  const imageBlob = new Blob([bytes], { type: 'image/png' });

  const imageId = 'img-123' as ImageId;
  await imageRepo.save({
    id: imageId,
    data: imageBlob,
    createdAt: new Date(),
  });

  const captureId = 'cap-123' as CaptureId;
  const word = {
    text: 'hello',
    confidence: 90,
    boundingBox: { x: 0, y: 0, width: 1, height: 1 }
  };
  await ocrRepo.save({
    captureId,
    status: OCRStatus.COMPLETED,
    fullText: 'hello',
    words: [word],
    imageWidth: 1,
    imageHeight: 1,
  } as any);

  const session: Session = {
    id: 'sess-123' as SessionId,
    name: 'Test Session',
    createdAt: new Date(),
  };

  const capture: Capture = {
    id: captureId,
    sessionId: session.id,
    imageId,
    status: 'COMPLETED',
    order: 0,
    createdAt: new Date(),
  };

  // Compile PDF
  const pdfBlob = await pdfService.generate(session, [capture]);

  if (!(pdfBlob instanceof Blob)) {
    throw new Error('PDFService did not return a Blob instance');
  }
  if (pdfBlob.type !== 'application/pdf') {
    throw new Error(`Expected PDF type 'application/pdf', got: ${pdfBlob.type}`);
  }
  if (pdfBlob.size < 100) {
    throw new Error(`PDF Blob is suspiciously small: ${pdfBlob.size} bytes`);
  }

  console.log(`✓ Test 2: PdfLibPDFService generates valid PDF Blob (${pdfBlob.size} bytes) - PASS`);
}

// 3. Test Download Usecase
class MockDownloadService {
  public lastBlob?: Blob;
  public lastFilename?: string;
  public async download(pdfBlob: Blob, filename: string): Promise<void> {
    this.lastBlob = pdfBlob;
    this.lastFilename = filename;
  }
}

async function testDownloadUsecase(): Promise<void> {
  const downloadService = new MockDownloadService();
  const downloadUsecase = new DownloadPDF(downloadService);

  const pdfBlob = new Blob([new Uint8Array([1, 2, 3])], { type: 'application/pdf' });
  await downloadUsecase.execute({
    pdfBlob,
    filename: 'TestDoc.pdf',
  });

  if (downloadService.lastBlob !== pdfBlob) {
    throw new Error('DownloadPDF did not pass the correct Blob to the download service');
  }
  if (downloadService.lastFilename !== 'TestDoc.pdf') {
    throw new Error('DownloadPDF did not pass the correct filename to the download service');
  }

  console.log('✓ Test 3: DownloadPDF Usecase integrates successfully with technology-independent contract - PASS');
}

// Execute tests
async function runAll() {
  try {
    testCoordinateMapper();
    await testPdfGenerationAndUsecase();
    await testDownloadUsecase();
    console.log('All Snabby PDF Integration tests passed successfully!');
  } catch (err: any) {
    console.error('Test execution failed:', err);
    process.exit(1);
  }
}

runAll();
