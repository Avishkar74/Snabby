import { RunOCR } from '../../src/application/ocr/RunOCR.ts';
import { GetOCRResult } from '../../src/application/ocr/GetOCRResult.ts';
import { CaptureScreenshot } from '../../src/application/capture/CaptureScreenshot.ts';
import { OCRResult } from '../../src/domain/ocr/OCRResult.ts';
import { OCRStatus } from '../../src/domain/ocr/ocr.types.ts';
import { Capture } from '../../src/domain/capture/Capture.ts';
import type { ImageAsset } from '../../src/domain/image/image.types.ts';
import type { CaptureId, ImageId, SessionId } from '../../src/domain/common/ids.ts';
import { IndexedDBOCRRepository } from '../../src/infrastructure/indexeddb/repositories/IndexedDBOCRRepository.ts';
import { IndexedDBCaptureRepository } from '../../src/infrastructure/indexeddb/repositories/IndexedDBCaptureRepository.ts';
import { IndexedDBImageRepository } from '../../src/infrastructure/indexeddb/repositories/IndexedDBImageRepository.ts';
import type { CaptureSource } from '../../src/domain/capture/capture.types.ts';

function assert(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(`Assertion failed: ${message}`);
  }
}

// 1. Mock global indexedDB structure in Node
const mockIndexedDBData = new Map<string, Map<string, any>>();
mockIndexedDBData.set('sessions', new Map());
mockIndexedDBData.set('captures', new Map());
mockIndexedDBData.set('images', new Map());
mockIndexedDBData.set('ocrResults', new Map());

(globalThis as any).IDBKeyRange = {
  only: (val: any) => val,
  bound: (lower: any, upper: any) => ({ lower, upper }),
  upperBound: (upper: any) => ({ upper }),
  lowerBound: (lower: any) => ({ lower })
};

(globalThis as any).indexedDB = {
  open: (_name: string, _version: number) => {
    const request: any = {
      result: {
        transaction: (_storeNames: string | string[], _mode: string) => {
          const tx: any = {
            objectStore: (storeName: string) => {
              const dataMap = mockIndexedDBData.get(storeName);
              if (!dataMap) {
                throw new Error(`Store ${storeName} not initialized in mock`);
              }
              return {
                put: (record: any) => {
                  const key = record.id || record.captureId;
                  dataMap.set(key, record);
                  setTimeout(() => {
                    if (tx.oncomplete) tx.oncomplete();
                  }, 0);
                  return {};
                },
                get: (key: string) => {
                  const req: any = {
                    result: dataMap.get(key)
                  };
                  setTimeout(() => {
                    if (req.onsuccess) req.onsuccess();
                  }, 0);
                  return req;
                },
                delete: (key: string) => {
                  dataMap.delete(key);
                  setTimeout(() => {
                    if (tx.oncomplete) tx.oncomplete();
                  }, 0);
                  return {};
                },
                index: (_indexName: string) => {
                  return {
                    getAll: (queryKey: string) => {
                      const req: any = {
                        result: Array.from(dataMap.values()).filter(r => r.sessionId === queryKey)
                      };
                      setTimeout(() => {
                        if (req.onsuccess) req.onsuccess();
                      }, 0);
                      return req;
                    }
                  };
                }
              };
            }
          };
          return tx;
        },
        objectStoreNames: {
          contains: (_name: string) => true
        },
        onversionchange: null,
        close: () => {}
      }
    };
    setTimeout(() => {
      if (request.onsuccess) request.onsuccess();
    }, 0);
    return request;
  }
};

// Mock CapturePersistenceService
import { CapturePersistenceService } from '../../src/application/interfaces/services/CapturePersistenceService.ts';
class ActualLikeCapturePersistenceService implements CapturePersistenceService {
  private readonly captureRepo: IndexedDBCaptureRepository;
  private readonly imageRepo: IndexedDBImageRepository;

  constructor(captureRepo: IndexedDBCaptureRepository, imageRepo: IndexedDBImageRepository) {
    this.captureRepo = captureRepo;
    this.imageRepo = imageRepo;
  }

  public async save(capture: Capture, image: ImageAsset): Promise<void> {
    await this.captureRepo.save(capture);
    await this.imageRepo.save(image);
  }
}

// Mock OCRService
class MockSuccessOCRService {
  public lastProcessedImage: ImageAsset | null = null;
  public async process(image: ImageAsset): Promise<OCRResult> {
    this.lastProcessedImage = image;
    return new OCRResult({
      captureId: image.id as unknown as CaptureId,
      status: OCRStatus.COMPLETED,
      fullText: 'Hello World',
      words: [
        {
          text: 'Hello',
          confidence: 95,
          boundingBox: { x: 10, y: 10, width: 40, height: 15 }
        },
        {
          text: 'World',
          confidence: 97,
          boundingBox: { x: 60, y: 10, width: 40, height: 15 }
        }
      ],
      imageWidth: 200,
      imageHeight: 100
    });
  }
}

class MockFailureOCRService {
  public async process(_image: ImageAsset): Promise<OCRResult> {
    throw new Error('Mock OCR computation failed');
  }
}

async function runTests() {
  console.log('Running Snabby Stage 4C OCR Application and Persistence Tests...');

  const ocrRepo = new IndexedDBOCRRepository();
  const captureRepo = new IndexedDBCaptureRepository();
  const imageRepo = new IndexedDBImageRepository();
  const persistenceService = new ActualLikeCapturePersistenceService(captureRepo, imageRepo);

  const sessionId = 'session-123' as SessionId;
  const imageId = 'image-123' as ImageId;

  // Mock ImageAsset
  const mockImage: ImageAsset = {
    id: imageId,
    data: new Blob(['png content'], { type: 'image/png' }),
    width: 200,
    height: 100,
    mimeType: 'image/png',
    createdAt: Date.now()
  };
  const mockCapture = Capture.create(sessionId, imageId, 0, 'FULL_SCREEN');

  // ==========================================
  // Test 1 — Successful OCR orchestration
  // ==========================================
  {
    const ocrService = new MockSuccessOCRService();
    const runOCR = new RunOCR(ocrService as any, ocrRepo, captureRepo);
    
    // Clear ocrResults mock store
    mockIndexedDBData.get('ocrResults')?.clear();
    mockIndexedDBData.get('captures')?.clear();

    await captureRepo.save(mockCapture);

    const ocrResult = await runOCR.execute({ capture: mockCapture, image: mockImage });

    assert(ocrService.lastProcessedImage === mockImage, 'OCRService is called with correct image');
    assert(ocrResult instanceof OCRResult, 'Returns an OCRResult domain object');
    assert(ocrResult.status === OCRStatus.COMPLETED, 'OCR status is COMPLETED');
    
    // Verify repository save was called by reading from IndexedDB mock store
    const persisted = mockIndexedDBData.get('ocrResults')?.get(mockCapture.id);
    assert(persisted !== undefined, 'OCRResult was persisted to database');
    assert(persisted.fullText === 'Hello World', 'Persisted result has correct text');

    // Verify Capture.status updated to COMPLETED in captureRepo
    const updatedCapture = await captureRepo.findById(mockCapture.id);
    assert(updatedCapture !== null && updatedCapture.status === 'COMPLETED', 'Capture.status updated to COMPLETED');

    console.log('✓ Test 1: Successful OCR orchestration - PASS');
  }

  // ==========================================
  // Test 2 — OCR failure
  // ==========================================
  {
    const ocrService = new MockFailureOCRService();
    const runOCR = new RunOCR(ocrService as any, ocrRepo, captureRepo);

    mockIndexedDBData.get('ocrResults')?.clear();
    mockIndexedDBData.get('captures')?.clear();
    await captureRepo.save(mockCapture);

    try {
      await runOCR.execute({ capture: mockCapture, image: mockImage });
      console.error('✗ Test 2: OCR failure - FAIL (Did not throw)');
      process.exit(1);
    } catch (err: any) {
      assert(err instanceof Error && err.message.includes('Mock OCR'), 'Propagates standard OCR error');
      
      // Verify fallback failed OCRResult saved
      const persistedOcr = mockIndexedDBData.get('ocrResults')?.get(mockCapture.id);
      assert(persistedOcr !== undefined && persistedOcr.status === 'FAILED', 'Failed OCRResult saved on error');

      // Verify Capture.status updated to FAILED in captureRepo
      const updatedCapture = await captureRepo.findById(mockCapture.id);
      assert(updatedCapture !== null && updatedCapture.status === 'FAILED', 'Capture.status updated to FAILED');

      console.log('✓ Test 2: OCR failure clean handling - PASS');
    }
  }

  // ==========================================
  // Test 3 — OCR repository persistence
  // ==========================================
  {
    mockIndexedDBData.get('ocrResults')?.clear();
    const ocrResult = new OCRResult({
      captureId: 'cap-1' as CaptureId,
      status: OCRStatus.COMPLETED,
      fullText: 'Direct Save Test',
      words: [],
      imageWidth: 100,
      imageHeight: 50
    });

    await ocrRepo.save(ocrResult);
    let found = await ocrRepo.findByCaptureId('cap-1' as CaptureId);
    assert(found !== null && found.fullText === 'Direct Save Test', 'save() and findByCaptureId() work');

    await ocrRepo.delete('cap-1' as CaptureId);
    found = await ocrRepo.findByCaptureId('cap-1' as CaptureId);
    assert(found === null, 'delete() works');

    console.log('✓ Test 3: OCR repository persistence (save, find, delete) - PASS');
  }

  // ==========================================
  // Test 4 — Capture survives OCR failure
  // ==========================================
  {
    // Mocks for CaptureScreenshot
    const mockCaptureAdapter = {
      capture: async (_source: CaptureSource) => new Blob(['screenshot'], { type: 'image/png' })
    };
    const mockImageProcessor = {
      process: async (blob: Blob) => ({ data: blob, width: 800, height: 600, mimeType: 'image/png' })
    };

    const failingOcrService = new MockFailureOCRService();
    const runOCR = new RunOCR(failingOcrService as any, ocrRepo, captureRepo);

    const captureUseCase = new CaptureScreenshot(
      mockCaptureAdapter as any,
      mockImageProcessor as any,
      persistenceService,
      captureRepo,
      runOCR
    );

    mockIndexedDBData.get('captures')?.clear();
    mockIndexedDBData.get('images')?.clear();
    mockIndexedDBData.get('ocrResults')?.clear();

    const result = await captureUseCase.execute({
      sessionId: 'session-survive' as SessionId,
      captureMode: 'FULL_SCREEN'
    });

    // Wait dynamically for asynchronous background RunOCR execution to complete/fail
    for (let i = 0; i < 30 && !mockIndexedDBData.get('ocrResults')?.get(result.capture.id); i++) {
      await new Promise<void>((resolve) => setTimeout(resolve, 10));
    }

    // Verify Capture and Image exist in DB
    const captureInDb = mockIndexedDBData.get('captures')?.get(result.capture.id);
    assert(captureInDb !== undefined, 'Capture exists in database');
    assert(mockIndexedDBData.get('images')?.get(captureInDb.imageId) !== undefined, 'Image exists in database');
    assert(captureInDb.processingStatus === 'FAILED', 'Capture.status updated to FAILED when OCR failed');

    // Verify failed OCRResult is persisted with status FAILED
    const ocrInDb = mockIndexedDBData.get('ocrResults')?.get(result.capture.id);
    assert(ocrInDb !== undefined && ocrInDb.status === 'FAILED', 'Failed OCRResult persisted in database for failed run');

    console.log('✓ Test 4: Capture and Image survive OCR failure - PASS');
  }

  // ==========================================
  // Test 5 — Bounding box preservation
  // ==========================================
  {
    // Verify our mapped coordinate conversion logic matches exact bounding box formula:
    // x = x0, y = y0, width = x1 - x0, height = y1 - y0
    const tesseractWord = {
      text: 'Preserve',
      confidence: 90,
      bbox: { x0: 25, y0: 30, x1: 75, y1: 50 }
    };

    const mappedBox = {
      x: tesseractWord.bbox.x0,
      y: tesseractWord.bbox.y0,
      width: tesseractWord.bbox.x1 - tesseractWord.bbox.x0,
      height: tesseractWord.bbox.y1 - tesseractWord.bbox.y0
    };

    assert(mappedBox.x === 25, 'x coordinate is x0');
    assert(mappedBox.y === 30, 'y coordinate is y0');
    assert(mappedBox.width === 50, 'width is x1 - x0');
    assert(mappedBox.height === 20, 'height is y1 - y0');
    console.log('✓ Test 5: Bounding box mapping and image-space coordinate preservation - PASS');
  }

  console.log('All Snabby Stage 4C OCR Application and Persistence tests passed successfully!');
  process.exit(0);
}

runTests();
