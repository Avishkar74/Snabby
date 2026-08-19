import { CaptureScreenshot } from '../../src/application/capture/CaptureScreenshot.ts';
import type { CaptureAdapter } from '../../src/application/interfaces/adapters/CaptureAdapter.ts';
import type { ImageProcessor, ProcessedImage } from '../../src/application/interfaces/services/ImageProcessor.ts';
import type { CapturePersistenceService } from '../../src/application/interfaces/services/CapturePersistenceService.ts';
import type { CaptureRepository } from '../../src/application/interfaces/repositories/CaptureRepository.ts';
import { Capture } from '../../src/domain/capture/Capture.ts';
import type { ImageAsset } from '../../src/domain/image/image.types.ts';
import { ValidationError } from '../../src/domain/common/errors.ts';
import { CaptureError } from '../../src/application/capture/errors.ts';
import { ImageProcessingError } from '../../src/application/capture/errors.ts';
import { DatabaseError } from '../../src/infrastructure/indexeddb/database/DatabaseManager.ts';
import type { CaptureSource, ProcessingStatus } from '../../src/domain/capture/capture.types.ts';
import type { SessionId, CaptureId, ImageId } from '../../src/domain/common/ids.ts';

function assert(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(`Assertion failed: ${message}`);
  }
}

// 1. Mock CaptureAdapter
class MockCaptureAdapter implements CaptureAdapter {
  public lastSourceCalled: CaptureSource | null = null;
  public shouldFail: boolean = false;
  public mockBlob: Blob;

  constructor(mockBlob: Blob) {
    this.mockBlob = mockBlob;
  }

  public async capture(source: CaptureSource): Promise<Blob> {
    this.lastSourceCalled = source;
    if (this.shouldFail) {
      throw new CaptureError('Mock Chrome API failure');
    }
    return this.mockBlob;
  }
}

// 2. Mock ImageProcessor
class MockImageProcessor implements ImageProcessor {
  public lastBlobCalled: Blob | null = null;
  public shouldFail: boolean = false;
  public mockProcessedImage: ProcessedImage;

  constructor(mockProcessedImage: ProcessedImage) {
    this.mockProcessedImage = mockProcessedImage;
  }

  public async process(imageBlob: Blob): Promise<ProcessedImage> {
    this.lastBlobCalled = imageBlob;
    if (this.shouldFail) {
      throw new ImageProcessingError('Mock Image decoding failure');
    }
    return this.mockProcessedImage;
  }
}

// 3. Mock CapturePersistenceService
class MockCapturePersistenceService implements CapturePersistenceService {
  public lastCaptureSaved: Capture | null = null;
  public lastImageSaved: ImageAsset | null = null;
  public shouldFail: boolean = false;

  public async save(capture: Capture, image: ImageAsset): Promise<void> {
    this.lastCaptureSaved = capture;
    this.lastImageSaved = image;
    if (this.shouldFail) {
      throw new DatabaseError('Mock IndexedDB transaction failure');
    }
  }
}

// 4. Mock CaptureRepository
class MockCaptureRepository implements CaptureRepository {
  public existingCaptures: Capture[] = [];

  public async save(capture: Capture): Promise<void> {
    this.existingCaptures.push(capture);
  }

  public async findById(id: CaptureId): Promise<Capture | null> {
    return this.existingCaptures.find(c => c.id === id) || null;
  }

  public async findBySessionId(sessionId: SessionId): Promise<Capture[]> {
    return this.existingCaptures.filter(c => c.sessionId === sessionId);
  }

  public async delete(id: CaptureId): Promise<void> {
    this.existingCaptures = this.existingCaptures.filter(c => c.id !== id);
  }
}

async function runTests() {
  console.log('Running CaptureScreenshot Integrated Unit Tests...');

  const mockRawBlob = new Blob(['Mock raw screenshot bytes'], { type: 'image/png' });
  const mockProcessedBlob = new Blob(['Mock processed image bytes'], { type: 'image/png' });

  const mockProcessedImage: ProcessedImage = {
    data: mockProcessedBlob,
    width: 1920,
    height: 1080,
    mimeType: 'image/png'
  };

  const adapter = new MockCaptureAdapter(mockRawBlob);
  const processor = new MockImageProcessor(mockProcessedImage);
  const persistence = new MockCapturePersistenceService();
  const repository = new MockCaptureRepository();

  const useCase = new CaptureScreenshot(adapter, processor, persistence, repository);
  const sessionId = 'session-uuid' as SessionId;

  // Test 1-8: FULL_SCREEN succeeds, routing inputs, generating IDs, order, and referencing image asset
  try {
    // Prime the repository with 2 existing captures to verify ordering count (should return order = 2)
    repository.existingCaptures = [
      Capture.create(sessionId, 'image-1' as ImageId, 0),
      Capture.create(sessionId, 'image-2' as ImageId, 1)
    ];

    const result = await useCase.execute({
      sessionId,
      captureMode: 'FULL_SCREEN'
    });

    const capture = result.capture;

    // Test 1: FULL_SCREEN succeeds and returns Capture entity
    assert(capture instanceof Capture, 'Returns a Capture entity');
    assert(capture.sessionId === sessionId, 'Test 5: Capture receives correct sessionId');
    assert(capture.status === 'PENDING', 'Capture starts in PENDING status');
    console.log('✓ Test 1 & 5: FULL_SCREEN capture success and status is PENDING - PASS');

    // Test 2: CaptureAdapter receives FULL_SCREEN
    assert(adapter.lastSourceCalled === 'FULL_SCREEN', 'CaptureAdapter received FULL_SCREEN source');
    console.log('✓ Test 2: CaptureAdapter input routing - PASS');

    // Test 3: ImageProcessor receives the acquired screenshot Blob
    assert(processor.lastBlobCalled === mockRawBlob, 'ImageProcessor received raw captured Blob');
    console.log('✓ Test 3: ImageProcessor input routing - PASS');

    // Test 4: ImageId is generated
    assert(typeof capture.imageId === 'string' && capture.imageId.length > 0, 'ImageId is generated');
    console.log('✓ Test 4: ImageId generation - PASS');

    // Test 6: Capture.imageId equals ImageAsset.id
    assert(persistence.lastImageSaved !== null, 'Persistence service saved the ImageAsset');
    assert(capture.imageId === persistence.lastImageSaved?.id, 'Capture references ImageAsset.id');
    console.log('✓ Test 6: Foreign key referencing - PASS');

    // Test 7: Order is appended correctly
    assert(capture.order === 2, 'Calculates order as appended index length (2)');
    console.log('✓ Test 7: Capture ordering index count - PASS');

    // Test 8: Persistence receives Capture + ImageAsset
    assert(persistence.lastCaptureSaved === capture, 'Persistence received the correct Capture');
    assert(persistence.lastImageSaved?.data === mockProcessedBlob, 'Persistence received the correct ImageAsset data Blob');
    console.log('✓ Test 8: Persistence boundary inputs verification - PASS');

  } catch (err: unknown) {
    console.error('✗ Test 1-8 Execution - FAIL');
    console.error(err);
    process.exit(1);
  }

  // Test 9: Persistence failure propagates as DatabaseError
  try {
    persistence.shouldFail = true;
    await useCase.execute({
      sessionId,
      captureMode: 'FULL_SCREEN'
    });
    console.error('✗ Test 9: Persistence failure propagation - FAIL (Did not throw)');
    process.exit(1);
  } catch (err: unknown) {
    assert(err instanceof DatabaseError, 'Throws DatabaseError');
    assert(err instanceof Error && err.message.includes('transaction failure'), 'Message contains failure description');
    console.log('✓ Test 9: Persistence failure propagation - PASS');
  } finally {
    persistence.shouldFail = false;
  }

  // Test 10: CROP_REGION succeeds
  try {
    const result = await useCase.execute({
      sessionId,
      captureMode: 'CROP_REGION'
    });
    assert(result.capture instanceof Capture, 'Returns a Capture entity for CROP_REGION');
    assert(adapter.lastSourceCalled === 'CROP_REGION', 'CaptureAdapter received CROP_REGION source');
    console.log('✓ Test 10: CROP_REGION execution - PASS');
  } catch (err: unknown) {
    console.error('✗ Test 10: CROP_REGION execution - FAIL');
    console.error(err);
    process.exit(1);
  }

  console.log('All Snabby Capture Stage 3 Unit Tests passed successfully!');
}

runTests();
